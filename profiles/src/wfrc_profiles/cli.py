"""Command line entry point: `uv run profiles <command>`."""
from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from .paths import ROOT


def main(argv: list[str] | None = None) -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="profiles", description="WFRC community profiles data pipeline")
    parser.add_argument("command", choices=["boundaries", "audit", "all"],
                        help="boundaries: snapshot ArcGIS boundaries; audit: compare with counties; all: everything")
    parser.add_argument("--refresh", action="store_true", help="ignore cached raw downloads and fetch again")
    args = parser.parse_args(argv)

    # Imported here so `--help` stays fast and a missing key only matters for stages that need it.
    from . import audit, boundaries

    if args.command in ("boundaries", "all"):
        boundaries.run(args.refresh)
    if args.command in ("audit", "all"):
        audit.run(args.refresh)
    return 0


def require_census_key() -> str:
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    if not key:
        sys.exit("CENSUS_API_KEY is not set. Copy .env.example to .env and add your key "
                 "(https://api.census.gov/data/key_signup.html).")
    return key


if __name__ == "__main__":
    raise SystemExit(main())
