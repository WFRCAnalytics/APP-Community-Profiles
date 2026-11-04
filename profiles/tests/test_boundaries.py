import geopandas as gpd
from shapely.geometry import box

from wfrc_profiles.boundaries import make_id, process_layer
from wfrc_profiles.util import slugify, write_if_changed

CFG = {"name_strip": ["Co."]}


def _raw(rows):
    return gpd.GeoDataFrame(
        [{"BoundaryName": n, "Organization": o, "Acronym": None, "Notes": None, "geometry": g} for n, o, g in rows],
        crs="EPSG:4326",
    )


def test_slugify():
    assert slugify("Southwest Salt Lake Co.") == "southwest-salt-lake-co"


def test_make_id_strips_words():
    assert make_id("fws", "Southwest Salt Lake Co.", ["Co."]) == "fws-southwest-salt-lake"
    assert make_id("mpo", "WFRC MPO Planning Area", ["MPO", "Planning", "Area"]) == "mpo-wfrc"


def test_process_layer_dissolves_same_name_and_filters_org():
    raw = _raw([
        ("Northern Salt Lake Co.", "WFRC", box(0, 0, 1, 1)),
        ("Northern Salt Lake Co.", "WFRC", box(1, 0, 2, 1)),
        ("Other", "MAG", box(5, 5, 6, 6)),
    ])
    out = process_layer(raw, "fws", CFG, ["WFRC"])
    assert out["geo_id"].tolist() == ["fws-northern-salt-lake"]
    assert out.geometry.iloc[0].area == 2


def test_write_if_changed(tmp_path):
    p = tmp_path / "a.bin"
    assert write_if_changed(p, b"x") is True
    assert write_if_changed(p, b"x") is False
    assert write_if_changed(p, b"y") is True
