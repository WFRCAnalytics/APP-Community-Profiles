"""Filesystem locations. Raw downloads are gitignored; profiles/data is tracked."""
from pathlib import Path

PROFILES = Path(__file__).resolve().parents[2]
ROOT = PROFILES.parent
CONFIG_FILE = PROFILES / "config" / "config.yml"
RAW = PROFILES / "raw"
DATA = PROFILES / "data"
BOUNDARIES = DATA / "boundaries"
META = DATA / "meta"
