"""Block-level crosswalk from ACS block groups to WFRC areas.

A block belongs to an area when its internal point falls inside the area polygon. ACS block group
values are then split between areas by each area's share of the block group's Decennial block counts
(people, households or housing units, depending on the table). The shares, and how much of each area
rests on whole block groups (the alignment score), are the tracked outputs.
"""
from __future__ import annotations

import duckdb

from . import decennial, tiger
from .db import connect, sql_path, write_parquet
from .paths import BOUNDARIES, DATA, META, RAW
from .util import load_config, update_manifest

DERIVED = RAW / "derived"

# For each weight, the columns tried in order when a block group has none of the preferred count
# (for example a block group with new housing since the Decennial). Land area is the last resort.
WEIGHTS = {"pop": ["pop", "hu", "aland"], "hh": ["hh", "hu", "pop", "aland"], "hu": ["hu", "pop", "aland"]}


def era_of(vintage: int, cfg: dict | None = None) -> int:
    cfg = cfg or load_config()
    return 2020 if vintage >= cfg["crosswalk"]["era_boundary"] else 2010


def eras_needed(cfg: dict | None = None) -> list[int]:
    cfg = cfg or load_config()
    return sorted({era_of(v, cfg) for v in cfg["acs"]["vintages"]})


def load_blocks(con: duckdb.DuckDBPyConnection, era: int, refresh: bool = False) -> str:
    """Create table blocks_<era> (block, bg, aland, pop, hu, hh, geom) from TIGER points and Decennial counts."""
    cfg = load_config()
    abbr = cfg["state"]["abbr"]
    fips = tiger.county_fips(abbr, cfg["tiger"]["audit_year"])
    points = tiger.blocks(abbr, cfg["decennial"][era]["tiger_year"], fips, refresh)
    con.register(f"weights_{era}", decennial.block_weights(era, refresh))
    table = f"blocks_{era}"
    con.execute(f"""
        CREATE OR REPLACE TABLE {table} AS
        SELECT p.block, left(p.block, 12) AS bg, p.aland, w.pop, w.hu, w.hh, p.geometry::GEOMETRY AS geom
        FROM read_parquet('{sql_path(points)}') p JOIN weights_{era} w USING (block)
    """)
    n_points = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(points)}')").fetchone()[0]
    n = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    if n != n_points or n != len(con.table(f"weights_{era}")):
        raise RuntimeError(f"{era} blocks and Decennial counts do not match one-to-one "
                           f"(points {n_points}, joined {n})")
    return table


def custom_areas_sql() -> str:
    """Query of every WFRC area polygon (geo_id, geometry), read from the tracked boundary snapshots."""
    layers = load_config()["arcgis"]["layers"]
    return " UNION ALL ".join(
        f"SELECT geo_id, geometry::GEOMETRY AS geometry FROM read_parquet('{sql_path(BOUNDARIES / (t + '.parquet'))}')"
        for t in layers)


