"""ACS 5-year direct pulls: validate the configured tables, download whole tables for each geography,
and write long-format parquet files, one per topic and geography type (profiles/data/acs/<topic>/<geo>.parquet).

Every row published here has method = 'direct' (the Census Bureau published it at that geography).
Estimates of areas that are not Census geographies are built from these in the aggregation phase.
"""
from __future__ import annotations

import re

import pandas as pd

from .census import BASE, get_json
from .db import connect, write_parquet
from .paths import DATA, META, RAW
from .util import load_config, update_manifest

# Census annotation codes that replace a number: no data, not applicable, bound only, and so on.
SENTINEL_LIMIT = -222222222
ID_COLUMNS = ["state", "county", "place", "tract", "block group"]
VAR_RE = re.compile(r"^([A-Z]\d+[A-Z]?_\d+)([EMA]{1,2})$")


def dataset(vintage: int) -> str:
    return f"{BASE}/{vintage}/acs/acs5"


def clean_label(label: str) -> str:
    return re.sub(r"^(Estimate|Margin of Error for)!!", "", label).replace(":!!", " > ").replace("!!", " > ").rstrip(":")


def load_variables(vintage: int, refresh: bool = False) -> dict:
    return get_json(f"{dataset(vintage)}/variables.json", cache=RAW / "acs" / str(vintage) / "variables.json",
                    refresh=refresh)["variables"]


def validate(refresh: bool = False) -> pd.DataFrame:
    """Check the configured tables and geographies exist for each vintage and build the variable table.
    Raises with a list of every problem, so a bad config or a changed Census table fails loudly."""
    cfg = load_config()["acs"]
    rows, problems = [], []
    for vintage in cfg["vintages"]:
        variables = load_variables(vintage, refresh)
        geo_json = get_json(f"{dataset(vintage)}/geography.json",
                            cache=RAW / "acs" / str(vintage) / "geography.json", refresh=refresh)
        levels = {f["name"] for f in geo_json["fips"]}
        for name, g in cfg["geographies"].items():
            level = g["for"].split(":")[0]
            if level not in levels:
                problems.append(f"{vintage}: geography '{level}' is not offered")
        for table, tc in cfg["tables"].items():
            found = [(code, v) for code, v in variables.items()
                     if code.startswith(table + "_") and code.endswith("E") and VAR_RE.match(code)]
            if not found:
                problems.append(f"{vintage}: table {table} has no estimate variables")
            for code, v in found:
                rows.append({"vintage": vintage, "table": table, "topic": tc["topic"],
                             "agg": tc.get("agg", "sum"), "weight": tc.get("weight"),
                             "custom": tc.get("custom", True), "variable": code[:-1],
                             "label": clean_label(v["label"]), "concept": v.get("concept", "")})
    if problems:
        raise RuntimeError("ACS validation failed:\n  " + "\n  ".join(problems))
    df = pd.DataFrame(rows).sort_values(["vintage", "variable"]).reset_index(drop=True)
    print(f"validated {len(cfg['tables'])} tables, {df.variable.nunique()} variables, "
          f"vintages {cfg['vintages']}")
    return df


def geo_id(df: pd.DataFrame, geo_type: str) -> pd.Series:
    cols = {"state": ["state"], "county": ["state", "county"], "place": ["state", "place"],
            "tract": ["state", "county", "tract"], "block_group": ["state", "county", "tract", "block group"]}
    return df[cols[geo_type]].agg("".join, axis=1)


def fetch_table(vintage: int, table: str, geo_type: str, gcfg: dict, refresh: bool) -> pd.DataFrame:
    params = {"get": f"NAME,group({table})", "for": gcfg["for"]}
    if "in" in gcfg:
        params["in"] = gcfg["in"]
    cache = RAW / "acs" / str(vintage) / f"{table}__{geo_type}.json"
    data = get_json(dataset(vintage), params, cache, refresh)
    df = pd.DataFrame(data[1:], columns=data[0])
    return df.loc[:, ~df.columns.duplicated()]  # group() repeats NAME


def to_long(raw: pd.DataFrame, geo_type: str, vintage: int) -> pd.DataFrame:
    """Wide Census response -> one row per geography and variable: estimate, moe, flag."""
    ids = geo_id(raw, geo_type)
    est, moe, flag = {}, {}, {}
    for col in raw.columns:
        m = VAR_RE.match(col)
        if not m:
            continue
        var, kind = m.groups()
        target = {"E": est, "M": moe, "EA": flag}.get(kind)
        if target is not None:
            target[var] = raw[col]
    long = []
    for var, e in est.items():
        e = pd.to_numeric(e, errors="coerce")
        m = pd.to_numeric(moe[var], errors="coerce") if var in moe else pd.Series(float("nan"), index=raw.index)
        f = flag[var].where(flag[var].notna() & (flag[var] != ""), None) if var in flag else None
        frame = pd.DataFrame({
            "geo_id": ids, "variable": var,
            "estimate": e.where(e > SENTINEL_LIMIT), "moe": m.where(m > SENTINEL_LIMIT),
        })
        # keep the annotation only where a number was replaced or bounded, so most rows carry none
        frame["flag"] = f if f is not None else None
        long.append(frame)
    out = pd.concat(long, ignore_index=True)
    out.insert(1, "geo_type", geo_type)
    out.insert(2, "vintage", vintage)
    out["method"] = "direct"
    return out


def names(vintage: int, refresh: bool = False) -> pd.DataFrame:
    """geo_id and Census NAME for state, county and place (the selectable standard geographies)."""
    cfg = load_config()["acs"]
    out = []
    for geo_type in ("state", "county", "place"):
        raw = fetch_table(vintage, next(iter(cfg["tables"])), geo_type, cfg["geographies"][geo_type], refresh)
        out.append(pd.DataFrame({"geo_id": geo_id(raw, geo_type), "geo_type": geo_type, "name": raw["NAME"]}))
    return pd.concat(out, ignore_index=True)


def run(refresh: bool = False) -> None:
    cfg = load_config()["acs"]
    variables = validate(refresh)
    con = connect()
    META.mkdir(parents=True, exist_ok=True)
    con.register("variables_df", variables)
    write_parquet(con, "SELECT * FROM variables_df", META / "variables.parquet", "vintage, variable")

    manifest: dict = {"vintages": cfg["vintages"], "tables": sorted(cfg["tables"]), "files": {}}
    by_file: dict[tuple[str, str], list[pd.DataFrame]] = {}
    for vintage in cfg["vintages"]:
        for geo_type, gcfg in cfg["geographies"].items():
            for table, tc in cfg["tables"].items():
                raw = fetch_table(vintage, table, geo_type, gcfg, refresh)
                by_file.setdefault((tc["topic"], geo_type), []).append(to_long(raw, geo_type, vintage))
            print(f"{vintage} {geo_type}: {len(raw)} geographies x {len(cfg['tables'])} tables")
    for (topic, geo_type), frames in sorted(by_file.items()):
        long = pd.concat(frames, ignore_index=True)
        con.register("long_df", long)
        dest = DATA / "acs" / topic / f"{geo_type}.parquet"
        write_parquet(con, "SELECT * FROM long_df", dest, "vintage, variable, geo_id")
        manifest["files"][f"{topic}/{geo_type}"] = {"rows": len(long), "bytes": dest.stat().st_size}
        con.unregister("long_df")
    update_manifest("acs", manifest)
