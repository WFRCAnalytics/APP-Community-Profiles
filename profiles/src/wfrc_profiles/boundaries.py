"""Pull WFRC planning boundaries from the ArcGIS FeatureServer and write tracked snapshots.

Raw layer responses are cached in profiles/raw/arcgis as GeoParquet. The processed snapshot (one
GeoParquet per geo_type plus meta/geographies.parquet) is what the rest of the pipeline uses, so results
stay reproducible even if the live service changes. Web-ready GeoJSON is derived later, at export time.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import geopandas as gpd
import pandas as pd
import requests
import shapely
from shapely.validation import make_valid

from .paths import BOUNDARIES, META, RAW
from .util import load_config, sha256, slugify, update_manifest, write_if_changed

PAGE = 1000


def _get(url: str, params: dict) -> dict:
    r = requests.get(url, params={"f": "json", **params}, timeout=120)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"ArcGIS error for {url}: {data['error']}")
    return data


def fetch_layer(service: str, layer: int, refresh: bool = False) -> tuple[gpd.GeoDataFrame, dict]:
    """Return (raw features, layer metadata), cached in profiles/raw/arcgis."""
    folder = RAW / "arcgis"
    geo_path, meta_path = folder / f"layer{layer}.parquet", folder / f"layer{layer}.meta.json"
    if geo_path.exists() and meta_path.exists() and not refresh:
        return gpd.read_parquet(geo_path), json.loads(meta_path.read_text(encoding="utf-8"))

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
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    gdf.to_parquet(geo_path, compression="zstd")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return gdf, meta


def make_id(geo_type: str, name: str, strip: list[str]) -> str:
    words = [w for w in name.split() if w not in strip]
    return f"{geo_type}-{slugify(' '.join(words))}"


def process_layer(raw: gpd.GeoDataFrame, geo_type: str, cfg: dict, orgs: list[str]) -> gpd.GeoDataFrame:
    """Filter to the configured organizations, dissolve same-name rows and assign stable IDs."""
    raw = raw[raw["Organization"].isin(orgs)].copy()
    raw["geometry"] = raw.geometry.apply(make_valid)
    dissolved = raw.dissolve(by="BoundaryName", aggfunc={
        "Organization": "first", "Acronym": "first", "Notes": "first",
    }).reset_index()
    dissolved["geo_type"] = geo_type
    dissolved["geo_id"] = [make_id(geo_type, n, cfg["name_strip"]) for n in dissolved["BoundaryName"]]
    dupes = dissolved["geo_id"][dissolved["geo_id"].duplicated()].tolist()
    if dupes:
        raise ValueError(f"duplicate geo_id in {geo_type}: {dupes}")
    out = dissolved.rename(columns={"BoundaryName": "geo_name", "Organization": "organization",
                                    "Acronym": "acronym", "Notes": "notes"})
    out = out[["geo_id", "geo_type", "geo_name", "organization", "acronym", "notes", "geometry"]]
    return out.sort_values("geo_id").reset_index(drop=True)


def write_snapshot(gdf: gpd.GeoDataFrame, geo_type: str) -> tuple[bool, str]:
    """Tracked GeoParquet snapshot, coordinates snapped to 1e-6 degrees (about 10 cm)."""
    gdf = gdf.copy()
    gdf["geometry"] = shapely.set_precision(gdf.geometry.values, 1e-6)
    tmp = RAW / "arcgis" / f"_{geo_type}.parquet"
    gdf.to_parquet(tmp, index=False, compression="zstd")
    data = tmp.read_bytes()
    tmp.unlink()
    return write_if_changed(BOUNDARIES / f"{geo_type}.parquet", data), sha256(data)


def write_registry(frames: list[gpd.GeoDataFrame]) -> None:
    reg = pd.concat([pd.DataFrame(f.drop(columns="geometry")) for f in frames], ignore_index=True)
    reg = reg.sort_values(["geo_type", "geo_id"]).reset_index(drop=True)
    META.mkdir(parents=True, exist_ok=True)
    tmp = RAW / "arcgis" / "_geographies.parquet"
    reg.to_parquet(tmp, index=False, compression="zstd")
    data = tmp.read_bytes()
    tmp.unlink()
    write_if_changed(META / "geographies.parquet", data)


def run(refresh: bool = False) -> dict[str, gpd.GeoDataFrame]:
    cfg = load_config()["arcgis"]
    frames, manifest = {}, {}
    for geo_type, lc in cfg["layers"].items():
        raw, meta = fetch_layer(cfg["service"], lc["layer"], refresh)
        gdf = process_layer(raw, geo_type, lc, cfg["organizations"])
        written, digest = write_snapshot(gdf, geo_type)
        frames[geo_type] = gdf
        manifest[geo_type] = {**meta, "source_features": len(raw), "kept_features": len(gdf),
                              "ids": gdf["geo_id"].tolist(), "sha256": digest}
        print(f"{geo_type}: {len(raw)} source rows -> {len(gdf)} areas ({'written' if written else 'unchanged'})")
    write_registry(list(frames.values()))
    update_manifest("boundaries", {"service": cfg["service"], "organizations": cfg["organizations"], "layers": manifest})
    return frames
