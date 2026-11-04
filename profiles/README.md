# Community profiles

Data pipeline and (later) dashboard for the WFRC facts and figures / community profiles section.

## Setup on a new machine

```
uv sync
cp .env.example .env     # then add CENSUS_API_KEY
uv run profiles all
```

`uv run profiles --help` lists the stages. Every stage caches downloads in `profiles/raw/` (gitignored)
and rewrites a tracked file in `profiles/data/` only when its content changes. Pass `--refresh` to
download again.

## Layout

| Path | Purpose |
|---|---|
| `config/config.yml` | Sources, vintages, boundary layers and audit thresholds (nothing is hardcoded in code) |
| `src/wfrc_profiles/` | Pipeline code |
| `raw/` | Local downloads, not tracked |
| `data/` | Processed outputs, tracked (`boundaries/`, `meta/`, later `acs/`, `lodes/`, ...) |
| `tests/` | `uv run pytest` |

## Status

Phase 1 (boundaries): WFRC AOG, MPO, RPO and workshop (FWS) areas are snapshotted from the ArcGIS
service to `data/boundaries/`, with stable IDs (`aog-wfrc`, `rpo-tooele`, `fws-northern-salt-lake`, ...)
in `data/meta/geographies.parquet`. `data/meta/boundary-audit.md` reports how each boundary relates to
counties. MAG boundaries are filtered out through `arcgis.organizations` in the config.
