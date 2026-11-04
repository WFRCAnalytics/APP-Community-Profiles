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
| `validate` | Check every configured ACS table and geography against each vintage | `data/meta/variables.parquet`, `data/meta/acs-availability.md` |
| `acs` | Download whole ACS 5-year tables (2009 to latest) for state, county, place, tract and block group | `data/acs/<topic>/<geo_type>.parquet` |
| `geographies` | Build the list of selectable areas | `data/meta/geographies.parquet` |
| `crosswalk` | Decennial block counts + TIGER block points -> share of each ACS block group inside each WFRC area | `data/crosswalk/bg_share_<era>.parquet`, `data/meta/boundary_quality.parquet` |
| `aggregate` | Apply the shares to ACS block groups to build the WFRC areas' tables | `data/acs/<topic>/{aog,mpo,rpo,fws}.parquet` |
| `pep` | Annual population estimates for state, counties, places, and whole-county WFRC areas | `data/pep/{state,county,place,areas}.parquet` |
| `qa` | Check the crosswalk reproduces published county totals in every vintage | `data/meta/crosswalk-qa.md` |

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

Medians are not summed or allocated. For the WFRC areas they are interpolated from the allocated
bracket counts (household income, gross rent, home value, age) and labeled `derived`; the bracket
ranges are read from each vintage's variable labels. They carry no margin of error, because the Census
method needs design factors the API does not publish. `data/meta/crosswalk-qa.md` compares the same
interpolation with the published county medians. Workplace-based tables (`B08601`, `B08603`) are not
allocated; the work side comes from LODES.

An area is treated as a county (`direct`) or a union of whole counties when its polygon overlaps the
TIGER counties that closely (config `crosswalk`). Such areas take every block of those counties by
county code, which makes them exact in every era, and get annual population from the PEP county series.

## History

- ACS 5-year vintages run 2009 to the latest. Block groups exist in the API from 2013, so counties,
  places and tracts go back to 2009 but the WFRC areas start at 2013 (the 2009-2013 window).
  Vintages 2013-2019 use 2010 block groups and 2020 onward use 2020 block groups, so each era has its own
  crosswalk (2010 and 2020 Decennial blocks).
- Overlapping 5-year windows share years. Compare non-overlapping windows (for example 2014, 2019, 2024)
  for trends; adjacent vintages are for smoothing only.
- `data/meta/acs-availability.md` lists tables that start late or change their variables, so trends
  across those years need care. Dollar values are nominal, not inflation adjusted.
- Tracts and block groups are published for the latest vintage only; their history lives in
  `profiles/raw/derived/acs` and feeds the WFRC area tables.
- PEP 2010-2019 is based on the 2010 Census and 2020-2024 on the 2020 Census, so the series has a break
  between 2019 and 2020.

## Notes

- `duckdb` is pinned in `pyproject.toml`. If `LOAD spatial` fails with an Application Control policy
  error, the spatial binary for that DuckDB version is blocked on the machine; 1.5.4 loads on WFRC
  machines tested so far (1.5.6 and 2.0.0 were blocked on one).
- MAG boundaries are filtered out through `arcgis.organizations` in the config.
- Only the era needed by the configured ACS vintages is built (2020 blocks for 2020 and later vintages,
  2010 blocks for earlier ones), so adding historical vintages adds the 2010 crosswalk automatically.
- Planned next: LODES (jobs by industry, commute flows) and QCEW.
