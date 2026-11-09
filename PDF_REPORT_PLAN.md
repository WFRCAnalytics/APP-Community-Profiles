# PDF community profile report: plan

Status: implemented (web/src/report/). Where the build differs from this plan:
- Charts are drawn directly with react-pdf vector primitives (`charts.tsx`), not converted from the dashboard's Plot SVG. It avoided the Plot-to-PDF fidelity risk below.
- The report has its own curated page list (`plan.ts`) instead of a shared module that the dashboard tabs also read, so the tabs were not touched.
- Maps are tract choropleths of the selected area (and of the compared one), with no basemap. The commute flow map is in the first release, framed by the routes that carry about 85 percent of the jobs.
- A one-page 24 by 36 inch poster format was added next to the document, in portrait and landscape.
- The cover and a closing page carry a link and a QR code back to the dashboard view. The overall population trend is on the overview page.

## Goal
One button downloads a complete, designed profile of the selected area (and the compared area, if one is chosen) for the chosen year, as a real vector PDF with selectable text, in portrait or landscape.

## What the Project Scoresheet does (`APP-Project-Scoresheet/src/lib/report/`)
- `@react-pdf/renderer` builds the document. Everything is loaded with a dynamic import on first click (the lazy chunk is about 1.2 MB; the app's initial load is unchanged).
- `reportModel.ts` turns the project into a plain data model first. `ReportDocument.tsx` only lays it out (cover, sections, running header and footer with page numbers, bookmarks, `wrap={false}` rows).
- Charts are the app's own components, mounted off-screen at print width (`captureCharts.tsx`), serialised to SVG, then converted to react-pdf vector primitives (`svgToPdf.tsx`). So they are the same charts, not screenshots.
- Colours are literal hex (`reportTheme.ts`); fonts are bundled static `.woff` files, so export works offline.
- `ExportPdfButton.tsx`: lazy import, busy and failed states, `downloadBlob`.

## What is different here
| Scoresheet | Community Profiles | Consequence |
|---|---|---|
| React; Recharts SVG | Svelte 5; Observable Plot SVG, plus HTML legends | `svgToPdf` must be extended (see Charts) |
| One fixed project object | Data loaded per card, inside the card, from live `app` state | Biggest piece of work: a headless data path (see Architecture) |
| Layout is fixed | Layout follows the screen: tiles plus a 3 x 2 grid per sub-tab | Landscape can mirror the screen; portrait is 2 x 3 |
| No maps | MapLibre choropleth (WebGL), Flowmap.gl (WebGL) | Maps are redrawn as vectors, not screenshotted |

## Decisions

**1. PDF engine: reuse `@react-pdf/renderer`.** The converter, font setup, header/footer and layout code already work and the same team owns them; it is only loaded in the lazy chunk, so a Svelte app pays nothing at startup. It needs `react` and `react-dom` as dependencies and TSX only under `src/report/` (`jsx: react-jsx` there). Fallback if the spike shows trouble with Vite 8 or the toolchain: `pdfmake` (no React, native SVG support, similar size). Rejected: `window.print()` with a print stylesheet. It is a two-day job but gives a print dialog instead of a download, browser-dependent headers and margins, no WebGL maps, and no control of page breaks.

**2. Orientation yes; paper size later.** Ship Portrait and Landscape on US Letter. Page size is a single constant the layout reads, because charts are vector and the grid is computed from the content width, so Tabloid costs little later. Not worth it now: each size doubles the visual QA matrix (areas x orientation x size), Legal has no layout benefit for a report, and A4 is irrelevant in Utah. Revisit if planners ask to print wall posters.

**3. Same panels on screen and in the PDF.** Today a tab's panels exist only as hand-written Svelte markup, so a report would silently drift as panels change. Move each tab's panel list into a typed module (`tabs/<tab>.panels.ts`: kind, title, spec, note) that both the tab template and the report read. Layout (grid classes, spans) stays in the tab. Adding a panel to a tab then adds it to the report.

**4. Maps are vector, no basemap.** Locator map and choropleths are drawn with `d3-geo` from `data/web/*.geojson` using the existing `classes.ts` breaks and ramp. Crisp at any zoom, offline, deterministic, no tile licence or attribution issues, and no dependence on WebGL `preserveDrawingBuffer`. The cost is that the PDF map has no streets; the screen map keeps them.

## Architecture

```
web/src/report/               (everything here is lazy-loaded)
  generate.ts                 entry: generateReport(snapshot, options) -> { blob, filename }
  snapshot.ts                 frozen { db, refs, v, years, lodesYear, qcewYear, urlHash }
  model.ts                    snapshot -> ReportModel (cover, sections, tables), runs all loads in parallel
  panels.ts                   shared panel definitions -> { tiles, charts[] } per tab
  capture.ts                  draw() a chart off-screen at print width -> inlined SVG string
  svgToPdf.tsx                SVG -> react-pdf primitives (ported, extended)
  maps.ts                     d3-geo vector maps from GeoJSON
  theme.ts, fonts.ts          literal hex colours, static .woff registration
  Document.tsx, pages/*.tsx   layout, parametrised by orientation
web/src/components/ReportButton.svelte   the UI
```

- **Snapshot, not live state.** The report reads `app.*` once and passes it everywhere, so changing area or year while it builds cannot corrupt it. The card `load()` functions already take `db, refs, v`; extract them to `lib/` as pure functions of a context and have the cards call those too.
- **Defaults, not screen toggles.** Each card has local view state (donut or bars, snapshot or trend, "rest" scope, table view). The report uses the card's default for the snapshot view and does not mirror toggles.
- **Compare mode** passes both refs; the charts already draw two series, so the report does too (blue selected, brick compared).
- **Year** is the chosen year; trends highlight it. The source line carries the ACS vintage text from `app.acs`.

## Charts
Plot output differs from Recharts, so `svgToPdf` needs these additions:
- Resolve `currentColor` and CSS variables. Robust way: mount the chart in a hidden stage, walk the nodes and write `getComputedStyle` fill, stroke, font-size and anchor onto each element as attributes before serialising, with a fixed light palette (never the user's dark mode).
- Drop Plot's `<style>` block and clip paths; keep `text-anchor`, rotate transforms and `tspan` flattening (already handled).
- HTML legends (`legend()` in `charts.ts`) become react-pdf rows with swatches built from the same `{label, color}` items. Expose those items from the draw functions instead of parsing the DOM.
- Tile sparklines, donut, pyramid and rate charts are covered by the same path; check each once.
- Render at the cell's width in CSS px (cell pt divided by 0.75) so the 12 px labels land near 9 pt.
- Fonts: react-pdf cannot use the app's variable or `woff2` files. Use static `.woff` (Poppins is already a dependency; add `@fontsource/inter` or whichever static family the brand uses).

## Document design
- **Cover:** WFRC logo, area name and type, year and ACS vintage, locator map (the existing silhouette logic), the six key tiles, generation date, deep link to the live app (the `#type=…&id=…&cmp=…&v=…` hash), and the compared area if any.
- **One section per tab, one page per sub-tab:** tiles strip, then the panel grid. Landscape is 3 columns x 2 rows, the same as the screen's `c3r2`; portrait is 2 columns x 3 rows. Pyramid and map-style panels span rows, as on screen.
- **Maps section:** choropleth small multiples (median income, density, and so on for the sub-areas of the selected area), same classes and legend as the screen.
- **Commute:** live-and-work, commute in and out figures (`lib/flows.ts`), top origins and destinations as bars. A vector flow map (top N arcs between area points from `centroids.parquet`) is optional and last.
- **Indicators appendix:** the full Indicators table with margins of error and method chips, a repeated header row, `wrap={false}` rows, paginated.
- **Methods and sources page:** method label legend (direct, aggregated, allocated, derived), data vintages from `manifest.json`, the "use with caution" rule, pointer to METHODOLOGY.md.
- **Running header and footer:** area name, year, page x of y, source line. PDF metadata (title, author, subject, language) and bookmarks per section.
- **Empty panels** show the screen's own message ("Not published for this area or year.") so the grid does not reflow and the gap is explained; entire empty sub-tabs (for example commute for a tract) are replaced by one line.
- **Filename:** `WFRC-Community-Profile_<area-slug>_<year>_<portrait|landscape>.pdf`, using `slug()`.

## UI
- A **Download report** button in the navbar next to Documentation (`Navbar.svelte`), opening a small popover: Orientation (Portrait, Landscape; remembered in `localStorage`, wrapped in try/catch as elsewhere), a "Download PDF" button, and a progress line ("Charts 14 of 38").
- Busy and failed states as in the Scoresheet button; Escape or a cancel link aborts the build (check an `AbortSignal` between steps).
- The button is disabled until `app.ready`, and hidden on the Methods page.

## Accessibility and limits
- react-pdf does not write tagged PDF, so screen readers get text in reading order but no structure or alt text. State this in the Methods page; the in-app table view and CSV stay the accessible route. Bookmarks and document language are set.
- Contrast: the report uses the light palette only, checked against the same thresholds as the app (axe covers the app, not the PDF, so check the palette values by hand).
- The build runs on the main thread. Show progress and yield between panels so the page stays responsive; a worker is not worth it unless the spike shows multi-second freezes.

## Phases
0. **Spike.** react-pdf under Vite 8 and Svelte 5, one Plot chart with a legend to a PDF in both orientations, fonts, chunk size and build time. Go or switch to pdfmake.
1. **Foundations.** Snapshot and pure load functions, shared panel lists for one tab (Overview), computed-style SVG capture, extended `svgToPdf`, theme and fonts.
2. **Skeleton.** Orientation-aware pages, cover, header and footer, tiles, Overview end to end in both orientations.
3. **All tabs.** Move the remaining tabs to shared panel lists, Commute figures, Indicators appendix, Methods page.
4. **Maps.** Locator, choropleths, then the optional vector flow map.
5. **UI, tests, docs.** Button and popover, progress and cancel, e2e, visual QA, README, `docs/CHARTS.md`, `docs/EXTENDING.md` ("a new panel appears in the PDF automatically") and the in-app Methods page.

## Testing
- **vitest:** the report model for a fixed snapshot, filename, year and compare handling, panel-list completeness (every tab lists at least its tiles), colour and font tables.
- **Playwright:** click Download in both orientations, check the download starts with `%PDF`, page size matches the orientation, and the text contains the area name and year (extract with `pdfjs-dist`, dev dependency). Run for state, region, county, small place, a custom area with no tracts or OD data, and compare mode.
- **Visual QA:** render every page to PNG with `pdfjs-dist` and review a matrix of those areas x two orientations; look for clipped labels, overflowing legends, empty panels and unreadable 8 pt text.
- Add the generated PDF page count and size to the e2e output so growth is noticed.

## Risks
- **Panel refactor touches every tab.** Do it tab by tab behind the existing e2e and axe tests so the screen app does not regress.
- **Plot to react-pdf fidelity** (clipped axis labels, `dy` text offsets, dashed lines, rounded bar ends). The spike and one tab end to end catch this early.
- **Long area names, many categories and dense legends** in a narrow portrait cell; add truncation rules and a per-panel minimum height.
- **Bundle and time:** about 1.2 MB lazy chunk plus fonts; a full build is expected to take a few seconds on a county and longer for a region with trends, so measure in the spike.
- **React in a Svelte repo:** isolated to `src/report/`, documented in README ("keep `react` and `@react-pdf/renderer` only for the report").

## Questions for you
1. Is a deep link on the cover acceptable (it exposes the live site URL), or should the PDF stay self-contained?
2. Should the report always include every sub-tab, or offer a "sections" checklist? The plan assumes everything, since you asked for a complete report; a checklist is a small add-on after Phase 5.
3. Do you want the vector flow map in the first release, or is a top-destinations bar chart enough?
