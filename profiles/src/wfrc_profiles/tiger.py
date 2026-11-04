"""TIGER/Line geometries through pygris, cached under profiles/raw/tiger."""
from __future__ import annotations

import geopandas as gpd
import pygris

from .paths import RAW


def counties(state: str, year: int, refresh: bool = False) -> gpd.GeoDataFrame:
    cache = RAW / "tiger" / f"counties_{state}_{year}.parquet"
    if cache.exists() and not refresh:
        return gpd.read_parquet(cache)
    gdf = pygris.counties(state=state, year=year, cb=False)
    cache.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(cache)
    return gdf
