"""Decennial block counts (population, housing units, households) used as allocation weights."""
from __future__ import annotations

import pandas as pd

from . import tiger
from .census import BASE, get_json
from .paths import RAW
from .util import load_config


def block_weights(era: int, refresh: bool = False) -> pd.DataFrame:
    """One row per block: 15-digit `block` id and integer pop, hu, hh counts for the census year `era`."""
    cfg = load_config()
    d = cfg["decennial"][era]
    state, abbr = cfg["state"]["fips"], cfg["state"]["abbr"]
    frames = []
    for county in tiger.county_fips(abbr, cfg["tiger"]["audit_year"]):
        data = get_json(
            f"{BASE}/{d['dataset']}",
            {"get": f"{d['pop']},{d['hu']},{d['hh']}", "for": "block:*", "in": f"state:{state} county:{county} tract:*"},
            RAW / "decennial" / str(era) / f"{county}.json", refresh)
        df = pd.DataFrame(data[1:], columns=data[0])
        out = pd.DataFrame({"block": df["state"] + df["county"] + df["tract"] + df["block"]})
        for key in ("pop", "hu", "hh"):
            out[key] = pd.to_numeric(df[d[key]]).astype("int64")
        frames.append(out)
    return pd.concat(frames, ignore_index=True)
