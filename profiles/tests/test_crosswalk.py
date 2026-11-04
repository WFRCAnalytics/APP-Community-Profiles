import pandas as pd
import pytest

from wfrc_profiles import aggregate, crosswalk
from wfrc_profiles.db import connect

BG_A, BG_B = "490010000001", "490010000002"

# Four blocks: A1/A2 in block group A, B1/B2 in block group B. B has no 2020 people or housing, only land.
BLOCKS = [
    (BG_A + "001", BG_A, 100, 10, 4, 4, 0.5, 0.5),
    (BG_A + "002", BG_A, 100, 30, 12, 10, 1.5, 0.5),
    (BG_B + "001", BG_B, 300, 0, 0, 0, 0.5, 5.5),
    (BG_B + "002", BG_B, 100, 0, 0, 0, 1.5, 5.5),
]


@pytest.fixture()
def con():
    con = connect()
    con.register("raw_blocks", pd.DataFrame(BLOCKS, columns=["block", "bg", "aland", "pop", "hu", "hh", "x", "y"]))
    con.execute("CREATE TABLE blocks AS SELECT block, bg, aland, pop, hu, hh, ST_Point(x, y) AS geom FROM raw_blocks")
    return con


def _areas(*polys):
    return " UNION ALL ".join(f"SELECT '{i}' AS geo_id, ST_GeomFromText('{wkt}') AS geometry" for i, wkt in polys)


LEFT = "POLYGON((0 0, 1 0, 1 6, 0 6, 0 0))"      # holds A1 and B1
ALL = "POLYGON((-1 -1, 3 -1, 3 7, -1 7, -1 -1))"  # holds every block


def test_assign_uses_block_internal_points(con):
    crosswalk.assign(con, "blocks", _areas(("mpo-left", LEFT)), "ba")
    assert con.execute("SELECT block FROM ba ORDER BY 1").fetchall() == [(BG_A + "001",), (BG_B + "001",)]


def test_shares_weight_and_fallback(con):
    crosswalk.assign(con, "blocks", _areas(("mpo-left", LEFT)), "ba")
    crosswalk.shares(con, "blocks", "ba", "sh")
    rows = {(bg, w): (share, basis) for bg, w, share, basis in
            con.execute("SELECT bg, weight, share, basis FROM sh").fetchall()}
    assert rows[(BG_A, "pop")] == (0.25, "pop")        # 10 of 40 people
    assert rows[(BG_A, "hh")] == (4 / 14, "hh")        # 4 of 14 households
    assert rows[(BG_A, "hu")] == (0.25, "hu")          # 4 of 16 housing units
    assert rows[(BG_B, "pop")] == (0.75, "aland")      # nothing counted, so land area: 300 of 400


COUNTY = "POLYGON((-1 -1, 3 -1, 3 7, -1 7, -1 -1))"  # the one county of the toy geography


def _relations(con, areas):
    county = f"SELECT '49001' AS geo_id, ST_GeomFromText('{COUNTY}') AS geometry"
    return crosswalk.relations(con, areas, county, "rel")


def test_quality_alignment_and_equivalence(con):
    areas = _areas(("mpo-left", LEFT), ("rpo-all", ALL))
    crosswalk.assign(con, "blocks", areas, "ba")
    crosswalk.shares(con, "blocks", "ba", "sh")
    _relations(con, areas)
    crosswalk.quality(con, "sh", "rel", "q", whole=0.9999, equivalent_iou=0.995)
    q = {(g, w): (a, n_split, eq) for g, w, a, n_split, eq in
         con.execute("SELECT geo_id, weight, alignment, n_split, equivalent_to FROM q").fetchall()}
    assert q[("rpo-all", "pop")] == (1.0, 0, "49001")      # the whole county
    assert q[("mpo-left", "pop")][0] == 0.0 and q[("mpo-left", "pop")][1] == 2 and q[("mpo-left", "pop")][2] is None


def test_allocation_scales_estimate_and_moe(con):
    crosswalk.assign(con, "blocks", _areas(("mpo-left", LEFT)), "ba")
    crosswalk.shares(con, "blocks", "ba", "sh")
    _relations(con, _areas(("mpo-left", LEFT)))
    crosswalk.quality(con, "sh", "rel", "q", whole=0.9999, equivalent_iou=0.995)
    con.execute("CREATE TEMP TABLE shares AS SELECT 2020 AS era, * FROM sh")
    con.execute("CREATE TEMP TABLE quality AS SELECT 2020 AS era, * FROM q")
    con.register("v_df", pd.DataFrame([{"vintage": 2024, "variable": "B01001_001", "agg": "sum", "weight": "pop", "custom": True}]))
    con.execute("CREATE TEMP TABLE variables AS SELECT * FROM v_df")
    con.register("bg_df", pd.DataFrame([
        {"geo_id": BG_A, "vintage": 2024, "variable": "B01001_001", "estimate": 100.0, "moe": 20.0},
        {"geo_id": BG_B, "vintage": 2024, "variable": "B01001_001", "estimate": 40.0, "moe": 10.0}]))
    con.execute("CREATE TEMP TABLE acs_bg AS SELECT * FROM bg_df")
    row = con.execute(aggregate.allocation_sql("acs_bg", 2020, 0.9999)).df().iloc[0]
    est, moe, method = row["estimate"], row["moe"], row["method"]
    assert est == 100 * 0.25 + 40 * 0.75                         # 55
    assert moe == round((((20 * 0.25) ** 2) + ((10 * 0.75) ** 2)) ** 0.5, 2)
    assert method == "allocated"


def test_whole_counties_only_for_exact_unions(con):
    areas = _areas(("mpo-left", LEFT), ("rpo-all", ALL))
    _relations(con, areas)
    crosswalk.whole_counties(con, "rel", "wc", 0.995)
    assert con.execute("SELECT geo_id, county FROM wc ORDER BY 1").fetchall() == [("rpo-all", "49001")]


def test_county_unions_take_blocks_by_county_code_not_polygon(con):
    # the polygon misses block B2 (point at 1.5, 5.5), but the area is the whole county, so it gets all four
    tight = "POLYGON((0 0, 1 0, 1 6, 0 6, 0 0))"
    crosswalk.assign(con, "blocks", _areas(("rpo-all", tight)), "ba")
    assert con.execute("SELECT count(*) FROM ba").fetchone()[0] == 2
    con.execute("CREATE TABLE wc AS SELECT 'rpo-all' AS geo_id, '49001' AS county")
    crosswalk.assign_county_unions(con, "blocks", "ba", "wc")
    assert con.execute("SELECT count(*) FROM ba WHERE geo_id = 'rpo-all'").fetchone()[0] == 4
