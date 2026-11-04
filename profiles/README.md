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
| `crosswalk` | Decennial block counts + TIGER block points -> share of each ACS block group inside each WFRC area | `data/crosswalk/bg_share_<era>.parquet`, `data/meta/boundary_quality.parquet` |
| `aggregate` | Apply the shares to ACS block groups to build the WFRC areas' tables | `data/acs/<topic>/{aog,mpo,rpo,fws}.parquet` |
| `qa` | Check the crosswalk reproduces published county totals | `data/meta/crosswalk-qa.md` |

`uv run profiles all` runs them in that order. ACS files are long format (`geo_id, geo_type, vintage,
variable, estimate, moe, flag, method`) and every row from this stage has `method = direct`, meaning
the Census Bureau published it at that geography. Null estimates are Census "no data / not applicable"
codes. Spatial work runs in DuckDB with the spatial extension.

## How the WFRC areas are built

A block belongs to an area when its internal point is inside the polygon. Each ACS block group is split
between areas by the Decennial block counts (people, households or housing units, chosen per table in
the config; land area is the last resort for a block group with no counts). The `method` column says how
a value was made: `direct` (the area equals a county, so the published county value is used),
`aggregated` (every block group lies wholly inside the area, so the sum is exact) or `allocated` (some
block groups are split, so it is a WFRC estimate). `data/meta/boundary_quality.parquet` has each area's
alignment score, the share of its weight that sits in whole block groups.

Margins of error for allocated and aggregated rows add the block group margins in quadrature, scaled by
the share. Summing block group margins overstates the uncertainty of large areas' population counts,
which the Census controls at county level, so treat those margins as conservative.

Medians are not summed or allocated; they are derived from brackets in a later phase. Workplace-based
tables (`B08601`, `B08603`) are not allocated; the work side comes from LODES.

## Notes

- `duckdb` is pinned in `pyproject.toml`. If `LOAD spatial` fails with an Application Control policy
  error, the spatial binary for that DuckDB version is blocked on the machine; 1.5.4 loads on WFRC
  machines tested so far (1.5.6 and 2.0.0 were blocked on one).
- MAG boundaries are filtered out through `arcgis.organizations` in the config.
- Only the era needed by the configured ACS vintages is built (2020 blocks for 2020 and later vintages,
  2010 blocks for earlier ones), so adding historical vintages adds the 2010 crosswalk automatically.
- Planned next: interpolated medians, historical vintages, LODES, PEP, QCEW.
