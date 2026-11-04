"""Pull WFRC planning boundaries from the ArcGIS FeatureServer and write tracked snapshots.

Raw layer responses are cached in profiles/raw/arcgis as GeoParquet. The processed snapshot (one
GeoParquet per geo_type plus meta/geographies.parquet) is what the rest of the pipeline uses, so results
stay reproducible even if the live service changes. Spatial work runs in DuckDB (spatial extension).
Web-ready GeoJSON is derived later, at export time.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import geopandas as gpd
import requests

from .db import connect, sql_path, write_parquet
from .paths import BOUNDARIES, META, RAW
from .util import load_config, sha256, slugify, update_manifest

PAGE = 1000
PRECISION = 1e-6  # degrees, about 10 cm


def _get(url: str, params: dict) -> dict:
    r = requests.get(url, params={"f": "json", **params}, timeout=120)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"ArcGIS error for {url}: {data['error']}")
    return data


def fetch_layer(service: str, layer: int, refresh: bool = False) -> tuple[Path, dict]:
    """Return (path to the raw GeoParquet, layer metadata), downloading into profiles/raw/arcgis if needed."""
    folder = RAW / "arcgis"
    geo_path, meta_path = folder / f"layer{layer}.parquet", folder / f"layer{layer}.meta.json"
    if geo_path.exists() and meta_path.exists() and not refresh:
        return geo_path, json.loads(meta_path.read_text(encoding="utf-8"))

    info = _get(f"{service}/{layer}", {})
    features: list[dict] = []
    while True:
        page = _get(
            f"{service}/{layer}/query",
            {"where": "1=1", "outFields": "*", "outSR": 4326, "f": "geojson",
             "resultOffset": len(features), "resultRecordCount": PAGE},
        )
        features += page["features"]
        exceeded = page.get("exceededTransferLimit") or page.get("properties", {}).get("exceededTransferLimit")
        if not exceeded or not page["features"]:
            break
    edited = info.get("editingInfo", {}).get("lastEditDate")
    meta = {
        "layer": layer,
        "name": info["name"],
        "last_edit": datetime.fromtimestamp(edited / 1000, timezone.utc).strftime("%Y-%m-%d") if edited else None,
        "feature_count": len(features),
    }
    folder.mkdir(parents=True, exist_ok=True)
    gpd.GeoDataFrame.from_features(features, crs="EPSG:4326").to_parquet(geo_path, compression="zstd")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return geo_path, meta


def make_id(geo_type: str, name: str, strip: list[str]) -> str:
    words = [w for w in name.split() if w not in strip]
    return f"{geo_type}-{slugify(' '.join(words))}"


def process_layer(con: duckdb.DuckDBPyConnection, raw_path: Path, geo_type: str, cfg: dict,
                  orgs: list[str]) -> str:
    """Filter to the configured organizations, dissolve same-name rows and assign stable IDs.
    Creates table `areas_<geo_type>` (geo_id, geo_type, geo_name, organization, acronym, notes, geometry)
    in EPSG:4326 and returns its name."""
    table = f"areas_{geo_type}"
    marks = ", ".join("?" for _ in orgs)
    con.execute(f"""
        CREATE OR REPLACE TABLE {table}_raw AS
        SELECT BoundaryName AS geo_name,
               any_value(Organization) AS organization,
               CAST(any_value(Acronym) AS VARCHAR) AS acronym,
               CAST(any_value(Notes) AS VARCHAR) AS notes,
               ST_ReducePrecision(ST_Union_Agg(ST_MakeValid(geometry)), {PRECISION}) AS geometry
        FROM read_parquet('{sql_path(raw_path)}')
        WHERE Organization IN ({marks})
        GROUP BY BoundaryName
    """, orgs)
    names = [r[0] for r in con.execute(f"SELECT geo_name FROM {table}_raw").fetchall()]
    ids = {n: make_id(geo_type, n, cfg["name_strip"]) for n in names}
    dupes = sorted({i for i in ids.values() if list(ids.values()).count(i) > 1})
    if dupes:
        raise ValueError(f"duplicate geo_id in {geo_type}: {dupes}")
    con.execute("CREATE OR REPLACE TEMP TABLE idmap(geo_name VARCHAR, geo_id VARCHAR)")
    con.executemany("INSERT INTO idmap VALUES (?, ?)", list(ids.items()))
    con.execute(f"""
        CREATE OR REPLACE TABLE {table} AS
        SELECT m.geo_id, '{geo_type}' AS geo_type, r.geo_name, r.organization, r.acronym, r.notes, r.geometry
        FROM {table}_raw r JOIN idmap m USING (geo_name)
    """)
    return table


def write_snapshot(con: duckdb.DuckDBPyConnection, table: str, geo_type: str) -> tuple[bool, str]:
    dest = BOUNDARIES / f"{geo_type}.parquet"
    written = write_parquet(con, f"SELECT * FROM {table}", dest, "geo_id")
    return written, sha256(dest.read_bytes())


def write_registry(con: duckdb.DuckDBPyConnection, tables: list[str]) -> None:
    query = " UNION ALL ".join(
        f"SELECT geo_id, geo_type, geo_name, organization, acronym, notes FROM {t}" for t in tables)
    write_parquet(con, query, META / "geographies.parquet", "geo_type, geo_id")


def run(refresh: bool = False) -> duckdb.DuckDBPyConnection:
    cfg = load_config()["arcgis"]
    con = connect()
    tables, manifest = [], {}
    for geo_type, lc in cfg["layers"].items():
        raw_path, meta = fetch_layer(cfg["service"], lc["layer"], refresh)
        source_rows = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(raw_path)}')").fetchone()[0]
        table = process_layer(con, raw_path, geo_type, lc, cfg["organizations"])
        written, digest = write_snapshot(con, table, geo_type)
        ids = [r[0] for r in con.execute(f"SELECT geo_id FROM {table} ORDER BY geo_id").fetchall()]
        tables.append(table)
        manifest[geo_type] = {**meta, "source_features": source_rows, "kept_features": len(ids),
                              "ids": ids, "sha256": digest}
        print(f"{geo_type}: {source_rows} source rows -> {len(ids)} areas ({'written' if written else 'unchanged'})")
    write_registry(con, tables)
    update_manifest("boundaries", {"service": cfg["service"], "organizations": cfg["organizations"], "layers": manifest})
    return con
