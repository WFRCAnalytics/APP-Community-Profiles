import pandas as pd

from wfrc_profiles.pep import melt_estimates


def test_melt_estimates_builds_long_rows_for_the_years_asked():
    df = pd.DataFrame({"STATE": ["49", "49"], "COUNTY": ["035", "011"],
                       "POPESTIMATE2020": ["100", "50"], "POPESTIMATE2021": ["110", "52"], "POPESTIMATE2022": ["9", "9"]})
    out = melt_estimates(df, df["STATE"] + df["COUNTY"], "county", 2024, [2020, 2021])
    assert sorted(out["year"].unique()) == [2020, 2021]
    row = out[(out["geo_id"] == "49035") & (out["year"] == 2021)].iloc[0]
    assert (row["estimate"], row["vintage"], row["method"], row["geo_type"]) == (110, 2024, "direct", "county")
