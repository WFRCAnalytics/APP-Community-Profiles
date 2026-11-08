"""Build ACS tables for the WFRC areas from block group data and the crosswalk shares.

Rows are written next to the Census geographies (data/acs/<topic>/<geo_type>.parquet, geo_type aog,
mpo, rpo or fws) with the same columns and a `method`:

- direct: the area equals a county, so the county's published value is used as is;
- aggregated: every block group lies wholly inside the area (alignment of 1), so the sum is exact. An area that is a union of
  whole counties (the WFRC region) is summed from the counties' published rows, with the margin of error the Census
  handbook gives for a sum (the root sum of squares of the county margins) rather than from block-group margins, which
  are far wider for the same people;
- allocated: some block groups are split, so their values are apportioned by Decennial block counts
  and the result is a WFRC estimate;
- derived: a median interpolated from allocated or aggregated bracket counts (also a WFRC estimate).

Only additive tables are built from block groups (agg = sum, custom = true); medians are then
interpolated from the allocated bracket counts (method = derived, see medians.py), and
workplace-based tables come from LODES.
"""
from __future__ import annotations

import duckdb

from . import medians
from .acs import part_dir
from .crosswalk import eras_needed
from .db import connect, sql_path, write_parquet
from .paths import DATA, META
from .util import load_config, update_manifest


def load_inputs(con: duckdb.DuckDBPyConnection) -> None:
    """Register temp tables: shares (all eras), quality, variables."""
    shares = " UNION ALL ".join(
        f"SELECT {era} AS era, * FROM read_parquet('{sql_path(DATA / 'crosswalk' / f'unit_share_{era}.parquet')}')"
        for era in eras_needed())
    con.execute(f"CREATE OR REPLACE TEMP TABLE shares AS {shares}")
    con.execute(f"CREATE OR REPLACE TEMP TABLE quality AS SELECT * FROM read_parquet('{sql_path(META / 'boundary_quality.parquet')}')")
    con.execute(f"CREATE OR REPLACE TEMP TABLE variables AS SELECT * FROM read_parquet('{sql_path(META / 'variables.parquet')}')")
    con.execute(f"""CREATE OR REPLACE TEMP TABLE county_unions AS
        SELECT geo_id, county FROM read_parquet('{sql_path(META / 'area_counties.parquet')}')
        WHERE geo_id NOT IN (SELECT geo_id FROM quality WHERE equivalent_to IS NOT NULL)""")


def allocation_sql(acs_src: str, era_boundary: int, whole: float, unit: str = "bg", min_vintage: int = 0) -> str:
    """Query that allocates rows of Census units (columns geo_id, vintage, variable, estimate, moe) to areas.
    `unit` is bg or tract: tables the Census does not publish at block group are split from tracts. Vintages
    before `min_vintage` are skipped so every table of an area starts in the same year."""
    return f"""
        SELECT s.geo_id, split_part(s.geo_id, '-', 1) AS geo_type, a.vintage, a.variable,
               round(CASE WHEN count(a.estimate) = 0 THEN NULL ELSE sum(a.estimate * s.share) END, 2) AS estimate,
               round(CASE WHEN count(a.moe) = 0 THEN NULL ELSE sqrt(sum(power(a.moe * s.share, 2))) END, 2) AS moe,
               NULL::VARCHAR AS flag,
               CASE WHEN q.alignment >= {whole} THEN 'aggregated' ELSE 'allocated' END AS method
        FROM {acs_src} a
        JOIN variables v ON v.variable = a.variable AND v.vintage = a.vintage AND v.unit = '{unit}'
        JOIN shares s ON s.unit = '{unit}' AND s.unit_id = a.geo_id AND s.weight = v.weight
                     AND s.era = CASE WHEN a.vintage >= {era_boundary} THEN 2020 ELSE 2010 END
        JOIN quality q ON q.geo_id = s.geo_id AND q.unit = s.unit AND q.weight = v.weight AND q.era = s.era
        WHERE v.agg = 'sum' AND v.custom AND s.share > 0 AND q.equivalent_to IS NULL AND a.vintage >= {min_vintage}
          AND s.geo_id NOT IN (SELECT geo_id FROM county_unions)
        GROUP BY s.geo_id, a.vintage, a.variable, q.alignment
    """


