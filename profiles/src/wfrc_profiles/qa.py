"""Crosswalk QA: does the machinery reproduce published Census totals, in every vintage?

For each ACS vintage that has block groups:
1. Counties as areas: run the same polygon assignment and block group allocation with the TIGER county
   polygons and compare people, households and housing units with the directly published county values.
   Blocks nest inside counties, so these should match to rounding.
2. The WFRC AOG is whole counties, so its allocated total should equal the sum of those counties.
3. Coverage: every ACS block group with people must exist in that era's block table.
Then, once:
4. Medians: interpolate county medians from bracket counts and compare with the published medians.
5. Overlaps: blocks that fall in more than one area of the same layer (they would be double counted).
6. Fallbacks: block groups that had no Decennial count of the preferred kind.

Writes profiles/data/meta/crosswalk-qa.md and raises if a check exceeds the configured tolerance.
"""
from __future__ import annotations

import duckdb

from . import crosswalk, medians, tiger
from .acs import geographies_for, part_dir
from .db import connect, sql_path
from .paths import DATA, META
from .util import load_config, update_manifest, write_if_changed

CHECKS = {"B01001_001": "pop", "B25003_001": "hh", "B25002_001": "hu"}  # variable -> weight
TOPIC = {"B01001_001": "population", "B25003_001": "households", "B25002_001": "housing"}


def _bg(variable: str) -> str:
    return f"read_parquet('{sql_path(part_dir(TOPIC[variable], 'block_group') / '*.parquet')}')"


def _county(variable: str) -> str:
    return f"read_parquet('{sql_path(DATA / 'acs' / TOPIC[variable] / 'county.parquet')}')"


def _employment(con: duckdb.DuckDBPyConnection, tol: float, failures: list[str]) -> list[str]:
    """Checks on the LODES and QCEW outputs: parts add up to wholes, and the two sources are in the same range."""
    wac = lambda t: f"read_parquet('{sql_path(DATA / 'lodes' / 'wac' / (t + '.parquet'))}')"
    qcew = lambda t: f"read_parquet('{sql_path(DATA / 'qcew' / (t + '.parquet'))}')"
    members = f"read_parquet('{sql_path(META / 'area_counties.parquet')}')"
    needed = [DATA / "lodes" / "wac" / "county.parquet", DATA / "qcew" / "county.parquet", META / "area_counties.parquet"]
    if not all(p.exists() for p in needed):
        return ["## Employment data", "", "LODES or QCEW has not been built.", ""]
    lines = ["## Employment data (LODES and QCEW)", "",
             "Largest relative gap across all years between a total and the sum of its parts.", "",
             "| Check | Gap |", "|---|---:|"]

    def gap(label: str, sql: str) -> None:
        g = con.execute(sql).fetchone()[0] or 0.0
        lines.append(f"| {label} | {g:.4%} |")
        if g > tol:
            failures.append(f"{label}: {g:.4%}")

    gap("LODES jobs: counties sum to the state", f"""
        WITH c AS (SELECT year, sum(jobs) AS j FROM {wac('county')} WHERE variable = 'C000' GROUP BY year),
             s AS (SELECT year, jobs AS j FROM {wac('state')} WHERE variable = 'C000')
        SELECT max(abs(c.j - s.j) / s.j) FROM c JOIN s USING (year)""")
    gap("LODES jobs: WFRC AOG equals its counties", f"""
        WITH a AS (SELECT year, jobs AS j FROM {wac('aog')} WHERE variable = 'C000' AND geo_id = 'aog-wfrc'),
             c AS (SELECT year, sum(jobs) AS j FROM {wac('county')} w
                   WHERE variable = 'C000' AND geo_id IN (SELECT county FROM {members} WHERE geo_id = 'aog-wfrc') GROUP BY year)
        SELECT max(abs(a.j - c.j) / c.j) FROM a JOIN c USING (year)""")
    gap("QCEW employment: WFRC AOG equals its counties", f"""
        WITH a AS (SELECT year, value AS v FROM {qcew('areas')}
                   WHERE geo_id = 'aog-wfrc' AND variable = 'employment' AND ownership = '0' AND industry = '10' AND flag IS NULL),
             c AS (SELECT year, sum(value) AS v FROM {qcew('county')}
                   WHERE variable = 'employment' AND ownership = '0' AND industry = '10'
                     AND geo_id IN (SELECT county FROM {members} WHERE geo_id = 'aog-wfrc') GROUP BY year)
        SELECT max(abs(a.v - c.v) / c.v) FROM a JOIN c USING (year)""")
    lines.append("")

    year = con.execute(f"""
        SELECT max(w.year) FROM {wac('county')} w JOIN (SELECT DISTINCT year FROM {qcew('county')}) q USING (year)""").fetchone()[0]
    lines += [f"LODES jobs (all job types, by workplace) against QCEW covered employment in {year}. They differ by "
              "design (LODES counts jobs on a point in the year, QCEW an annual average, and each covers a "
              "different mix of workers), so this is a reasonableness check, not a test.", "",
              "| County | LODES jobs | QCEW employment | LODES / QCEW |", "|---|---:|---:|---:|"]
    rows = con.execute(f"""
        SELECT w.geo_id, w.jobs, q.value FROM {wac('county')} w
        JOIN {qcew('county')} q ON q.geo_id = w.geo_id AND q.year = w.year
        WHERE w.year = {year} AND w.variable = 'C000' AND q.variable = 'employment' AND q.ownership = '0'
          AND q.industry = '10' AND w.geo_id IN (SELECT county FROM {members} WHERE geo_id = 'aog-wfrc')
        ORDER BY w.jobs DESC""").fetchall()
    lines += [f"| `{g}` | {j:,} | {q:,.0f} | {j / q:.2f} |" for g, j, q in rows]
    lines.append("")
    return lines


