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

## Stages

| Command | What it does | Output |
|---|---|---|
| `boundaries` | Snapshot WFRC AOG, MPO, RPO and workshop (FWS) areas from the ArcGIS service | `data/boundaries/<geo_type>.parquet` (GeoParquet) |
| `audit` | Compare each boundary with counties and with the others | `data/meta/boundary-audit.md` |
| `validate` | Check every configured ACS table and geography exists in each vintage | `data/meta/variables.parquet` |
| `acs` | Download whole ACS 5-year tables for state, county, place, tract and block group | `data/acs/<topic>/<geo_type>.parquet` |
| `geographies` | Build the list of selectable areas | `data/meta/geographies.parquet` |

`uv run profiles all` runs them in that order. ACS files are long format (`geo_id, geo_type, vintage,
variable, estimate, moe, flag, method`) and every row from this stage has `method = direct`, meaning
the Census Bureau published it at that geography. Null estimates are Census "no data / not applicable"
codes. Spatial work runs in DuckDB with the spatial extension.

## Notes

- `duckdb` is pinned in `pyproject.toml`. If `LOAD spatial` fails with an Application Control policy
  error, the spatial binary for that DuckDB version is blocked on the machine; 1.5.4 loads on WFRC
  machines tested so far (1.5.6 and 2.0.0 were blocked on one).
- MAG boundaries are filtered out through `arcgis.organizations` in the config.
- Planned next: Decennial block weights and the crosswalk, historical vintages, LODES, PEP, QCEW.
