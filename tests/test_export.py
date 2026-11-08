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


def test_rest_point_prefers_the_weighted_centre_but_not_in_a_gap():
    import numpy as np
    from shapely.geometry import box
    state = box(0, 0, 100, 100)
    areas = [box(40, 0, 60, 100)]                      # leaves a west and an east half, 40 wide each
    w = (np.array([80.0, 90.0]), np.array([20.0, 25.0]), np.array([1.0, 1.0]))
    p = export.rest_point(state, areas, margin=2, weighted=w)
    assert (p.x, p.y) == (85.0, 22.5)                  # mean of both points, inside the east half
    gap = (np.array([10.0, 90.0]), np.array([50.0, 50.0]), np.array([1.0, 1.0]))   # mean (50, 50) is inside the area
    q = export.rest_point(state, areas, margin=2, weighted=gap)
    assert not areas[0].buffer(2).contains(q) and state.contains(q)
    assert abs(q.x - 38) < 1 or abs(q.x - 62) < 1      # the nearest clear point, not the middle of a half
    near = (np.array([41.0]), np.array([50.0]), np.array([1.0]))                  # inside the remainder but hugging an edge
    r = export.rest_point(state, areas, margin=5, weighted=near)
    assert r.distance(areas[0]) >= 5 - 1e-6
    assert export.rest_point(state, areas, margin=2, weighted=(np.array([]), np.array([]), np.array([]))) is not None


def test_rest_shape_is_the_state_minus_the_areas_without_slivers():
    from shapely.geometry import box
    state = box(0, 0, 100, 100)
    shape = export.rest_shape(state, [box(0, 0, 40, 100), box(40, 0, 99.5, 30)], margin=5)   # the second leaves a 0.5-wide sliver
    assert abs(shape.area - 60 * 70) < 1               # the 60 x 70 block in the north east; the sliver is gone
    assert export.rest_shape(box(0, 0, 10, 10), [box(0, 0, 5, 10), box(5, 0, 10, 10)], margin=1).is_empty


def test_weighted_centroid_is_used_inside_the_area_and_not_in_a_gap():
    con = connect()
    c = "ST_GeomFromText('POLYGON((0 0,10 0,10 2,2 2,2 8,10 8,10 10,0 10,0 0))')"      # a "C": its arms are far apart, the gap is outside
    sq = "ST_GeomFromText('POLYGON((20 0,30 0,30 10,20 10,20 0))')"
    con.execute("CREATE TEMP TABLE block_geo AS SELECT * FROM (VALUES ('b1','county','sq'),('b2','county','sq'),('b3','county','c'),('b4','county','c')) t(block, geo_type, geo_id)")
    con.execute("CREATE TEMP TABLE block_xy AS SELECT * FROM (VALUES ('b1',22.0,5.0,30.0),('b2',24.0,5.0,10.0),('b3',5.0,9.0,10.0),('b4',5.0,1.0,10.0)) t(block, lon, lat, jobs)")
    q = export.centroids(con, {"county": f"SELECT 'sq' AS geo_id, {sq} AS geometry UNION ALL SELECT 'c', {c}"}, ["county"], weighted=True)
    rows = {r[0]: (r[2], r[3]) for r in con.execute(q).fetchall()}
    assert rows["sq"] == (22.5, 5.0)                                                    # the jobs-weighted mean (30 at 22, 10 at 24)
    assert con.execute(f"SELECT ST_Contains({c}, ST_Point({rows['c'][0]}, {rows['c'][1]}))").fetchone()[0]   # the mean (5, 5) is in the gap
    assert rows["c"] != (5.0, 5.0)