def assign(con: duckdb.DuckDBPyConnection, blocks: str, areas_sql: str, out: str) -> str:
    """Table `out` (block, geo_id): every block whose internal point is inside an area. A block can
    appear under several areas only where areas overlap."""
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        SELECT b.block, a.geo_id FROM {blocks} b JOIN ({areas_sql}) a ON ST_Within(b.geom, a.geometry)
    """)
    return out


UNITS = {"bg": 12, "tract": 11}   # leading digits of a block id that name its block group / tract


def shares(con: duckdb.DuckDBPyConnection, blocks: str, block_area: str, out: str) -> str:
    """Table `out` (geo_id, unit, unit_id, weight, share, basis, w_in, n_in, n): the share of each Census unit
    (block group, or tract for tables the Census does not publish at block group), per weight kind, that lies
    inside each area; `basis` is the count actually used after any fallback."""
    selects = []
    for unit, digits in UNITS.items():
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {out}_{unit}_tot AS
            SELECT left(block, {digits}) AS unit_id, count(*) AS n, sum(pop) AS pop, sum(hu) AS hu, sum(hh) AS hh,
                   sum(aland) AS aland
            FROM {blocks} GROUP BY 1
        """)
        con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {out}_{unit}_in AS
            SELECT a.geo_id, left(b.block, {digits}) AS unit_id, count(*) AS n_in, sum(b.pop) AS pop, sum(b.hu) AS hu,
                   sum(b.hh) AS hh, sum(b.aland) AS aland
            FROM {block_area} a JOIN {blocks} b USING (block) GROUP BY a.geo_id, 2
        """)
        for weight, chain in WEIGHTS.items():
            share = " ".join(f"WHEN t.{c} > 0 THEN i.{c}::DOUBLE / t.{c}" for c in chain)
            basis = " ".join(f"WHEN t.{c} > 0 THEN '{c}'" for c in chain)
            selects.append(f"""
                SELECT i.geo_id, '{unit}' AS unit, i.unit_id, '{weight}' AS weight, CASE {share} ELSE 0 END AS share,
                       CASE {basis} ELSE 'none' END AS basis, i.{weight} AS w_in, i.n_in, t.n
                FROM {out}_{unit}_in i JOIN {out}_{unit}_tot t USING (unit_id)""")
    con.execute(f"CREATE OR REPLACE TABLE {out} AS " + " UNION ALL ".join(selects))
    return out


def relations(con: duckdb.DuckDBPyConnection, areas_sql: str, counties_sql: str, out: str) -> str:
    """Table `out` (geo_id, county, iou, of_county, of_area): how each area's polygon overlaps each county's.
    Both queries must give (geo_id, geometry) in a metric CRS. Judging equivalence on polygons keeps it
    independent of which census year's blocks are used."""
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        WITH a AS ({areas_sql}), c AS ({counties_sql}),
             x AS (SELECT a.geo_id, c.geo_id AS county, ST_Area(a.geometry) AS area_a, ST_Area(c.geometry) AS area_c,
                          ST_Area(ST_Intersection(a.geometry, c.geometry)) AS inter
                   FROM a JOIN c ON ST_Intersects(a.geometry, c.geometry))
        SELECT geo_id, county, inter / (area_a + area_c - inter) AS iou, inter / area_c AS of_county,
               inter / area_a AS of_area
        FROM x WHERE inter > 0
    """)
    return out


def quality(con: duckdb.DuckDBPyConnection, share_table: str, relation_table: str, out: str, whole: float,
            equivalent_iou: float) -> str:
    """Table `out` (geo_id, weight, total, whole_total, alignment, n_bg, n_split, n_fallback,
    equivalent_to). alignment is the share of the area's weight that sits in whole block groups;
    equivalent_to is the county whose polygon the area matches (IoU at least equivalent_iou)."""
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        SELECT s.geo_id, s.unit, s.weight, sum(s.w_in) AS total,
               coalesce(sum(s.w_in) FILTER (WHERE s.share >= {whole}), 0) AS whole_total,
               coalesce(sum(s.w_in) FILTER (WHERE s.share >= {whole}), 0) / nullif(sum(s.w_in), 0) AS alignment,
               count(*) AS n_bg, count(*) FILTER (WHERE s.share < {whole}) AS n_split,
               count(*) FILTER (WHERE s.basis <> s.weight) AS n_fallback,
               any_value(r.county) AS equivalent_to
        FROM {share_table} s
        LEFT JOIN (SELECT geo_id, county FROM {relation_table} WHERE iou >= {equivalent_iou}) r USING (geo_id)
        GROUP BY s.geo_id, s.unit, s.weight
    """)
    return out


