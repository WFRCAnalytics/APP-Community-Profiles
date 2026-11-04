"""Crosswalk QA: does the machinery reproduce published Census totals?

1. Counties as areas: run the same polygon assignment and block group allocation with the TIGER county
   polygons and compare people, households and housing units with the directly published county values.
   Blocks nest inside counties, so these should match to rounding.
2. The WFRC AOG is whole counties, so its allocated total should equal the sum of those counties.
3. Overlaps: blocks that fall in more than one area of the same layer (they would be double counted).
4. Fallbacks: block groups that had no Decennial count of the preferred kind.

Writes profiles/data/meta/crosswalk-qa.md and raises if a check exceeds the configured tolerance.
"""
from __future__ import annotations

import duckdb

from . import crosswalk, tiger
from .db import connect, sql_path
from .paths import DATA, META
from .util import load_config, update_manifest, write_if_changed

CHECKS = {"B01001_001": "pop", "B25003_001": "hh", "B25002_001": "hu"}  # variable -> weight


def _topic_of(con: duckdb.DuckDBPyConnection, variable: str) -> str:
    return con.execute("SELECT topic FROM variables WHERE variable = ? LIMIT 1", [variable]).fetchone()[0]


def run(refresh: bool = False, con: duckdb.DuckDBPyConnection | None = None) -> None:
    cfg = load_config()
    tol = cfg["crosswalk"]["qa_tolerance"]
    con = con or connect()
    from .aggregate import load_inputs
    load_inputs(con)
    vintage = max(cfg["acs"]["vintages"])
    era = crosswalk.era_of(vintage, cfg)
    blocks = crosswalk.load_blocks(con, era, refresh)
    lines = ["# Crosswalk QA", "",
             f"ACS {vintage} 5-year allocated with era {era} blocks. Tolerance {tol:.2%} of the direct value.", ""]
    failures: list[str] = []

    def acs_rows(level: str, variable: str, weight_ids: str = "") -> str:
        topic = _topic_of(con, variable)
        return (f"SELECT geo_id, estimate FROM read_parquet('{sql_path(DATA / 'acs' / topic / (level + '.parquet'))}') "
                f"WHERE variable = '{variable}' AND vintage = {vintage}")

    # 1. counties as areas, assigned by polygon
    counties = tiger.counties(cfg["tiger"]["state"], cfg["tiger"]["audit_year"])
    areas = (f"SELECT STATEFP || COUNTYFP AS geo_id, geometry::GEOMETRY AS geometry "
             f"FROM read_parquet('{sql_path(counties)}')")
    crosswalk.assign(con, blocks, areas, "qa_county_area")
    crosswalk.shares(con, blocks, "qa_county_area", "qa_county_shares")
    lines += ["## Counties rebuilt from polygons vs published", "",
              "| Variable | Counties | Largest gap | Total allocated | Total published |", "|---|---:|---:|---:|---:|"]
    for variable, weight in CHECKS.items():
        gap, n, tot_a, tot_p = con.execute(f"""
            WITH built AS (
                SELECT s.geo_id, sum(a.estimate * s.share) AS est
                FROM read_parquet('{sql_path(DATA / 'acs' / _topic_of(con, variable) / 'block_group.parquet')}') a
                JOIN qa_county_shares s ON s.bg = a.geo_id AND s.weight = '{weight}'
                WHERE a.variable = '{variable}' AND a.vintage = {vintage} GROUP BY s.geo_id),
            direct AS ({acs_rows('county', variable)})
            SELECT max(abs(b.est - d.estimate) / nullif(d.estimate, 0)), count(*), sum(b.est), sum(d.estimate)
            FROM built b JOIN direct d USING (geo_id)
        """).fetchone()
        lines.append(f"| `{variable}` ({weight}) | {n} | {gap:.4%} | {tot_a:,.0f} | {tot_p:,.0f} |")
        if n != 29 or gap > tol:
            failures.append(f"counties rebuilt from polygons differ for {variable}: {gap:.4%} over {n} counties")
    lines.append("")

    # 2. AOG vs the counties it contains
    t = crosswalk.build(con, era, refresh)
    members = [r[0] for r in con.execute(f"""
        SELECT equivalent FROM (
            SELECT left(a.block, 5) AS equivalent, count(*) AS n_in
            FROM {t['block_area']} a WHERE a.geo_id = 'aog-wfrc' GROUP BY 1) m
        JOIN (SELECT left(block, 5) AS county, count(*) AS n FROM {blocks} GROUP BY 1) c
          ON c.county = m.equivalent AND m.n_in = c.n ORDER BY 1""").fetchall()]
    lines += ["## WFRC AOG vs the counties inside it", "",
              f"Whole counties found inside the AOG: {', '.join(members) or 'none'}.", "",
              "| Variable | AOG allocated | Counties published | Gap |", "|---|---:|---:|---:|"]
    id_list = ", ".join(f"'{m}'" for m in members)
    for variable, weight in CHECKS.items():
        topic = _topic_of(con, variable)
        aog = con.execute(f"""
            SELECT sum(a.estimate * s.share)
            FROM read_parquet('{sql_path(DATA / 'acs' / topic / 'block_group.parquet')}') a
            JOIN {t['shares']} s ON s.bg = a.geo_id AND s.weight = '{weight}' AND s.geo_id = 'aog-wfrc'
            WHERE a.variable = '{variable}' AND a.vintage = {vintage}""").fetchone()[0]
        pub = con.execute(f"SELECT sum(estimate) FROM ({acs_rows('county', variable)}) WHERE geo_id IN ({id_list})").fetchone()[0]
        gap = abs(aog - pub) / pub
        lines.append(f"| `{variable}` ({weight}) | {aog:,.0f} | {pub:,.0f} | {gap:.4%} |")
        if gap > tol:
            failures.append(f"AOG differs from its counties for {variable}: {gap:.4%}")
    lines.append("")

    # 3. overlaps within a layer
    overlaps = con.execute(f"""
        SELECT layer, count(*) FROM (
            SELECT block, split_part(geo_id, '-', 1) AS layer FROM {t['block_area']}
            GROUP BY 1, 2 HAVING count(*) > 1) GROUP BY layer ORDER BY layer""").fetchall()
    lines += ["## Blocks inside more than one area of the same layer", ""]
    lines += [f"- `{layer}`: {n} block(s)" for layer, n in overlaps] or ["- None."]
    lines.append("")

    # 4. fallbacks
    fb = con.execute(f"""
        SELECT s.geo_id, s.bg, s.weight, s.basis FROM {t['shares']} s WHERE s.basis <> s.weight AND s.weight = 'pop'
        ORDER BY 1, 2""").fetchall()
    lines += ["## Block groups with no population count in the Decennial", "",
              "These used the next available count (housing units, then land area):", ""]
    lines += [f"- `{g}` block group {bg}: used {basis}" for g, bg, _, basis in fb] or ["- None."]
    lines.append("")

    write_if_changed(META / "crosswalk-qa.md", ("\n".join(lines) + "\n").encode("utf-8"))
    update_manifest("crosswalk_qa", {"era": era, "vintage": vintage, "failures": failures})
    print(f"wrote {META / 'crosswalk-qa.md'}")
    if failures:
        raise SystemExit("Crosswalk QA failed:\n  " + "\n  ".join(failures))
