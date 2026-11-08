# APP-Community-Profiles

Community profiles ("facts and figures") for the Wasatch Front: a static, map-first dashboard for the WFRC region, counties,
cities and the WFRC planning areas (AOG, MPO, RPO and workshop areas), and the data pipeline behind it.

- ACS 5-year indicators with trends 2009–2024, annual population estimates (PEP), jobs, workers and commute flows (LODES) and
  employment and wages (QCEW).
- Every value carries a method label: `direct` (published by the Census Bureau for exactly this area), `aggregated` (an exact
  sum of whole block groups or blocks), `allocated` (split from block groups that are partly inside the area) or `derived`
  (a median interpolated from allocated brackets, with a margin of error built from the bracket margins).
- There is no backend. DuckDB-WASM reads the committed Parquet files in the browser.

The methods are written up in [METHODOLOGY.md](METHODOLOGY.md), which is also the in-app Methods page.

## Layout

| Path | Purpose |
|---|---|
| `config/config.yml` | Sources, vintages, boundary layers and audit thresholds (nothing is hardcoded in code) |
| `pipeline/` | The Python pipeline package |
| `tests/` | Pipeline tests (`uv run pytest`) |
| `data/` | Processed outputs, **committed**: `acs/`, `pep/`, `lodes/`, `qcew/`, `crosswalk/`, `boundaries/`, `web/` (simplified GeoJSON for the maps) and `meta/` (registry, variables, QA reports, `manifest.json`) |
| `raw/` | Local downloads, not tracked |
| `web/` | The app: Vite, Svelte 5 (runes), TypeScript, DuckDB-WASM, Observable Plot, MapLibre GL, d3-geo |
| `web/e2e/` | Playwright smoke tests, including axe checks in light and dark |
| `.github/workflows/` | CI and the GitHub Pages deploy |

## Run the app

```
cd web
npm ci
npm run dev          # http://localhost:5173, with the data served from ../data
npm run build        # type-checks, then builds web/dist (the data is copied into dist/data)
npm run preview      # serves the build at http://localhost:4173
npm test             # Vitest unit tests
npm run e2e          # Playwright smoke tests (Edge by default; PW_CHANNEL=chromium for Chromium)
```

All data URLs are relative to the page, so the build works from any base path or a plain static server. Set `BASE`
(for example `BASE=/APP-Community-Profiles/ npm run build`) when the site is served from a sub-path; the deploy workflow does.
The map basemap is OpenFreeMap (Positron in light mode, Dark in dark mode); everything else is bundled.

### How the app is built

A floating icon rail switches between ten screens (Overview, Map, People, Households, Housing, Income and poverty, Education, Jobs and economy, Commute, Indicators), each sized to fit one screen. The navbar search picks the area (filter by region, MPO, RPO, workshop areas, counties, cities); the compare pill picks a second area, suggesting areas of the same kind first and then the larger areas around it. A Year slider (with Play) drives every panel and highlights that year on every trend. The planned tabs and panels are in [docs/CHARTS.md](docs/CHARTS.md) and the design decisions in [docs/DESIGN.md](docs/DESIGN.md).

| Module (`web/src/`) | Role |
|---|---|
| `lib/db.ts`, `lib/data.ts` | Open DuckDB-WASM (`allowFullHTTPReads: true`, so servers without byte-range support still work) and every query: registry, indicators and series, PEP, LODES, OD flows, QCEW |
| `lib/indicators.ts`, `lib/specs.ts` | The headline indicators and the distribution charts, defined once as ACS variable codes |
| `lib/format.ts` | Number formats and the method labels |
| `lib/charts.ts`, `lib/place.ts`, `lib/map.ts`, `lib/classes.ts` | Plot charts (year highlight, pyramid), the place silhouette, the MapLibre choropleth (one or two variables) and its classes |
| `lib/flows.ts`, `lib/flowmap.ts`, `components/FlowMap.svelte` | The commute flow map (Commute, Where they go): live-and-work, commute in and out from LODES OD rows (`flows.ts`, unit tested), and the Flowmap.gl layer over its own MapLibre map (`flowmap.ts`; deck.gl and Flowmap.gl load only when it opens). Keep `@deck.gl/*` and `@luma.gl/*` at 9.3.5: with 9.4.x Flowmap.gl 9.4.0 draws but nothing can be hovered or clicked |
| `lib/app.svelte.ts`, `lib/hash.ts`, `lib/theme.svelte.ts` | State, the shareable URL hash (`#type=…&id=…&cmp=…&v=…&tab=…`) and light, dark or system theme |
| `components/` | Navbar, area picker, rail, context bar, panels (`ChartCard`, `ShareCard`, `TrendCard`, `PyramidCard`, `SeriesCard`), tiles, map card |
| `tabs/` | One file per screen |

