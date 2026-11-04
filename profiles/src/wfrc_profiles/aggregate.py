"""Build ACS tables for the WFRC areas from block group data and the crosswalk shares.

Rows are written next to the Census geographies (data/acs/<topic>/<geo_type>.parquet, geo_type aog,
mpo, rpo or fws) with the same columns and a `method`:

- direct: the area equals a county, so the county's published value is used as is;
- aggregated: every block group lies wholly inside the area (alignment of 1), so the sum is exact;
- allocated: some block groups are split, so their values are apportioned by Decennial block counts
  and the result is a WFRC estimate.

Only additive tables are built here (agg = sum, custom = true). Medians are derived separately and
workplace-based tables come from LODES.
"""
from __future__ import annotations

import duckdb

from .crosswalk import eras_needed
from .db import connect, sql_path, write_parquet
from .paths import DATA, META
from .util import load_config, update_manifest


def load_inputs(con: duckdb.DuckDBPyConnection) -> None:
    """Register temp tables: shares (all eras), quality, variables."""
    shares = " UNION ALL ".join(
        f"SELECT {era} AS era, * FROM read_parquet('{sql_path(DATA / 'crosswalk' / f'bg_share_{era}.parquet')}')"
        for era in eras_needed())
    con.execute(f"CREATE OR REPLACE TEMP TABLE shares AS {shares}")
    con.execute(f"CREATE OR REPLACE TEMP TABLE quality AS SELECT * FROM read_parquet('{sql_path(META / 'boundary_quality.parquet')}')")
    con.execute(f"CREATE OR REPLACE TEMP TABLE variables AS SELECT * FROM read_parquet('{sql_path(META / 'variables.parquet')}')")


def allocation_sql(acs_bg: str, era_boundary: int, whole: float) -> str:
    """Query that allocates block group rows (columns geo_id, vintage, variable, estimate, moe) to areas."""
    return f"""
        SELECT s.geo_id, split_part(s.geo_id, '-', 1) AS geo_type, a.vintage, a.variable,
               round(CASE WHEN count(a.estimate) = 0 THEN NULL ELSE sum(a.estimate * s.share) END, 2) AS estimate,
               round(CASE WHEN count(a.moe) = 0 THEN NULL ELSE sqrt(sum(power(a.moe * s.share, 2))) END, 2) AS moe,
               NULL::VARCHAR AS flag,
               CASE WHEN q.alignment >= {whole} THEN 'aggregated' ELSE 'allocated' END AS method
        FROM {acs_bg} a
        JOIN variables v ON v.variable = a.variable AND v.vintage = a.vintage
        JOIN shares s ON s.bg = a.geo_id AND s.weight = v.weight
                     AND s.era = CASE WHEN a.vintage >= {era_boundary} THEN 2020 ELSE 2010 END
        JOIN quality q ON q.geo_id = s.geo_id AND q.weight = v.weight AND q.era = s.era
        WHERE v.agg = 'sum' AND v.custom AND s.share > 0 AND q.equivalent_to IS NULL
        GROUP BY s.geo_id, a.vintage, a.variable, q.alignment
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
    con = connect()
    load_inputs(con)
    topics = sorted({t["topic"] for t in cfg["acs"]["tables"].values()})
    manifest = {}
    for topic in topics:
        bg = DATA / "acs" / topic / "block_group.parquet"
        county = DATA / "acs" / topic / "county.parquet"
        con.execute(f"CREATE OR REPLACE TEMP VIEW acs_bg AS SELECT * FROM read_parquet('{sql_path(bg)}')")
        con.execute(f"CREATE OR REPLACE TEMP VIEW acs_county AS SELECT * FROM read_parquet('{sql_path(county)}')")
        con.execute("CREATE OR REPLACE TEMP TABLE built AS "
                    + allocation_sql("acs_bg", xw["era_boundary"], xw["whole_unit_share"])
                    + " UNION ALL " + equivalent_sql("acs_county", xw["era_boundary"]))
        for geo_type in cfg["arcgis"]["layers"]:
            dest = DATA / "acs" / topic / f"{geo_type}.parquet"
            write_parquet(con, f"SELECT geo_id, geo_type, vintage, variable, estimate, moe, flag, method "
                               f"FROM built WHERE geo_type = '{geo_type}'", dest, "vintage, variable, geo_id")
            rows = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(dest)}')").fetchone()[0]
            manifest[f"{topic}/{geo_type}"] = {"rows": rows, "bytes": dest.stat().st_size}
    update_manifest("aggregate", manifest)
    print(f"aggregated {len(topics)} topics for {', '.join(cfg['arcgis']['layers'])}")
