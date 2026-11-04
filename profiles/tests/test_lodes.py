import gzip

import pandas as pd
import pytest

from wfrc_profiles import lodes
from wfrc_profiles.db import connect

WAC_HEADER = ("w_geocode,C000,CA01,CA02,CA03,CE01,CE02,CE03,CNS01,CNS02,CNS03,CNS04,CNS05,CNS06,CNS07,CNS08,CNS09,"
              "CNS10,CNS11,CNS12,CNS13,CNS14,CNS15,CNS16,CNS17,CNS18,CNS19,CNS20,CR01,CR02,CR03,CR04,CR05,CR07,CT01,"
              "CT02,CD01,CD02,CD03,CD04,CS01,CS02,CFA01,CFA02,CFA03,CFA04,CFA05,CFS01,CFS02,CFS03,CFS04,CFS05,createdate")


def test_every_wac_column_has_a_label():
    cols = [c for c in WAC_HEADER.split(",") if c not in ("w_geocode", "createdate")]
    assert [c for c in cols if c not in lodes.VARIABLES] == []


def _csv(path, text):
    path.write_bytes(gzip.compress(text.encode()))
    return path


@pytest.fixture()
def con(tmp_path, monkeypatch):
    monkeypatch.setattr(lodes, "DERIVED", tmp_path / "derived")
    con = connect()
    rows = [("490350001001001", "state", "49"), ("490350001001002", "state", "49"), ("490110001001001", "state", "49"),
            ("490350001001001", "county", "49035"), ("490350001001002", "county", "49035"),
            ("490110001001001", "county", "49011"),
            ("490350001001001", "place", "4967000"),
            ("490350001001001", "mpo", "mpo-x")]
    con.register("bg_df", pd.DataFrame(rows, columns=["block", "geo_type", "geo_id"]))
    con.execute("CREATE TABLE block_geo AS SELECT * FROM bg_df")
    return con


def test_jobs_part_sums_blocks_and_drops_zero_rows_for_listed_types(con, tmp_path):
    src = _csv(tmp_path / "wac.csv.gz", "w_geocode,C000,CNS01,createdate\n"
                                         "490350001001001,10,4,20250101\n490350001001002,5,0,20250101\n"
                                         "490110001001001,7,0,20250101\n")
    part = lodes.jobs_part(con, "wac", 2022, src, drop_zero=["place"])
    got = {(g, t, v): j for g, t, v, j in con.execute(
        f"SELECT geo_id, geo_type, variable, jobs FROM read_parquet('{part.as_posix()}')").fetchall()}
    assert got[("49", "state", "C000")] == 22
    assert got[("49035", "county", "C000")] == 15
    assert got[("49011", "county", "CNS01")] == 0          # zeros kept for county
    assert got[("mpo-x", "mpo", "C000")] == 10
    assert ("4967000", "place", "C000") in got and ("4967000", "place", "CNS01") in got
    assert ("4967000", "place", "CNS01") in got and got[("4967000", "place", "CNS01")] == 4
    assert not any(t == "place" and j == 0 for (_, t, _), j in got.items())


def test_jobs_part_rejects_unlabelled_columns(con, tmp_path):
    src = _csv(tmp_path / "wac.csv.gz", "w_geocode,C000,ZZZ9\n490350001001001,1,1\n")
    with pytest.raises(RuntimeError, match="ZZZ9"):
        lodes.jobs_part(con, "wac", 2022, src, drop_zero=[])


def test_jobs_part_rejects_blocks_missing_from_the_crosswalk(con, tmp_path):
    src = _csv(tmp_path / "wac.csv.gz", "w_geocode,C000\n490999999999999,3\n")
    with pytest.raises(RuntimeError, match="missing from the crosswalk"):
        lodes.jobs_part(con, "wac", 2022, src, drop_zero=[])


def test_od_part_buckets_outside_origins(con, tmp_path):
    measures = ",".join(lodes.OD_VARIABLES)
    zeros = ",".join("0" for _ in lodes.OD_VARIABLES[1:])
    main = _csv(tmp_path / "main.csv.gz", f"w_geocode,h_geocode,{measures}\n"
                                          f"490350001001001,490350001001002,4,{zeros}\n"
                                          f"490350001001001,490110001001001,2,{zeros}\n")
    aux = _csv(tmp_path / "aux.csv.gz", f"w_geocode,h_geocode,{measures}\n"
                                        f"490110001001001,560010001001001,3,{zeros}\n")
    part = lodes.od_part(con, 2022, main, aux, ["county", "mpo"])
    rows = con.execute(f"SELECT geo_type, origin_id, dest_id, S000 FROM read_parquet('{part.as_posix()}') "
                       "ORDER BY 1, 2, 3").fetchall()
    assert ("county", "49035", "49035", 4) in rows
    assert ("county", "49011", "49035", 2) in rows
    assert ("county", "out-of-state", "49011", 3) in rows
    # mpo-x holds only the workplace block of the two main rows; both workers live elsewhere in Utah
    assert ("mpo", "other-ut", "mpo-x", 6) in rows
    # an out-of-state worker whose job is also outside the type's areas is not a flow of that type
    assert not any(o == "out-of-state" and t == "mpo" for t, o, _, _ in rows)
    assert not any(o == "other-ut" and d == "other-ut" for _, o, d, _ in rows)
