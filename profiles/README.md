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
| `crosswalk` | Decennial block counts + TIGER block points -> share of each ACS block group inside each WFRC area | `data/crosswalk/unit_share_<era>.parquet`, `data/meta/boundary_quality.parquet` |
| `aggregate` | Apply the shares to ACS block groups to build the WFRC areas' tables | `data/acs/<topic>/{aog,mpo,rpo,fws}.parquet` |
| `pep` | Annual population estimates for state, counties, places, and whole-county WFRC areas | `data/pep/{state,county,place,areas}.parquet` |
| `lodes` | LEHD jobs by workplace (WAC), workers by residence (RAC) and commute flows (OD), 2002 to latest, summed from blocks | `data/lodes/{wac,rac,od}/<geo_type>.parquet`, `data/meta/lodes_variables.parquet` |
| `qcew` | BLS establishments, employment and wages by county, ownership and industry, 2014 to latest | `data/qcew/{state,county,areas}.parquet`, `data/meta/qcew_codes.parquet` |
| `qa` | Check the crosswalk reproduces published county totals in every vintage, and that jobs data adds up | `data/meta/crosswalk-qa.md` |

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

## Jobs and employment

- **LODES** (LEHD) counts jobs at the block, so the state, counties, places, tracts and every WFRC area
  are exact sums of whole blocks (`method = aggregated`); nothing is allocated. LODES8 uses 2020 blocks
  for every year, so the 2020-era block assignment serves the whole 2002 to latest series. WAC is jobs by
  workplace, RAC is workers by residence. Each has jobs by industry (the 20 NAICS sectors), age, earnings,
  race, ethnicity, education and sex, and WAC adds firm age and size. The Census Bureau adds noise to
  block counts, so small areas are rough. Place and tract files leave out rows of zero jobs (a missing row
  is zero); tracts are published for the latest year only.
- **OD** commute flows are summed between areas of the same geography type (WFRC areas, counties and
  places) and include workers who live outside Utah (the LODES aux files). In an OD file `other-ut` is a
  Utah block outside every area of that type and `out-of-state` is a worker living outside Utah. This
  gives the inflow and outflow of an area such as the MPO.
- **QCEW** is county-level covered employment and wages by industry and ownership, so only the state,
  counties and the WFRC areas that are whole counties (the AOG, Morgan RPO) are published. BLS withholds
  some cells (`flag = suppressed`, value empty); an area sum missing such a county is flagged `partial` and
  is a lower bound. QCEW and LODES count different things and will not match exactly.

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

## Dashboard

`index.qmd` is a Quarto dashboard (`format: wfrc-brand-dashboard`) built from Observable JS cells and the ES
modules in `assets/`; `methodology.qmd` explains sources and methods. Nothing is computed on a server: the
browser reads the tracked parquet files with DuckDB-WASM over HTTP range requests, draws charts with
Observable Plot and the map with MapLibre GL. The URL hash keeps the chosen area, comparison and period, so a
view can be shared.

| File | Role |
|---|---|
| `assets/data.js` | Opens DuckDB-WASM and holds every query (ACS, PEP, LODES, QCEW, map geometry) |
| `assets/indicators.js` | The headline indicators and geography types; drives value boxes, map metrics and the Indicators tab |
| `assets/specs.js` | Distribution charts (age, race, tenure, income, commute, jobs by industry...) as variable codes |
| `assets/charts.js`, `assets/map.js`, `assets/format.js` | Plot charts, the MapLibre map, number formatting |

Run `uv run profiles export` to refresh the simplified map geometry in `data/web/`, then
`quarto preview profiles/index.qmd`. The data files are read from `profiles/data/` by relative path, so the page
must be served over HTTP with range support (`quarto preview` does this). Runtime libraries load from jsDelivr
at pinned versions (DuckDB-WASM 1.29.0, Observable Plot 0.6.16, MapLibre 4.7.1) and the basemap from
OpenFreeMap. Each Quarto code cell holds one statement, so definitions are separate cells.

To test in a real browser, `scripts/tools` already carries `puppeteer-core`: open the rendered page, wait for
`.pf-value-number`, and look for console errors and `.observablehq--error` elements.

## Notes

- `duckdb` is pinned in `pyproject.toml`. If `LOAD spatial` fails with an Application Control policy
  error, the spatial binary for that DuckDB version is blocked on the machine; 1.5.4 loads on WFRC
  machines tested so far (1.5.6 and 2.0.0 were blocked on one).
- MAG boundaries are filtered out through `arcgis.organizations` in the config.
- Only the era needed by the configured ACS vintages is built (2020 blocks for 2020 and later vintages,
  2010 blocks for earlier ones), so adding historical vintages adds the 2010 crosswalk automatically.
- Planned next: the dashboard (Quarto, Observable Plot, DuckDB-WASM, MapLibre) and the web-ready exports.
