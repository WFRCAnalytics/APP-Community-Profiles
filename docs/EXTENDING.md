# Extending the profiles

Everything below is a change to `config/config.yml`, then `uv run python -m pipeline all`. The web app reads
`data/meta/app.json`, which the export step writes from the same file.

| To add | Change | Code change |
|---|---|---|
| A new ACS vintage | append the year to `acs.vintages` | none |
| A new LODES or QCEW year | append to `lodes.years` / `qcew.years` | none |
| A new PEP release | add a `pep.files` entry (use `{fips}` in file names) | none |
| An ACS table | add it under `acs.tables` with topic, weight and unit | none for the pipeline; a chart in `web/src/tabs` to show it |
| A planning area layer (another AOG, MPO, RPO, workshop area) | add a layer under `arcgis.layers` and the organisation under `arcgis.organizations` | add its type to `web/src/lib/indicators.ts` `GEO_TYPES` |
| A simplification tolerance for a new type | `export.simplify` | none |
| Another state | change `state` (abbr, fips, name), the `arcgis` source, `pep.files`, `app.defaults`, `app.benchmarks`, `app.region_labels`, `lodes.other_id`, `qa.reference_area` | none for one state at a time |

`{fips}` in any string of the config is replaced by `state.fips`. The LODES file prefix is derived from `state.abbr`.

Not yet generic: the area layers are read from an ArcGIS feature service (a different source needs a new reader in
`pipeline/boundaries.py`), and the web app lists its geography types in `GEO_TYPES`. A run covers one state; several
states means one checkout per state.
