import geopandas as gpd
import pytest
from shapely.geometry import box

from pipeline.boundaries import make_id, process_layer
from pipeline.db import connect, write_parquet
from pipeline.util import slugify, write_if_changed

CFG = {"name_strip": ["Co."]}


@pytest.fixture(scope="module")
def con():
    return connect()


def _raw(tmp_path, rows):
    gdf = gpd.GeoDataFrame(
        [{"OBJECTID": i, "BoundaryName": n, "Organization": o, "Acronym": None, "Notes": None, "geometry": g}
         for i, (n, o, g) in enumerate(rows)],
        crs="EPSG:4326",
    )
    path = tmp_path / "raw.parquet"
    gdf.to_parquet(path)
    return path


def test_slugify():
    assert slugify("Southwest Salt Lake Co.") == "southwest-salt-lake-co"


def test_make_id_strips_words():
    assert make_id("fws", "Southwest Salt Lake Co.", ["Co."]) == "fws-southwest-salt-lake"
    assert make_id("mpo", "WFRC MPO Planning Area", ["MPO", "Planning", "Area"]) == "mpo-wfrc"


def test_process_layer_dissolves_same_name_and_filters_org(con, tmp_path):
    raw = _raw(tmp_path, [
        ("Northern Salt Lake Co.", "WFRC", box(0, 0, 1, 1)),
        ("Northern Salt Lake Co.", "WFRC", box(1, 0, 2, 1)),
        ("Other", "MAG", box(5, 5, 6, 6)),
    ])
    table = process_layer(con, raw, "fws", CFG, ["WFRC"])
    rows = con.execute(f"SELECT geo_id, ST_Area(geometry), acronym FROM {table}").fetchall()
    assert rows == [("fws-northern-salt-lake", 2.0, None)]


def test_write_if_changed(tmp_path):
    p = tmp_path / "a.bin"
    assert write_if_changed(p, b"x") is True
    assert write_if_changed(p, b"x") is False
    assert write_if_changed(p, b"y") is True


def test_write_parquet_is_deterministic(con, tmp_path):
    dest = tmp_path / "out.parquet"
    q = "SELECT 'b' AS k, 2 AS v UNION ALL SELECT 'a', 1"
    assert write_parquet(con, q, dest, "k") is True
    assert write_parquet(con, q, dest, "k") is False