Colour grammar, everywhere: **blue is the selected area and orange-brown is the compared area**; the population pyramid keeps the usual men blue, women pink. Method chips are tinted (green published, blue aggregate, amber estimate) and explain themselves on hover. The map's data ramps are neutral teal and a 3 by 3 bivariate palette, never the selection colours.

## Run the pipeline

```
uv sync
cp .env.example .env            # then add CENSUS_API_KEY
uv run python -m pipeline all   # or: uv run profiles all
```

`uv run profiles --help` lists the stages. On machines where Windows Application Control blocks the `profiles.exe` that uv
generates, use `uv run python -m pipeline <command>`, which does the same thing. Every stage caches downloads in `raw/`
and rewrites a tracked file in `data/` only when its bytes change, so a rerun leaves no git diff. Pass `--refresh` to download
again.

| Command | What it does | Output |
|---|---|---|
| `boundaries` | Snapshot WFRC AOG, MPO, RPO and workshop (FWS) areas from the ArcGIS service | `data/boundaries/<geo_type>.parquet` (GeoParquet) |
| `audit` | Compare each boundary with counties and with the others | `data/meta/boundary-audit.md` |
| `validate` | Check every configured ACS table and geography against each vintage | `data/meta/variables.parquet`, `data/meta/acs-availability.md` |
| `acs` | Download whole ACS 5-year tables (2009 to latest) for state, county, place, tract and block group | `data/acs/<topic>/<geo_type>.parquet` |
| `geographies` | Build the list of selectable areas | `data/meta/geographies.parquet` |
| `crosswalk` | Decennial counts of people, households and housing units by block, and TIGER block points → share of each ACS block group inside each WFRC area | `data/crosswalk/…`, `data/meta/boundary_quality.parquet` |
| `aggregate` | Apply the shares to ACS block groups to build the WFRC areas' tables | `data/acs/<topic>/{aog,mpo,rpo,fws}.parquet` |
| `pep` | Annual population estimates for state, counties, places and whole-county WFRC areas | `data/pep/*.parquet` |
| `lodes` | LEHD jobs by workplace (WAC), workers by residence (RAC) and commute flows (OD), 2002 to latest | `data/lodes/{wac,rac,od}/<geo_type>.parquet` |
| `qcew` | BLS establishments, employment and wages by county, ownership and industry | `data/qcew/*.parquet` |
| `qa` | Check the crosswalk reproduces published county totals in every vintage | `data/meta/crosswalk-qa.md` |
| `export` | Simplified GeoJSON for the web maps, and a point inside each area that has commute flows (where the flow map anchors its lines) | `data/web/<geo_type>.geojson`, `data/meta/centroids.parquet` |

`all` runs them in that order. ACS files are long format (`geo_id, geo_type, vintage, variable, estimate, moe, flag, method`).
Geography files are GeoParquet; spatial work runs in DuckDB with the spatial extension. The simplified GeoJSON in `data/web/`
is the only GeoJSON. Output is deterministic (ordered, zstd), and a size guard in the manifest flags files that grow unexpectedly.

### How the WFRC areas are built

A block belongs to an area when its internal point is inside the polygon. Each ACS block group is split between areas by the
the Decennial Census count of each block that its table counts: people, occupied homes or housing units (`weight: pop`, `hh` or `hu` in the config; the other counts and then land area are fallbacks). The weight is the count in each block, not the number of blocks.
Margins of error add the block group margins in quadrature, scaled by the share, which is conservative for large areas.
Medians are interpolated from allocated brackets and labeled `derived`. Poverty, group quarters, school enrollment and
disability are not published at block group, so those tables are split from tracts (`unit: tract` in the config); the app says so.
`METHODOLOGY.md` has the full account, and `data/meta/` has the QA reports.

### Reproducibility

From a fresh clone with no `raw/` and a Census API key in `.env`, `uv sync` then `uv run python -m pipeline all` downloads
everything again and rebuilds every tracked file in `data/` byte for byte. It takes about an hour and a half, mostly the ACS
downloads, and leaves about 1.1 GB in `raw/`. Tested on 2026-11-04 in the source repository and again after the move into this
one (no diff in `data/`).

## Notes

- `duckdb` is pinned to `1.5.4` in `pyproject.toml`. Newer builds (1.5.6, 2.0.0) were blocked by Windows Application Control on the
  maintainer's machine; it may test 2.0.0 and bump the pin if `LOAD spatial` works.
- Current boundaries are used for every period. MAG boundaries are filtered out through `arcgis.organizations` in the config and
  deferred to a later phase.
- Windows with CRLF line endings: `.gitattributes` normalises text to LF.
- The Census API key lives in `.env` (gitignored). Never print or commit it.
