"""Web exports: simplified GeoJSON for the dashboard maps (data/web/<geo_type>.geojson).

GeoParquet stays the stored format; browsers read GeoJSON, so this stage derives it. Each feature has an
`id` property equal to the geo_id used in every data file. Geometries are simplified for the screen.

It also writes meta/centroids.parquet (geo_id, geo_type, lon, lat): a point inside each area of a type that
has commute flows, where the flow map anchors its lines. The point is on the surface, not the plain centroid,
which falls outside crescent or split areas.

For each of those types it also writes a row for the pseudo-area `other-ut` ("Rest of Utah"): the commuters whose other end is a
Utah block outside every area of the type. Its geometry is the state minus the union of the areas, and its point is the pole of
inaccessibility of the largest piece of that remainder, shrunk by `export.rest_margin_m` so the point never sits on an area's edge.
"""
from __future__ import annotations

import json

import pandas as pd
import shapely
from pyproj import Transformer
from shapely.geometry import Point
from shapely.ops import polylabel, transform

from . import tiger
from .db import connect, sql_path, write_parquet
from .paths import BOUNDARIES, DATA, META
from .util import load_config, update_manifest, write_if_changed

PRECISION = 1e-5     # degrees, about 1 m


def collection(con, query: str) -> bytes:
    rows = con.execute(query).fetchall()
    features = [{"type": "Feature", "properties": {"id": geo_id}, "geometry": json.loads(geom)}
                for geo_id, geom in sorted(rows)]
    return json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")).encode("utf-8")


def centroids(con, sources: dict[str, str], geo_types: list[str]):
    """One row per area of the given types: a point guaranteed to lie inside it."""
    parts = [f"SELECT geo_id, '{t}' AS geo_type, ST_X(p) AS lon, ST_Y(p) AS lat FROM "
             f"(SELECT geo_id, ST_PointOnSurface(geometry::GEOMETRY) AS p FROM ({sources[t]}))" for t in geo_types]
    return " UNION ALL ".join(parts)


def rest_point(state, areas: list, margin: float):
    """A point in the part of `state` outside every one of `areas` (shapely geometries in a metric CRS), or None when no part of
    the remainder is wider than twice `margin`. Slivers left by boundaries that do not quite match vanish with the shrink."""
    rest = state.difference(shapely.union_all(areas)) if areas else state
    core = rest.buffer(-margin)
    pieces = [g for g in getattr(core, "geoms", [core]) if not g.is_empty]
    if not pieces:
        return None
    return polylabel(max(pieces, key=lambda g: g.area), tolerance=margin / 20)


def rest_of_state(con, sources: dict[str, str], geo_types: list[str], other_id: str, crs: int, margin: float) -> pd.DataFrame:
    """One `other-ut` row per geography type that leaves a remainder: geo_id, geo_type, lon, lat."""
    to_m = Transformer.from_crs(4326, crs, always_xy=True).transform
    to_deg = Transformer.from_crs(crs, 4326, always_xy=True).transform

    def load(source: str) -> list:
        rows = con.execute(f"SELECT ST_AsWKB(geometry::GEOMETRY) FROM ({source})").fetchall()
        return [transform(to_m, shapely.from_wkb(bytes(r[0]))) for r in rows]

    state = shapely.union_all(load(sources["state"]))
    out = []
    for t in geo_types:
        p = rest_point(state, load(sources[t]), margin)
        if p is None:
            print(f"rest of state: no remainder for {t}")
            continue
        lon, lat = transform(to_deg, Point(p)).coords[0]
        out.append({"geo_id": other_id, "geo_type": t, "lon": lon, "lat": lat})
        print(f"rest of state: {t} at {lon:.4f}, {lat:.4f}")
    return pd.DataFrame(out, columns=["geo_id", "geo_type", "lon", "lat"])


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
    od_types = cfg["lodes"]["od_geographies"]
    ex = cfg["export"]
    rest = rest_of_state(con, sources, od_types, cfg["lodes"]["other_id"], ex["metric_crs"], ex["rest_margin_m"])
    con.register("rest_df", rest)
    write_parquet(con, centroids(con, sources, od_types) + " UNION ALL SELECT geo_id, geo_type, lon, lat FROM rest_df",
                  META / "centroids.parquet", "geo_type, geo_id")
    print(f"centroids: {', '.join(od_types)}")
