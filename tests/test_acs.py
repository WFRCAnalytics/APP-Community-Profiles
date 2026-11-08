import pandas as pd

from pipeline.acs import clean_label, geo_id, to_long
from pipeline.geographies import split_place


def _raw():
    return pd.DataFrame({
        "NAME": ["Block Group 1", "Block Group 2"],
        "B19013_001E": ["97494", "-666666666"],
        "B19013_001M": ["1272", "-555555555"],
        "B19013_001EA": ["", "**"],
        "B19013_001MA": ["", ""],
        "state": ["49", "49"], "county": ["035", "035"], "tract": ["100100", "100200"],
        "block group": ["1", "2"],
    })


def test_geo_id_block_group_is_twelve_digits():
    assert geo_id(_raw(), "block_group").tolist() == ["490351001001", "490351002002"]


def test_to_long_nulls_sentinels_and_keeps_flags():
    long = to_long(_raw(), "block_group", 2024)
    a, b = long.sort_values("geo_id").to_dict("records")
    assert (a["estimate"], a["moe"]) == (97494.0, 1272.0) and pd.isna(a["flag"])
    assert pd.isna(b["estimate"]) and pd.isna(b["moe"]) and b["flag"] == "**"
    assert set(long["method"]) == {"direct"} and set(long["vintage"]) == {2024}


def test_clean_label():
    assert clean_label("Estimate!!Total:!!Male:") == "Total > Male"


def test_split_place():
    assert split_place("Salt Lake City city, Utah") == ("Salt Lake City", "city")
    assert split_place("Kearns CDP, Utah") == ("Kearns", "CDP")


def test_drifted_finds_a_row_whose_meaning_changed_under_the_same_id():
    from pipeline.acs import drifted
    old = {"B25034_002": "Built 2010 or later", "B25034_003": "Built 2000 to 2009"}
    new = {"B25034_002": "Built 2014 or later", "B25034_003": "Built  2000 to 2009"}
    assert drifted(old, new) == ["B25034_002"]
