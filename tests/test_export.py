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
