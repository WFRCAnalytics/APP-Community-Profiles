"""Medians for WFRC areas, interpolated from bracket counts.

A median cannot be summed or allocated like a count. For the areas built from block groups we allocate
the bracket counts (household income, gross rent, home value, age) and interpolate the median linearly
inside the bracket that holds the 50th percentile. Brackets are read from the variable labels of each
vintage, so a year where the Census changed its brackets needs no special handling.

The result is a WFRC estimate (method = 'derived'). If the median falls in an open-ended top bracket
the lower bound is returned with flag '+'. Margins of error are not derived: the Census method needs
design factors that are not published through the API, so the margin is left empty.
"""
from __future__ import annotations

import math
import re

import duckdb
import pandas as pd

INF = math.inf
_NUM = r"\$?([\d,]+)"
RANGES = [
    (re.compile(rf"^Less than {_NUM}$"), lambda a: (0, num(a[0]))),
    (re.compile(rf"^{_NUM} to {_NUM}$"), lambda a: (num(a[0]), num(a[1]) + 1)),
    (re.compile(rf"^{_NUM} or more$"), lambda a: (num(a[0]), INF)),
    (re.compile(r"^Under (\d+) years$"), lambda a: (0, num(a[0]))),
    (re.compile(r"^(\d+) to (\d+) years$"), lambda a: (num(a[0]), num(a[1]) + 1)),
    (re.compile(r"^(\d+) and (\d+) years$"), lambda a: (num(a[0]), num(a[1]) + 1)),
    (re.compile(r"^(\d+) years and over$"), lambda a: (num(a[0]), INF)),
    (re.compile(r"^(\d+) years$"), lambda a: (num(a[0]), num(a[0]) + 1)),
]


def num(text: str) -> float:
    return float(text.replace(",", ""))


def parse_range(label: str) -> tuple[float, float] | None:
    """Bounds [lo, hi) of the last segment of a cleaned variable label, or None for totals and subtotals."""
    last = label.rsplit(" > ", 1)[-1].strip()
    for pattern, bounds in RANGES:
        m = pattern.match(last)
        if m:
            return bounds(m.groups())
    return None


def interpolate(brackets: list[tuple[float, float, float]]) -> tuple[float | None, str | None]:
    """Median of (lo, hi, count) brackets by linear interpolation; (None, None) when there are no counts."""
    brackets = sorted(brackets)
    total = sum(c for _, _, c in brackets)
    if not total > 0:
        return None, None
    half, cum = total / 2, 0.0
    for lo, hi, count in brackets:
        if count > 0 and cum + count >= half:
            if math.isinf(hi):
                return lo, "+"
            return lo + (half - cum) / count * (hi - lo), None
        cum += count
    return None, None


def bracket_table(con: duckdb.DuckDBPyConnection, table: str, label_contains: str | None) -> pd.DataFrame:
    """(vintage, variable, lo, hi) for every bracket variable of `table` in every vintage."""
    rows = con.execute('SELECT DISTINCT vintage, variable, label FROM variables WHERE "table" = ?', [table]).fetchall()
    out = []
    for vintage, variable, label in rows:
        if label_contains and label_contains not in label:
            continue
        r = parse_range(label)
        if r:
            out.append({"vintage": vintage, "variable": variable, "lo": r[0], "hi": r[1]})
    return pd.DataFrame(out)


def derive(con: duckdb.DuckDBPyConnection, built: str, specs: list[dict], variables: pd.DataFrame | None = None,
           methods: tuple[str, ...] = ("aggregated", "allocated")) -> pd.DataFrame:
    """Medians for every area and vintage in table `built` (geo_id, geo_type, vintage, variable, estimate,
    moe, flag, method), one row per spec target. Only rows whose method is in `methods` are used, so
    areas that take a county's published values keep the published median."""
    out = []
    for spec in specs:
        brackets = bracket_table(con, spec["table"], spec.get("label_contains"))
        if brackets.empty:
            continue
        con.register("brackets_df", brackets)
        counts = con.execute(f"""
            SELECT b.geo_id, b.geo_type, b.vintage, k.lo, k.hi, sum(b.estimate) AS n
            FROM {built} b JOIN brackets_df k ON k.variable = b.variable AND k.vintage = b.vintage
            WHERE b.method IN ({', '.join(repr(m) for m in methods)})
            GROUP BY ALL
        """).df()
        con.unregister("brackets_df")
        decimals = 1 if spec["target"].startswith("B01002") else 0
        for (geo_id, geo_type, vintage), g in counts.groupby(["geo_id", "geo_type", "vintage"]):
            value, flag = interpolate(list(zip(g["lo"], g["hi"], g["n"].fillna(0))))
            out.append({"geo_id": geo_id, "geo_type": geo_type, "vintage": int(vintage), "variable": spec["target"],
                        "estimate": None if value is None else round(value, decimals), "moe": None,
                        "flag": flag, "method": "derived"})
    cols = ["geo_id", "geo_type", "vintage", "variable", "estimate", "moe", "flag", "method"]
    return pd.DataFrame(out, columns=cols)
