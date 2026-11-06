from pipeline import export
from pipeline.db import connect


def test_centroid_lies_inside_a_crescent():
    con = connect()
    # A "C" shape: its plain centroid falls in the gap, outside the polygon.
    c = "ST_GeomFromText('POLYGON((0 0,10 0,10 2,2 2,2 8,10 8,10 10,0 10,0 0))')"
    q = export.centroids(con, {"county": f"SELECT '1' AS geo_id, {c} AS geometry"}, ["county"])
    geo_id, geo_type, lon, lat = con.execute(q).fetchone()
    assert (geo_id, geo_type) == ("1", "county")
    assert con.execute(f"SELECT ST_Contains({c}, ST_Point({lon}, {lat}))").fetchone()[0]
    assert not con.execute(f"SELECT ST_Contains({c}, ST_Centroid({c}))").fetchone()[0]


def test_rest_point_clears_every_area_and_skips_slivers():
    from shapely.geometry import box
    state = box(0, 0, 100, 100)
    areas = [box(0, 0, 40, 100), box(40, 0, 99.5, 30)]   # the second leaves a 0.5-wide sliver on the east edge
    p = export.rest_point(state, areas, margin=5)
    assert state.contains(p) and not any(a.buffer(5).contains(p) for a in areas)
    assert p.x > 40 and p.y > 30


def test_rest_point_is_none_when_areas_tile_the_state():
    from shapely.geometry import box
    assert export.rest_point(box(0, 0, 10, 10), [box(0, 0, 5, 10), box(5, 0, 10, 10)], margin=1) is None


def test_rest_point_uses_the_largest_piece_and_handles_no_areas():
    from shapely.geometry import box
    state = box(0, 0, 100, 100)
    p = export.rest_point(state, [box(30, -1, 40, 101)], margin=2)   # a wall splits the state; the east side is larger
    assert p.x > 40
    assert export.rest_point(state, [], margin=2) is not None
