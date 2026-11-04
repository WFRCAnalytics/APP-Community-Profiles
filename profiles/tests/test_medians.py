import math

import pandas as pd
import pytest

from wfrc_profiles.db import connect
from wfrc_profiles.medians import derive, interpolate, parse_range


@pytest.mark.parametrize("label,expected", [
    ("Total > Less than $10,000", (0, 10000)),
    ("Total > $10,000 to $14,999", (10000, 15000)),
    ("Total > $200,000 or more", (200000, math.inf)),
    ("Total > With cash rent > $100 to $149", (100, 150)),
    ("Total > Male > Under 5 years", (0, 5)),
    ("Total > Male > 5 to 9 years", (5, 10)),
    ("Total > Male > 18 and 19 years", (18, 20)),
    ("Total > Male > 20 years", (20, 21)),
    ("Total > Female > 85 years and over", (85, math.inf)),
    ("Total", None),
    ("Total > Male", None),
    ("Total > With cash rent", None),
    ("Total > No cash rent", None),
])
def test_parse_range(label, expected):
    assert parse_range(label) == expected


def test_interpolate_inside_a_bracket():
    assert interpolate([(0, 10, 10), (10, 20, 20), (20, 30, 10)]) == (15.0, None)


def test_interpolate_open_top_bracket_returns_bound_with_flag():
    assert interpolate([(0, 10, 1), (10, math.inf, 9)]) == (10, "+")


def test_interpolate_nothing():
    assert interpolate([(0, 10, 0)]) == (None, None)


def test_derive_combines_sexes_and_skips_direct_rows():
    con = connect()
    labels = [("B01001_003", "Total > Male > Under 5 years"), ("B01001_004", "Total > Male > 5 to 9 years"),
              ("B01001_027", "Total > Female > Under 5 years"), ("B01001_028", "Total > Female > 5 to 9 years"),
              ("B01001_001", "Total")]
    con.register("v_df", pd.DataFrame([{"vintage": 2024, "table": "B01001", "variable": v, "label": l} for v, l in labels]))
    con.execute("CREATE TABLE variables AS SELECT * FROM v_df")
    rows = []
    for geo, method in (("mpo-x", "allocated"), ("rpo-m", "direct")):
        for var, n in (("B01001_003", 10), ("B01001_004", 30), ("B01001_027", 10), ("B01001_028", 30), ("B01001_001", 80)):
            rows.append({"geo_id": geo, "geo_type": geo[:3], "vintage": 2024, "variable": var, "estimate": float(n),
                         "moe": None, "flag": None, "method": method})
    con.register("b_df", pd.DataFrame(rows))
    con.execute("CREATE TABLE built AS SELECT * FROM b_df")
    out = derive(con, "built", [{"target": "B01002_001", "table": "B01001"},
                                {"target": "B01002_002", "table": "B01001", "label_contains": "Male"}])
    got = {(r.variable, r.geo_id): (r.estimate, r.method) for r in out.itertuples()}
    # total: 20 under five, 60 aged 5-9, half is 40 -> 5 + (40 - 20) / 60 * 5 = 6.7
    assert got[("B01002_001", "mpo-x")] == (6.7, "derived")
    assert got[("B01002_002", "mpo-x")] == (6.7, "derived")
    assert not any(g == "rpo-m" for _, g in got)
