"""Small helpers shared by the pipeline stages."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import yaml

from .paths import CONFIG_FILE, META


def _fill(node, values: dict):
    """Replace {fips} and {abbr} in every string of the config."""
    if isinstance(node, str):
        return node.format(**values) if "{" in node else node
    if isinstance(node, list):
        return [_fill(n, values) for n in node]
    if isinstance(node, dict):
        return {k: _fill(v, values) for k, v in node.items()}
    return node


def load_config() -> dict:
    cfg = yaml.safe_load(CONFIG_FILE.read_text(encoding="utf-8"))
    st = cfg["state"]
    cfg = _fill(cfg, {"fips": st["fips"], "abbr": st["abbr"].lower()})
    cfg["lodes"]["state"] = st["abbr"].lower()   # LODES file prefix, derived
    return cfg


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
