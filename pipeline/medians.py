"""Medians for WFRC areas, interpolated from bracket counts.

A median cannot be summed or allocated like a count. For the areas built from block groups we allocate
the bracket counts (household income, gross rent, home value, age) and interpolate the median linearly
inside the bracket that holds the 50th percentile. Brackets are read from the variable labels of each
vintage, so a year where the Census changed its brackets needs no special handling.

The result is a WFRC estimate (method = 'derived'). If the median falls in an open-ended top bracket
the lower bound is returned with flag '+'.

Margin of error: the Census method for a published median needs design factors that are not available through the API, so
`median_moe` follows its idea with what we do have. The share of households below the median has a margin of error computed from
the bracket counts' own margins (which already carry the survey's design effect); the 90% limits of the median are the values
whose cumulative share is 50% minus and plus that margin, and the margin of error is half their distance. It is empty when a limit
falls in an open-ended top bracket.
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


def interpolate(brackets: list[tuple[float, float, float]], q: float = 0.5) -> tuple[float | None, str | None]:
    """The q-th quantile (the median by default) of (lo, hi, count) brackets by linear interpolation; (None, None) when there
    are no counts."""
    brackets = sorted(brackets)
    total = sum(c for _, _, c in brackets)
    if not total > 0:
        return None, None
    half, cum = total * q, 0.0
    for lo, hi, count in brackets:
        if count > 0 and cum + count >= half:
            if math.isinf(hi):
                return lo, "+"
            return lo + (half - cum) / count * (hi - lo), None
        cum += count
    return None, None


def median_moe(brackets: list[tuple[float, float, float, float]]) -> float | None:
    """Margin of error (90%) of the interpolated median of (lo, hi, count, moe) brackets, or None when it cannot be bounded."""
    brackets = sorted(brackets)
    total = sum(b[2] for b in brackets)
    if not total > 0:
        return None
    half, cum, var_below = total / 2, 0.0, 0.0
    for lo, hi, count, moe in brackets:
        if count > 0 and cum + count >= half:
            frac = (half - cum) / count
            var_c = var_below + (frac * moe) ** 2
            break
        cum += count
        var_below += moe ** 2
    else:
        return None
    var_n = sum(b[3] ** 2 for b in brackets)
    # The Census proportion formula for the share below the median (p = 0.5); the ratio form when the root would be imaginary.
    radicand = var_c - 0.25 * var_n
    moe_p = math.sqrt(radicand if radicand >= 0 else var_c + 0.25 * var_n) / total
    plain = [b[:3] for b in brackets]
    lo_v, lo_flag = interpolate(plain, max(0.5 - moe_p, 0.0))
    hi_v, hi_flag = interpolate(plain, min(0.5 + moe_p, 1.0))
    if lo_v is None or hi_v is None or lo_flag or hi_flag:
        return None
    return (hi_v - lo_v) / 2


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
            SELECT b.geo_id, b.geo_type, b.vintage, k.lo, k.hi, sum(b.estimate) AS n,
                   sqrt(sum(power(coalesce(b.moe, 0), 2))) AS moe
            FROM {built} b JOIN brackets_df k ON k.variable = b.variable AND k.vintage = b.vintage
            WHERE b.method IN ({', '.join(repr(m) for m in methods)})
            GROUP BY ALL
        """).df()
        con.unregister("brackets_df")
        decimals = 1 if spec["target"].startswith("B01002") else 0
        for (geo_id, geo_type, vintage), g in counts.groupby(["geo_id", "geo_type", "vintage"]):
            value, flag = interpolate(list(zip(g["lo"], g["hi"], g["n"].fillna(0))))
            moe = None if value is None or flag else median_moe(list(zip(g["lo"], g["hi"], g["n"].fillna(0), g["moe"].fillna(0))))
            out.append({"geo_id": geo_id, "geo_type": geo_type, "vintage": int(vintage), "variable": spec["target"],
                        "estimate": None if value is None else round(value, decimals),
                        "moe": None if moe is None else round(moe, decimals + 1),
                        "flag": flag, "method": "derived"})
    cols = ["geo_id", "geo_type", "vintage", "variable", "estimate", "moe", "flag", "method"]
    return pd.DataFrame(out, columns=cols)
