"""Block-level crosswalk from ACS block groups to WFRC areas.

A block belongs to an area when its internal point falls inside the area polygon. ACS block group
values are then split between areas by each area's share of the block group's Decennial block counts
(people, households or housing units, depending on the table). The shares, and how much of each area
rests on whole block groups (the alignment score), are the tracked outputs.
"""
from __future__ import annotations

import duckdb
import pandas as pd

from . import decennial, tiger
from .db import connect, sql_path, write_parquet
from .paths import BOUNDARIES, DATA, META
from .util import load_config, update_manifest

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
    abbr = cfg["tiger"]["state"]
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


def shares(con: duckdb.DuckDBPyConnection, blocks: str, block_area: str, out: str) -> str:
    """Table `out` (geo_id, bg, weight, share, basis, w_in, n_in, n): the share of each block group, per
    weight kind, that lies inside each area; `basis` is the count actually used after any fallback."""
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {out}_bg AS
        SELECT bg, count(*) AS n, sum(pop) AS pop, sum(hu) AS hu, sum(hh) AS hh, sum(aland) AS aland
        FROM {blocks} GROUP BY bg
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {out}_in AS
        SELECT a.geo_id, b.bg, count(*) AS n_in, sum(b.pop) AS pop, sum(b.hu) AS hu, sum(b.hh) AS hh,
               sum(b.aland) AS aland
        FROM {block_area} a JOIN {blocks} b USING (block) GROUP BY a.geo_id, b.bg
    """)
    selects = []
    for weight, chain in WEIGHTS.items():
        share = " ".join(f"WHEN t.{c} > 0 THEN i.{c}::DOUBLE / t.{c}" for c in chain)
        basis = " ".join(f"WHEN t.{c} > 0 THEN '{c}'" for c in chain)
        selects.append(f"""
            SELECT i.geo_id, i.bg, '{weight}' AS weight, CASE {share} ELSE 0 END AS share,
                   CASE {basis} ELSE 'none' END AS basis, i.{weight} AS w_in, i.n_in, t.n
            FROM {out}_in i JOIN {out}_bg t USING (bg)""")
    con.execute(f"CREATE OR REPLACE TABLE {out} AS " + " UNION ALL ".join(selects))
    return out


def quality(con: duckdb.DuckDBPyConnection, share_table: str, blocks: str, block_area: str, out: str,
            whole: float, equivalent_iou: float) -> str:
    """Table `out` (geo_id, weight, total, whole_total, alignment, n_bg, n_split, n_fallback,
    equivalent_to). alignment is the share of the area's weight that sits in whole block groups."""
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        SELECT geo_id, weight, sum(w_in) AS total,
               coalesce(sum(w_in) FILTER (WHERE share >= {whole}), 0) AS whole_total,
               coalesce(sum(w_in) FILTER (WHERE share >= {whole}), 0) / nullif(sum(w_in), 0) AS alignment,
               count(*) AS n_bg, count(*) FILTER (WHERE share < {whole}) AS n_split,
               count(*) FILTER (WHERE basis <> weight) AS n_fallback
        FROM {share_table} GROUP BY geo_id, weight
    """)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {out}_eq AS
        WITH area_n AS (SELECT geo_id, count(*) AS n_a FROM {block_area} GROUP BY geo_id),
             county_n AS (SELECT left(block, 5) AS county, count(*) AS n_c FROM {blocks} GROUP BY 1),
             inter AS (SELECT a.geo_id, left(a.block, 5) AS county, count(*) AS n_i
                       FROM {block_area} a GROUP BY 1, 2)
        SELECT i.geo_id, i.county AS equivalent_to
        FROM inter i JOIN area_n USING (geo_id) JOIN county_n c ON c.county = i.county
        WHERE i.n_i::DOUBLE / (area_n.n_a + c.n_c - i.n_i) >= {equivalent_iou}
    """)
    con.execute(f"""
        CREATE OR REPLACE TABLE {out} AS
        SELECT q.*, e.equivalent_to FROM {out} q LEFT JOIN {out}_eq e USING (geo_id)
    """)
    return out


def build(con: duckdb.DuckDBPyConnection, era: int, refresh: bool = False) -> dict[str, str]:
    """Run the crosswalk for one era; returns the table names (blocks, block_area, shares, quality)."""
    cfg = load_config()["crosswalk"]
    blocks = load_blocks(con, era, refresh)
    block_area = assign(con, blocks, custom_areas_sql(), f"block_area_{era}")
    share_table = shares(con, blocks, block_area, f"shares_{era}")
    quality_table = quality(con, share_table, blocks, block_area, f"quality_{era}",
                            cfg["whole_unit_share"], cfg["equivalent_block_iou"])
    return {"blocks": blocks, "block_area": block_area, "shares": share_table, "quality": quality_table}


def run(refresh: bool = False) -> duckdb.DuckDBPyConnection:
    con = connect()
    manifest = {}
    quality_parts = []
    for era in eras_needed():
        t = build(con, era, refresh)
        write_parquet(con, f"SELECT * FROM {t['shares']}", DATA / "crosswalk" / f"bg_share_{era}.parquet",
                      "geo_id, bg, weight")
        quality_parts.append(f"SELECT {era} AS era, * FROM {t['quality']}")
        n_blocks, n_assigned = con.execute(
            f"SELECT (SELECT count(*) FROM {t['blocks']}), (SELECT count(DISTINCT block) FROM {t['block_area']})").fetchone()
        manifest[str(era)] = {"blocks": n_blocks, "blocks_in_any_area": n_assigned}
        print(f"era {era}: {n_blocks} blocks, {n_assigned} inside a WFRC area")
    write_parquet(con, " UNION ALL ".join(quality_parts), META / "boundary_quality.parquet", "era, geo_id, weight")
    update_manifest("crosswalk", manifest)
    return con
