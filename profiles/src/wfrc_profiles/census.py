"""Minimal Census Data API client. Responses are cached as JSON in profiles/raw/<source>/..."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

BASE = "https://api.census.gov/data"


def api_key() -> str:
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    if not key:
        sys.exit("CENSUS_API_KEY is not set. Copy .env.example to .env and add your key "
                 "(https://api.census.gov/data/key_signup.html).")
    return key


def get_json(url: str, params: dict | None = None, cache: Path | None = None, refresh: bool = False,
             retries: int = 4):
    """GET a Census endpoint as JSON, with retries. The API key is added here and never appears in
    cache files, logs or error messages."""
    if cache and cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    key = api_key()
    last = ""
    for attempt in range(retries):
        try:
            r = requests.get(url, params={**(params or {}), "key": key}, timeout=300)
        except requests.RequestException as e:
            last = str(e).replace(key, "***")
        else:
            if r.status_code == 200:
                data = r.json()
                if cache:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    cache.write_text(json.dumps(data), encoding="utf-8")
                return data
            last = f"HTTP {r.status_code}: {r.text[:200]}"
            if r.status_code < 500 and r.status_code != 429:
                break
        time.sleep(2 ** attempt)
    raise RuntimeError(f"Census API request failed for {url} {params}: {last}")
