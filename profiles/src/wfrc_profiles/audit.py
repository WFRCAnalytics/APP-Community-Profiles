"""Audit the custom boundaries against counties and against each other.

Writes profiles/data/meta/boundary-audit.md (deterministic, tracked). It answers: which boundaries
equal a county (so their data can be treated as direct), which cut through counties (so they need the
block crosswalk), whether features inside a layer overlap, and what happened to same-name rows.
"""
from __future__ import annotations

from itertools import combinations

import geopandas as gpd

from . import tiger
from .boundaries import fetch_layer
from .paths import META
from .util import load_config, update_manifest, write_if_changed

KM2 = 1_000_000


def _county_table(gdf: gpd.GeoDataFrame, counties: gpd.GeoDataFrame, eq_iou: float, min_km2: float) -> list[dict]:
    rows = []
    for _, b in gdf.iterrows():
        parts = []
        for _, c in counties.iterrows():
            inter = b.geometry.intersection(c.geometry).area
            if inter < min_km2 * KM2:
                continue
            union = b.geometry.union(c.geometry).area
            parts.append({"county": c["NAME"], "of_boundary": inter / b.geometry.area,
                          "of_county": inter / c.geometry.area, "iou": inter / union})
        parts.sort(key=lambda p: -p["of_boundary"])
        best = parts[0] if parts else None
        equivalent = best["county"] if best and best["iou"] >= eq_iou else None
        rows.append({"geo_id": b["geo_id"], "geo_name": b["geo_name"], "area_km2": b.geometry.area / KM2,
                     "counties": parts, "equivalent_to": equivalent})
    return rows


def _overlaps(gdf: gpd.GeoDataFrame, tol: float) -> list[tuple[str, str, float]]:
    found = []
    for (_, a), (_, b) in combinations(gdf.iterrows(), 2):
        area = a.geometry.intersection(b.geometry).area
        if area > tol:
            found.append((a["geo_id"], b["geo_id"], area / KM2))
    return found


def _same_name_rows(raw: gpd.GeoDataFrame, orgs: list[str], crs: str, tol: float) -> list[str]:
    raw = raw[raw["Organization"].isin(orgs)].to_crs(crs)
    notes = []
    for name, grp in raw.groupby("BoundaryName"):
        if len(grp) < 2:
            continue
        geoms = list(grp.geometry)
        overlap = sum(a.intersection(b).area for a, b in combinations(geoms, 2))
        touching = all(any(a.distance(b) < 1 for b in geoms if b is not a) for a in geoms)
        kind = "overlapping" if overlap > tol else ("touching/adjacent" if touching else "disjoint parts")
        notes.append(f"`{name}`: {len(grp)} rows ({kind}, overlap {overlap / KM2:.4f} km2) dissolved into one area.")
    return notes


def run(refresh: bool = False) -> None:
    cfg = load_config()
    acfg, tcfg, aud = cfg["arcgis"], cfg["tiger"], cfg["audit"]
    counties = tiger.counties(tcfg["state"], tcfg["audit_year"], refresh).to_crs(aud["crs"])

    from .boundaries import process_layer
    lines = [
        "# Boundary audit", "",
        f"Boundaries from the WFRC ArcGIS service, organizations: {', '.join(acfg['organizations'])}. "
        f"Counties from TIGER {tcfg['audit_year']}. A boundary is treated as equal to a county when their "
        f"overlap (intersection over union) is at least {aud['equivalent_iou']:.0%}.", "",
    ]
    summary: dict[str, dict] = {}
    for geo_type, lc in acfg["layers"].items():
        raw, meta = fetch_layer(acfg["service"], lc["layer"], refresh)
        gdf = process_layer(raw, geo_type, lc, acfg["organizations"]).to_crs(aud["crs"])
        lines += [f"## {geo_type.upper()}: {lc['label']}", "",
                  f"Layer `{meta['name']}`, last edited {meta['last_edit']}, {len(gdf)} area(s).", ""]
        for note in _same_name_rows(raw, acfg["organizations"], aud["crs"], aud["overlap_tolerance_m2"]):
            lines.append(f"- {note}")
        bad = [r["geo_id"] for _, r in gdf.iterrows() if r.geometry.is_empty or not r.geometry.is_valid]
        if bad:
            lines.append(f"- INVALID or empty geometry after repair: {bad}")
        overlaps = _overlaps(gdf, aud["overlap_tolerance_m2"])
        if overlaps:
            for a, b, km2 in overlaps:
                lines.append(f"- OVERLAP within layer: `{a}` and `{b}` share {km2:.2f} km2.")
        else:
            lines.append("- No overlaps between features in this layer.")
        lines.append("")
        lines += ["| Area | km2 | Equal to county | Counties touched (share of area / share of county) |",
                  "|---|---:|---|---|"]
        table = _county_table(gdf, counties, aud["equivalent_iou"], aud["min_county_overlap_km2"])
        for row in table:
            touched = "; ".join(f"{p['county']} ({p['of_boundary']:.0%} / {p['of_county']:.0%})" for p in row["counties"])
            lines.append(f"| `{row['geo_id']}` | {row['area_km2']:,.0f} | {row['equivalent_to'] or '-'} | {touched} |")
        lines.append("")
        summary[geo_type] = {r["geo_id"]: r["equivalent_to"] for r in table}

    write_if_changed(META / "boundary-audit.md", ("\n".join(lines) + "\n").encode("utf-8"))
    update_manifest("boundary_equivalence", summary)
    print(f"wrote {META / 'boundary-audit.md'}")
