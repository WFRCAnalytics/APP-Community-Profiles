"""Small helpers shared by the pipeline stages."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import yaml

from .paths import CONFIG_FILE, META


def load_config() -> dict:
    return yaml.safe_load(CONFIG_FILE.read_text(encoding="utf-8"))


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_if_changed(path: Path, data: bytes) -> bool:
    """Write bytes only when the content differs, so reruns leave no git diff. True if written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == data:
        return False
    path.write_bytes(data)
    return True


def update_manifest(section: str, content: dict) -> None:
    """Merge one section into data/meta/manifest.json (sorted keys, no timestamps)."""
    path = META / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    manifest[section] = content
    write_if_changed(path, (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"))