def county_union_sql(acs_county: str, min_vintage: int) -> str:
    """Areas that are unions of whole counties: sum the counties' published rows. The estimate is null unless every
    county has one. A county margin of error that is null beside an estimate (a Census-controlled count) counts as
    zero, as in the Census handbook, so a fully controlled variable stays without a margin."""
    return f"""
        SELECT u.geo_id, split_part(u.geo_id, '-', 1) AS geo_type, c.vintage, c.variable,
               CASE WHEN count(c.estimate) = count(*) THEN sum(c.estimate) END AS estimate,
               CASE WHEN count(c.estimate) = count(*) AND count(c.moe) > 0
                    THEN round(sqrt(sum(power(coalesce(c.moe, 0), 2))), 2) END AS moe,
               NULL::VARCHAR AS flag, 'aggregated' AS method
        FROM {acs_county} c
        JOIN county_unions u ON u.county = c.geo_id
        JOIN variables v ON v.variable = c.variable AND v.vintage = c.vintage
        WHERE v.agg = 'sum' AND v.custom AND c.vintage >= {min_vintage}
        GROUP BY u.geo_id, c.vintage, c.variable
    """


def equivalent_sql(acs_county: str, era_boundary: int) -> str:
    """Areas that equal a county take that county's published rows."""
    return f"""
        SELECT e.geo_id, split_part(e.geo_id, '-', 1) AS geo_type, c.vintage, c.variable, c.estimate, c.moe,
               c.flag, 'direct' AS method
        FROM {acs_county} c
        JOIN (SELECT DISTINCT era, geo_id, equivalent_to FROM quality WHERE equivalent_to IS NOT NULL) e
          ON c.geo_id = e.equivalent_to
         AND e.era = CASE WHEN c.vintage >= {era_boundary} THEN 2020 ELSE 2010 END
    """


def run(refresh: bool = False) -> None:
    cfg = load_config()
    xw = cfg["crosswalk"]
    min_vintage = cfg["acs"]["geographies"]["block_group"]["since"]
    con = connect()
    load_inputs(con)
    topics = sorted({t["topic"] for t in cfg["acs"]["tables"].values()})
    manifest = {}
    topic_tables = {t: {k for k, v in cfg["acs"]["tables"].items() if v["topic"] == t} for t in topics}
    for topic in topics:
        county = DATA / "acs" / topic / "county.parquet"
        con.execute(f"CREATE OR REPLACE TEMP VIEW acs_county AS SELECT * FROM read_parquet('{sql_path(county)}')")
        parts = []
        for unit, geo in (("bg", "block_group"), ("tract", "tract")):
            if not con.execute("SELECT count(*) FROM variables WHERE topic = ? AND unit = ? AND agg = 'sum' AND custom",
                               [topic, unit]).fetchone()[0]:
                continue
            # full history from the part files, not the latest-only tracked file
            src = part_dir(topic, geo) / "*.parquet"
            con.execute(f"CREATE OR REPLACE TEMP VIEW acs_{unit} AS SELECT * FROM read_parquet('{sql_path(src)}')")
            parts.append(allocation_sql(f"acs_{unit}", xw["era_boundary"], xw["whole_unit_share"], unit, min_vintage))
        con.execute("CREATE OR REPLACE TEMP TABLE built AS " + " UNION ALL ".join(parts)
                    + " UNION ALL " + county_union_sql("acs_county", min_vintage)
                    + " UNION ALL " + equivalent_sql("acs_county", xw["era_boundary"]))
        derived = medians.derive(con, "built", [m for m in cfg["medians"] if m["table"] in topic_tables[topic]])
        if len(derived):
            con.register("derived_df", derived)
            con.execute("INSERT INTO built SELECT * FROM derived_df")
            con.unregister("derived_df")
        for geo_type in cfg["arcgis"]["layers"]:
            dest = DATA / "acs" / topic / f"{geo_type}.parquet"
            write_parquet(con, f"SELECT geo_id, geo_type, vintage, variable, estimate, moe, flag, method "
                               f"FROM built WHERE geo_type = '{geo_type}'", dest, "vintage, variable, geo_id")
            rows = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(dest)}')").fetchone()[0]
            manifest[f"{topic}/{geo_type}"] = {"rows": rows, "bytes": dest.stat().st_size}
    update_manifest("aggregate", manifest)
    print(f"aggregated {len(topics)} topics for {', '.join(cfg['arcgis']['layers'])}")
