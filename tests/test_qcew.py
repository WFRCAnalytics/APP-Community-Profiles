"""The committed QCEW files: the state benchmark exists and agrees with its counties, and area sums are flagged where a county is withheld."""
import duckdb
import pytest

from pipeline.paths import DATA
from pipeline.util import load_config


def q(sql: str):
    return duckdb.sql(sql.replace("{d}", (DATA / "qcew").as_posix())).fetchall()


def test_state_levels_are_configured_for_the_state_file():
    qc = load_config()["qcew"]
    assert qc["state_agglvl"] == [50, 51, 54] and qc["agglvl"] == [70, 71, 74]


def test_state_file_has_every_year_and_sector():
    years, sectors = q("SELECT count(DISTINCT year), count(DISTINCT industry) FROM '{d}/state.parquet'")[0]
    assert years == len(load_config()["qcew"]["years"]) and sectors >= 20


def test_state_total_employment_matches_its_counties_each_year():
    rows = q("""
        SELECT s.year, s.value, c.total FROM '{d}/state.parquet' s
        JOIN (SELECT year, sum(value) AS total FROM '{d}/county.parquet'
              WHERE ownership = '0' AND industry = '10' AND variable = 'employment' GROUP BY year) c USING (year)
        WHERE s.ownership = '0' AND s.industry = '10' AND s.variable = 'employment'""")
    assert len(rows) == len(load_config()["qcew"]["years"])
    for year, state, counties in rows:
        assert state == pytest.approx(counties, rel=0.001), year      # BLS rounds each county, so allow a rounding gap


def test_single_county_area_uses_the_bls_pay_and_the_aog_sum_is_exact_where_nothing_is_withheld():
    # rpo-morgan is Morgan County: its pay is the county's, never recomputed from rounded employment.
    off = q("""
        SELECT count(*) FROM '{d}/areas.parquet' a JOIN '{d}/county.parquet' c
          ON c.geo_id = '49029' AND c.year = a.year AND c.ownership = a.ownership AND c.industry = a.industry AND c.variable = a.variable
        WHERE a.geo_id = 'rpo-morgan' AND a.variable = 'avg_annual_pay' AND a.flag IS NULL AND a.value IS DISTINCT FROM c.value""")
    assert off[0][0] == 0
    bad = q("""
        SELECT count(*) FROM '{d}/areas.parquet' a JOIN (SELECT year, ownership, industry, sum(value) AS v FROM '{d}/county.parquet' c2
          JOIN read_parquet('data/meta/area_counties.parquet') m ON m.county = c2.geo_id AND m.geo_id = 'aog-wfrc'
          WHERE variable = 'employment' GROUP BY ALL) c USING (year, ownership, industry)
        WHERE a.geo_id = 'aog-wfrc' AND a.variable = 'employment' AND a.flag IS NULL AND abs(a.value - c.v) > 0.5""")
    assert bad[0][0] == 0


def test_area_sums_missing_a_withheld_county_are_flagged_partial():
    # No unflagged area row may be missing a county that BLS withheld.
    rows = q("""
        SELECT count(*) FROM '{d}/areas.parquet' a
        JOIN (SELECT c.year, c.ownership, c.industry FROM '{d}/county.parquet' c JOIN read_parquet('data/meta/area_counties.parquet') m
              ON m.county = c.geo_id AND m.geo_id = 'aog-wfrc' WHERE c.variable = 'employment' AND c.flag = 'suppressed') w
          USING (year, ownership, industry)
        WHERE a.geo_id = 'aog-wfrc' AND a.variable = 'employment' AND a.flag IS NULL""")
    assert rows[0][0] == 0
