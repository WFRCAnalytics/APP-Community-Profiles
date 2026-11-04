"""Command line entry point: `uv run profiles <command>`."""
from __future__ import annotations

import argparse

from dotenv import load_dotenv

from .paths import ROOT


def main(argv: list[str] | None = None) -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="profiles", description="WFRC community profiles data pipeline")
    parser.add_argument("command", choices=["boundaries", "audit", "validate", "acs", "geographies", "all"],
                        help="boundaries: snapshot ArcGIS boundaries; audit: compare with counties; "
                             "validate: check ACS tables; acs: pull ACS tables; geographies: build the "
                             "geography registry; all: everything")
    parser.add_argument("--refresh", action="store_true", help="ignore cached raw downloads and fetch again")
    args = parser.parse_args(argv)

    # Imported here so `--help` stays fast and a missing key only matters for stages that need it.
    from . import acs, audit, boundaries, geographies

    con = None
    if args.command in ("boundaries", "all"):
        con = boundaries.run(args.refresh)
    if args.command in ("audit", "all"):
        audit.run(args.refresh, con)
    if args.command == "validate":
        acs.validate(args.refresh)
    if args.command in ("acs", "all"):
        acs.run(args.refresh)
    if args.command in ("geographies", "all"):
        geographies.run(args.refresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
