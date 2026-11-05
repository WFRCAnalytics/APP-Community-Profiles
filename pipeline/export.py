"""Web exports: simplified GeoJSON for the dashboard maps (data/web/<geo_type>.geojson).

GeoParquet stays the stored format; browsers read GeoJSON, so this stage derives it. Each feature has an
`id` property equal to the geo_id used in every data file. Geometries are simplified for the screen.
"""
from __future__ import annotations

import json

from . import tiger
from .db import connect, sql_path
from .paths import BOUNDARIES, DATA, META
from .util import load_config, update_manifest, write_if_changed

PRECISION = 1e-5     # degrees, about 1 m


def collection(con, query: str) -> bytes:
    rows = con.execute(query).fetchall()
    features = [{"type": "Feature", "properties": {"id": geo_id}, "geometry": json.loads(geom)}
                for geo_id, geom in sorted(rows)]
    return json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")).encode("utf-8")


def app_meta(cfg: dict) -> bytes:
    """data/meta/app.json: the names and defaults the web app reads instead of carrying its own."""
    first_bg = cfg["acs"]["geographies"]["block_group"]["since"]   # custom areas start with the first block-group vintage
    meta = {**cfg["app"], "state": cfg["state"], "outside_id": cfg["lodes"]["other_id"], "custom_since": first_bg}
    return json.dumps(meta, indent=1, sort_keys=True).encode("utf-8") + b"\n"


def run(refresh: bool = False) -> None:
    cfg = load_config()
    write_if_changed(META / "app.json", app_meta(cfg))
    state, year = cfg["state"]["abbr"], cfg["tiger"]["audit_year"]
    con = connect()
    sources = {t: (f"SELECT geo_id, geometry FROM read_parquet('{sql_path(BOUNDARIES / (t + '.parquet'))}')")
               for t in cfg["arcgis"]["layers"]}
    for kind, geo_type in (("counties", "county"), ("places", "place"), ("tracts", "tract")):
        path = tiger.cartographic(kind, state, year, refresh)
        sources[geo_type] = f"SELECT GEOID AS geo_id, geometry FROM read_parquet('{sql_path(path)}')"
    sources["state"] = (f"SELECT STATEFP AS geo_id, ST_Union_Agg(geometry) AS geometry "
                        f"FROM read_parquet('{sql_path(tiger.cartographic('counties', state, year))}') GROUP BY STATEFP")
    manifest = {}
    for geo_type, source in sources.items():
        query = (f"SELECT geo_id, ST_AsGeoJSON(ST_ReducePrecision(ST_SimplifyPreserveTopology(geometry::GEOMETRY, "
                 f"{cfg["export"]["simplify"][geo_type]}), {PRECISION})) FROM ({source})")
        data = collection(con, query)
        dest = DATA / "web" / f"{geo_type}.geojson"
        write_if_changed(dest, data)
        manifest[geo_type] = {"bytes": len(data)}
        print(f"{geo_type}: {len(data) / 1e6:.2f} MB")
    update_manifest("web_export", manifest)
