"""Audit the custom boundaries against counties and against each other, in DuckDB spatial SQL.

Writes profiles/data/meta/boundary-audit.md (deterministic, tracked). It answers: which boundaries
equal a county (so their data can be treated as direct), which cut through counties (so they need the
block crosswalk), whether features inside a layer overlap, and what happened to same-name rows.
"""
from __future__ import annotations

import duckdb

from . import tiger
from .boundaries import fetch_layer, process_layer
from .db import connect, sql_path
from .paths import META
from .util import load_config, update_manifest, write_if_changed

KM2 = 1_000_000


def _to_metric(crs: str, src: str) -> str:
    return f"ST_Transform(geometry, '{src}', '{crs}', always_xy := true)"


def _county_table(con: duckdb.DuckDBPyConnection, table: str, eq_iou: float, min_km2: float) -> list[dict]:
    rows = con.execute(f"""
        WITH x AS (
            SELECT b.geo_id, b.geo_name, c.NAME AS county,
                   ST_Area(b.g) AS ab, ST_Area(c.g) AS ac, ST_Area(ST_Intersection(b.g, c.g)) AS inter
            FROM {table}_m b JOIN counties_m c ON ST_Intersects(b.g, c.g)
        )
        SELECT geo_id, county, ab, inter / ab AS of_boundary, inter / ac AS of_county,
               inter / (ab + ac - inter) AS iou
        FROM x WHERE inter >= {min_km2 * KM2} ORDER BY geo_id, of_boundary DESC
    """).fetchall()
    out: dict[str, dict] = {}
    for geo_id, county, ab, of_b, of_c, iou in rows:
        e = out.setdefault(geo_id, {"geo_id": geo_id, "area_km2": ab / KM2, "counties": [], "equivalent_to": None})
        e["counties"].append({"county": county, "of_boundary": of_b, "of_county": of_c, "iou": iou})
        if iou >= eq_iou:
            e["equivalent_to"] = county
    return list(out.values())


def _overlaps(con: duckdb.DuckDBPyConnection, table: str, tol: float) -> list[tuple[str, str, float]]:
    return [(a, b, area / KM2) for a, b, area in con.execute(f"""
        SELECT a.geo_id, b.geo_id, ST_Area(ST_Intersection(a.g, b.g)) AS area
        FROM {table}_m a JOIN {table}_m b ON a.geo_id < b.geo_id AND ST_Intersects(a.g, b.g)
        WHERE ST_Area(ST_Intersection(a.g, b.g)) > {tol} ORDER BY 1, 2
    """).fetchall()]


def _same_name_rows(con: duckdb.DuckDBPyConnection, raw_path, orgs: list[str], crs: str, tol: float) -> list[str]:
    marks = ", ".join("?" for _ in orgs)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE raw_m AS
        SELECT OBJECTID AS oid, BoundaryName AS name, {_to_metric(crs, 'EPSG:4326')} AS g
        FROM read_parquet('{sql_path(raw_path)}') WHERE Organization IN ({marks})
    """, orgs)
    names = con.execute("SELECT name, count(*) FROM raw_m GROUP BY name HAVING count(*) > 1 ORDER BY name").fetchall()
    notes = []
    for name, n in names:
        overlap, touching = con.execute("""
            SELECT coalesce(sum(ST_Area(ST_Intersection(a.g, b.g))), 0), bool_and(ST_Distance(a.g, b.g) < 1)
            FROM raw_m a JOIN raw_m b ON a.name = b.name AND a.oid < b.oid WHERE a.name = ?
        """, [name]).fetchone()
        kind = "overlapping" if overlap > tol else ("touching/adjacent" if touching else "disjoint parts")
        notes.append(f"`{name}`: {n} rows ({kind}, overlap {overlap / KM2:.4f} km2) dissolved into one area.")
    return notes


def run(refresh: bool = False, con: duckdb.DuckDBPyConnection | None = None) -> None:
    cfg = load_config()
    acfg, tcfg, aud = cfg["arcgis"], cfg["tiger"], cfg["audit"]
    con = con or connect()
    crs = aud["crs"]

    counties_path = tiger.counties(tcfg["state"], tcfg["audit_year"], refresh)
    con.execute(f"""
        CREATE OR REPLACE TABLE counties_m AS
        SELECT NAME, ST_Transform(geometry, 'EPSG:4269', '{crs}', always_xy := true) AS g
        FROM read_parquet('{sql_path(counties_path)}')
    """)

    lines = [
        "# Boundary audit", "",
        f"Boundaries from the WFRC ArcGIS service, organizations: {', '.join(acfg['organizations'])}. "
        f"Counties from TIGER {tcfg['audit_year']}. A boundary is treated as equal to a county when their "
        f"overlap (intersection over union) is at least {aud['equivalent_iou']:.0%}.", "",
    ]
    summary: dict[str, dict] = {}
    for geo_type, lc in acfg["layers"].items():
        raw_path, meta = fetch_layer(acfg["service"], lc["layer"], refresh)
        table = process_layer(con, raw_path, geo_type, lc, acfg["organizations"])
        con.execute(f"""
            CREATE OR REPLACE TABLE {table}_m AS
            SELECT geo_id, geo_name, {_to_metric(crs, 'EPSG:4326')} AS g FROM {table}
        """)
        n_areas = con.execute(f"SELECT count(*) FROM {table}_m").fetchone()[0]
        lines += [f"## {geo_type.upper()}: {lc['label']}", "",
                  f"Layer `{meta['name']}`, last edited {meta['last_edit']}, {n_areas} area(s).", ""]
        for note in _same_name_rows(con, raw_path, acfg["organizations"], crs, aud["overlap_tolerance_m2"]):
            lines.append(f"- {note}")
        bad = [r[0] for r in con.execute(
            f"SELECT geo_id FROM {table}_m WHERE ST_IsEmpty(g) OR NOT ST_IsValid(g)").fetchall()]
        if bad:
            lines.append(f"- INVALID or empty geometry after repair: {bad}")
        overlaps = _overlaps(con, table, aud["overlap_tolerance_m2"])
        if overlaps:
            for a, b, km2 in overlaps:
                lines.append(f"- OVERLAP within layer: `{a}` and `{b}` share {km2:.2f} km2.")
        else:
            lines.append("- No overlaps between features in this layer.")
        lines.append("")
        lines += ["| Area | km2 | Equal to county | Counties touched (share of area / share of county) |",
                  "|---|---:|---|---|"]
        rows = _county_table(con, table, aud["equivalent_iou"], aud["min_county_overlap_km2"])
        for row in rows:
            touched = "; ".join(f"{p['county']} ({p['of_boundary']:.0%} / {p['of_county']:.0%})" for p in row["counties"])
            lines.append(f"| `{row['geo_id']}` | {row['area_km2']:,.0f} | {row['equivalent_to'] or '-'} | {touched} |")
        lines.append("")
        summary[geo_type] = {r["geo_id"]: r["equivalent_to"] for r in rows}

    write_if_changed(META / "boundary-audit.md", ("\n".join(lines) + "\n").encode("utf-8"))
    update_manifest("boundary_equivalence", summary)
    print(f"wrote {META / 'boundary-audit.md'}")