def run(refresh: bool = False, con: duckdb.DuckDBPyConnection | None = None) -> None:
    cfg = load_config()
    tol = cfg["crosswalk"]["qa_tolerance"]
    con = con or connect()
    from .aggregate import load_inputs
    load_inputs(con)
    failures: list[str] = []
    lines = ["# Crosswalk QA", "", f"Tolerance {tol:.2%} of the published value.", ""]

    counties = tiger.counties(cfg["tiger"]["state"], cfg["tiger"]["audit_year"])
    areas = (f"SELECT STATEFP || COUNTYFP AS geo_id, geometry::GEOMETRY AS geometry "
             f"FROM read_parquet('{sql_path(counties)}')")
    vintages = [v for v in cfg["acs"]["vintages"] if "block_group" in geographies_for(cfg["acs"], v)]

    tables: dict[int, dict] = {}   # era -> crosswalk tables
    for era in sorted({crosswalk.era_of(v, cfg) for v in vintages}):
        t = crosswalk.build(con, era, refresh)
        crosswalk.assign(con, t["blocks"], areas, f"qa_county_area_{era}")
        crosswalk.shares(con, t["blocks"], f"qa_county_area_{era}", f"qa_county_shares_{era}")
        members = [r[0] for r in con.execute(f"SELECT county FROM {t['area_counties']} WHERE geo_id = 'aog-wfrc' ORDER BY 1").fetchall()]
        tables[era] = {**t, "members": members}

    lines += ["## By vintage", "",
              "Largest relative gap across the 29 counties when rebuilt from polygons (counties), the WFRC AOG "
              "against the sum of its counties (AOG), and people in ACS block groups missing from the block "
              "table (unmatched).", "",
              "| Vintage | Era | Counties: pop / hh / hu | AOG: pop / hh / hu | Unmatched people |",
              "|---:|---:|---|---|---:|"]
    for vintage in vintages:
        era = crosswalk.era_of(vintage, cfg)
        t = tables[era]
        id_list = ", ".join(f"'{m}'" for m in t["members"])
        cgap, agap = [], []
        for variable, weight in CHECKS.items():
            gap, n = con.execute(f"""
                WITH built AS (
                    SELECT s.geo_id, sum(a.estimate * s.share) AS est FROM {_bg(variable)} a
                    JOIN qa_county_shares_{era} s ON s.unit = 'bg' AND s.unit_id = a.geo_id AND s.weight = '{weight}'
                    WHERE a.variable = '{variable}' AND a.vintage = {vintage} GROUP BY s.geo_id),
                direct AS (SELECT geo_id, estimate FROM {_county(variable)} WHERE variable = '{variable}' AND vintage = {vintage})
                SELECT max(abs(b.est - d.estimate) / nullif(d.estimate, 0)), count(*) FROM built b JOIN direct d USING (geo_id)
            """).fetchone()
            cgap.append(gap)
            if n != 29 or gap > tol:
                failures.append(f"{vintage}: counties rebuilt from polygons differ for {variable}: {gap:.4%} over {n} counties")
            aog = con.execute(f"""
                SELECT sum(a.estimate * s.share) FROM {_bg(variable)} a
                JOIN {t['shares']} s ON s.unit = 'bg' AND s.unit_id = a.geo_id AND s.weight = '{weight}' AND s.geo_id = 'aog-wfrc'
                WHERE a.variable = '{variable}' AND a.vintage = {vintage}""").fetchone()[0]
            pub = con.execute(f"SELECT sum(estimate) FROM {_county(variable)} WHERE variable = '{variable}' "
                              f"AND vintage = {vintage} AND geo_id IN ({id_list})").fetchone()[0]
            agap.append(abs(aog - pub) / pub)
            if agap[-1] > tol:
                failures.append(f"{vintage}: AOG differs from its counties for {variable}: {agap[-1]:.4%}")
        unmatched = con.execute(f"""
            SELECT coalesce(sum(estimate), 0) FROM {_bg('B01001_001')}
            WHERE variable = 'B01001_001' AND vintage = {vintage} AND geo_id NOT IN (SELECT bg FROM {t['blocks']})""").fetchone()[0]
        if unmatched > 0:
            failures.append(f"{vintage}: {unmatched:,.0f} people live in ACS block groups missing from the {era} blocks")
        lines.append(f"| {vintage} | {era} | " + " / ".join(f"{g:.3%}" for g in cgap) + " | "
                     + " / ".join(f"{g:.3%}" for g in agap) + f" | {unmatched:,.0f} |")
    lines.append("")

    # medians: interpolate county medians from bracket counts and compare with the published ones
    parts = []
    for topic in ("income", "housing", "population"):
        parts.append(f"SELECT geo_id, 'county' AS geo_type, vintage, variable, estimate, moe, flag, 'aggregated' AS method "
                     f"FROM read_parquet('{sql_path(DATA / 'acs' / topic / 'county.parquet')}')")
    con.execute("CREATE OR REPLACE TEMP TABLE county_counts AS " + " UNION ALL ".join(parts))
    derived = medians.derive(con, "county_counts", cfg["medians"])
    con.register("derived_df", derived)
    min_pop = cfg["crosswalk"]["median_qa_min_pop"]
    lines += ["## Interpolated medians vs published county medians", "",
              "Medians interpolated from county bracket counts, compared with the Census-published county median "
              "(all counties and vintages, excluding open-ended results). Brackets are coarse for very small "
              f"counties, so the check is applied to counties of at least {min_pop:,} people, which is the "
              "scale of the WFRC areas; the worst case over all counties is shown for information.", "",
              f"| Median | Rows | Mean gap | Worst gap | Worst gap, counties of {min_pop:,}+ |", "|---|---:|---:|---:|---:|"]
    for spec in cfg["medians"]:
        topic = next(v["topic"] for k, v in cfg["acs"]["tables"].items() if k == spec["table"])
        rows, mean, worst, worst_large = con.execute(f"""
            WITH g AS (
                SELECT abs(d.estimate - p.estimate) / p.estimate AS gap, pp.estimate AS pop
                FROM derived_df d
                JOIN read_parquet('{sql_path(DATA / 'acs' / topic / 'county.parquet')}') p
                  ON p.geo_id = d.geo_id AND p.vintage = d.vintage AND p.variable = d.variable
                JOIN read_parquet('{sql_path(DATA / 'acs' / 'population' / 'county.parquet')}') pp
                  ON pp.geo_id = d.geo_id AND pp.vintage = d.vintage AND pp.variable = 'B01001_001'
                WHERE d.variable = '{spec['target']}' AND d.flag IS NULL AND p.estimate > 0 AND p.flag IS NULL)
            SELECT count(*), avg(gap), max(gap), max(gap) FILTER (WHERE pop >= {min_pop}) FROM g""").fetchone()
        lines.append(f"| `{spec['target']}` | {rows} | {mean:.2%} | {worst:.2%} | {worst_large:.2%} |")
        if worst_large is not None and worst_large > cfg["crosswalk"]["median_tolerance"]:
            failures.append(f"interpolated median {spec['target']} differs from published by {worst_large:.2%} "
                            f"in counties of {min_pop:,}+")
    lines.append("")

    latest = max(tables)
    t = tables[latest]
    overlaps = con.execute(f"""
        SELECT layer, count(*) FROM (
            SELECT block, split_part(geo_id, '-', 1) AS layer FROM {t['block_area']}
            GROUP BY 1, 2 HAVING count(*) > 1) GROUP BY layer ORDER BY layer""").fetchall()
    lines += [f"## Blocks inside more than one area of the same layer (era {latest})", ""]
    lines += [f"- `{layer}`: {n} block(s)" for layer, n in overlaps] or ["- None."]
    lines.append("")

    fb = con.execute(f"""
        SELECT s.geo_id, s.unit_id, s.basis FROM {t['shares']} s WHERE s.unit = 'bg' AND s.basis <> s.weight AND s.weight = 'pop'
        ORDER BY 1, 2""").fetchall()
    lines += [f"## Block groups with no population count in the Decennial (era {latest})", "",
              "These used the next available count (housing units, then land area):", ""]
    lines += [f"- `{g}` block group {bg}: used {basis}" for g, bg, basis in fb] or ["- None."]
    lines.append("")

    lines += _employment(con, tol, failures)

    write_if_changed(META / "crosswalk-qa.md", ("\n".join(lines) + "\n").encode("utf-8"))
    update_manifest("crosswalk_qa", {"vintages": vintages, "failures": failures})
    print(f"wrote {META / 'crosswalk-qa.md'}")
    if failures:
        raise SystemExit("Crosswalk QA failed:\n  " + "\n  ".join(failures))