def whole_counties(con: duckdb.DuckDBPyConnection, relation_table: str, out: str, threshold: float) -> str:
    """Table `out` (geo_id, county): the whole counties inside each area, only for areas that are exactly a
    union of whole counties (at least `threshold` of the area lies in counties it covers fully). These
    areas can take county-level series, such as annual population estimates, as sums."""
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        WITH whole AS (SELECT geo_id, county, of_area FROM {relation_table} WHERE of_county >= {threshold})
        SELECT geo_id, county FROM whole
        WHERE geo_id IN (SELECT geo_id FROM whole GROUP BY geo_id HAVING sum(of_area) >= {threshold})
    """)
    return out


def county_relations(con: duckdb.DuckDBPyConnection, out: str = "area_county_relations") -> str:
    """Relations between the WFRC area polygons and the TIGER county polygons, in a metric CRS."""
    cfg = load_config()
    crs = cfg["audit"]["crs"]
    counties = tiger.counties(cfg["state"]["abbr"], cfg["tiger"]["audit_year"])
    areas = custom_areas_sql().replace(
        "geometry::GEOMETRY AS geometry",
        f"ST_Transform(geometry, 'EPSG:4326', '{crs}', always_xy := true) AS geometry")
    county_sql = (f"SELECT STATEFP || COUNTYFP AS geo_id, ST_Transform(geometry::GEOMETRY, 'EPSG:4269', '{crs}', "
                  f"always_xy := true) AS geometry FROM read_parquet('{sql_path(counties)}')")
    return relations(con, areas, county_sql, out)


def assign_county_unions(con: duckdb.DuckDBPyConnection, blocks: str, block_area: str, area_counties: str) -> None:
    """Areas that are exactly whole counties take every block of those counties, by county code. Where
    the area polygon and the census year's county lines differ slightly, block points near the edge
    would otherwise fall outside the polygon and drop people from an area that is, by definition,
    complete."""
    con.execute(f"DELETE FROM {block_area} WHERE geo_id IN (SELECT DISTINCT geo_id FROM {area_counties})")
    con.execute(f"""
        INSERT INTO {block_area}
        SELECT b.block, w.geo_id FROM {blocks} b JOIN {area_counties} w ON left(b.block, 5) = w.county
    """)


def build(con: duckdb.DuckDBPyConnection, era: int, refresh: bool = False) -> dict[str, str]:
    """Run the crosswalk for one era; returns the table names (blocks, block_area, shares, quality,
    area_counties)."""
    cfg = load_config()["crosswalk"]
    blocks = load_blocks(con, era, refresh)
    block_area = assign(con, blocks, custom_areas_sql(), f"block_area_{era}")
    rel = county_relations(con)
    counties = whole_counties(con, rel, f"area_counties_{era}", cfg["whole_county_share"])
    assign_county_unions(con, blocks, block_area, counties)
    share_table = shares(con, blocks, block_area, f"shares_{era}")
    quality_table = quality(con, share_table, rel, f"quality_{era}", cfg["whole_unit_share"],
                            cfg["equivalent_area_iou"])
    return {"blocks": blocks, "block_area": block_area, "shares": share_table, "quality": quality_table,
            "area_counties": counties}


def run(refresh: bool = False) -> duckdb.DuckDBPyConnection:
    con = connect()
    manifest = {}
    quality_parts = []
    for era in eras_needed():
        t = build(con, era, refresh)
        write_parquet(con, f"SELECT * FROM {t['shares']}", DATA / "crosswalk" / f"unit_share_{era}.parquet",
                      "geo_id, unit, unit_id, weight")
        quality_parts.append(f"SELECT {era} AS era, * FROM {t['quality']}")
        # block -> area assignment, reused by the LODES stage (county-union areas already take whole counties)
        dest = DERIVED / f"block_area_{era}.parquet"
        dest.parent.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY (SELECT * FROM {t['block_area']} ORDER BY geo_id, block) TO '{sql_path(dest)}' "
                    "(FORMAT parquet, COMPRESSION zstd)")
        n_blocks, n_assigned = con.execute(
            f"SELECT (SELECT count(*) FROM {t['blocks']}), (SELECT count(DISTINCT block) FROM {t['block_area']})").fetchone()
        manifest[str(era)] = {"blocks": n_blocks, "blocks_in_any_area": n_assigned}
        print(f"era {era}: {n_blocks} blocks, {n_assigned} inside a WFRC area")
    write_parquet(con, " UNION ALL ".join(quality_parts), META / "boundary_quality.parquet", "era, geo_id, unit, weight")
    # whole-county unions are decided on polygons, so they are the same in every era
    write_parquet(con, f"SELECT * FROM area_counties_{max(eras_needed())}", META / "area_counties.parquet", "geo_id, county")
    update_manifest("crosswalk", manifest)
    return con
