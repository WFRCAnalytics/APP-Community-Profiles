"""TIGER/Line geometries through pygris, cached as GeoParquet under profiles/raw/tiger."""
from __future__ import annotations

from pathlib import Path

import pygris

from .paths import RAW


def counties(state: str, year: int, refresh: bool = False) -> Path:
    """Path to the cached county GeoParquet (NAD83, EPSG:4269), downloading it with pygris if needed."""
    cache = RAW / "tiger" / f"counties_{state}_{year}.parquet"
    if not cache.exists() or refresh:
        gdf = pygris.counties(state=state, year=year, cb=False)
        cache.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_parquet(cache, compression="zstd")
    return cache
