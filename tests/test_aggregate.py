"""The WFRC region is a union of whole counties, so its figures come from the counties' published rows."""
import duckdb
import pytest

from pipeline import aggregate
from pipeline.paths import DATA


def test_county_union_sums_estimates_and_adds_margins_in_quadrature():
    con = duckdb.connect()
    con.execute("CREATE TABLE variables AS SELECT 'V1' AS variable, 2024 AS vintage, 'sum' AS agg, true AS custom UNION ALL "
                "SELECT 'V2', 2024, 'sum', true UNION ALL SELECT 'V3', 2024, 'median', true")
    con.execute("CREATE TABLE county_unions AS SELECT 'aog-x' AS geo_id, c AS county FROM (VALUES ('1'), ('2')) t(c)")
    con.execute("""CREATE TABLE acs_county AS SELECT * FROM (VALUES
        ('1', 2024, 'V1', 30.0, 3.0, NULL), ('2', 2024, 'V1', 40.0, 4.0, NULL),
        ('1', 2024, 'V2', 10.0, NULL, NULL), ('2', 2024, 'V2', 20.0, NULL, NULL),
        ('1', 2024, 'V3', 5.0, 1.0, NULL), ('2', 2024, 'V3', NULL, NULL, NULL)) t(geo_id, vintage, variable, estimate, moe, flag)""")
    rows = {r[3]: r for r in con.execute(aggregate.county_union_sql("acs_county", 0)).fetchall()}
    assert rows["V1"][4:6] == (70.0, 5.0)         # 3 and 4 in quadrature
    assert rows["V2"][4:6] == (30.0, None)        # controlled counts have no margin
    assert "V3" not in rows                       # medians are never summed


def test_county_union_is_null_when_a_county_is_missing_its_estimate():
    con = duckdb.connect()
    con.execute("CREATE TABLE variables AS SELECT 'V1' AS variable, 2024 AS vintage, 'sum' AS agg, true AS custom")
    con.execute("CREATE TABLE county_unions AS SELECT 'aog-x' AS geo_id, c AS county FROM (VALUES ('1'), ('2')) t(c)")
    con.execute("CREATE TABLE acs_county AS SELECT * FROM (VALUES ('1', 2024, 'V1', 30.0, 3.0, NULL), ('2', 2024, 'V1', NULL, NULL, NULL)) "
                "t(geo_id, vintage, variable, estimate, moe, flag)")
    row = con.execute(aggregate.county_union_sql("acs_county", 0)).fetchone()
    assert row[4] is None and row[5] is None


def test_committed_region_matches_its_counties_with_county_margins():
    q = lambda s: duckdb.sql(s.replace("{d}", (DATA / "acs").as_posix()).replace("{m}", (DATA / "meta").as_posix())).fetchall()
    bad = q("""
        SELECT count(*) FROM '{d}/population/aog.parquet' a
        JOIN (SELECT c.vintage, c.variable, sum(c.estimate) e, sqrt(sum(power(coalesce(c.moe, 0), 2))) m, count(c.moe) n
              FROM '{d}/population/county.parquet' c JOIN '{m}/area_counties.parquet' w ON w.county = c.geo_id AND w.geo_id = 'aog-wfrc'
              GROUP BY ALL) u USING (vintage, variable)
        WHERE a.geo_id = 'aog-wfrc' AND a.method = 'aggregated'
          AND (abs(a.estimate - u.e) > 0.51 OR (u.n > 0 AND abs(a.moe - u.m) > 0.01) OR (u.n = 0 AND a.moe IS NOT NULL))""")
    assert bad[0][0] == 0
    pop, moe = q("SELECT estimate, moe FROM '{d}/population/aog.parquet' WHERE geo_id = 'aog-wfrc' AND vintage = 2024 AND variable = 'B01001_001'")[0]
    assert moe is None and pop == pytest.approx(1929244)       # the block-group margin was ±18,274 for a Census-controlled count
