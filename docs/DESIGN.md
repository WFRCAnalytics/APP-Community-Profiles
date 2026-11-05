# Design decisions for the app rebuild

Decided with the maintainer after reviewing layout prototypes (canvas "Community profiles layout prototypes", layouts A to D). Layout D is the target. The first Svelte build (map-first with a long side panel) is being replaced.

## Layout (D)

- **Navbar:** app name, search (find any city, county or planning area), Methods, theme toggle. No link to wfrc.utah.gov.
- **Floating icon rail** (rounded, shadowed, over the page like education-explorer) for the tabs: Overview, Population, Housing, Income and education, Jobs and commute, Indicators.
- **Map workspace** (left, about 390px, balanced: neither a thumbnail nor the whole page): a map of any variable, an optional second variable for a **bivariate map** (3 by 3 palette), a legend, the area pickers (kind, area, compare) and a short key to the method labels. This replaces the list of counties.
- **Content** (right): an area header with the compare switch and a **period slider with Play**, then the tab's screen.
- **Every tab is one screen**: no page scroll at 1440 by 900; panels are fixed grids that scale. Narrow screens stack and may scroll.
- Rounded panels (14 to 16px), Lucide icons, Bricolage Grotesque headings, Instrument Sans body, blue-tinted neutral chrome (education-explorer's "Atlas" tokens). Colour is for the data.

## Colour grammar

- Selected area blue (`#0072B2`), compared area orange-brown (`#BD4B00`), everywhere including the map outlines and tile compare lines. Okabe-Ito chart palette; separate light and dark steps.
- **Population pyramid uses the industry convention:** males blue on the left, females pink (`#CC79A7`) on the right. A compared area is a dashed outline.
- Map data ramps are neutral slate-blue and a standard 3 by 3 bivariate palette, never the blue or orange used for selection.

## The period control

The chosen ACS period (a slider labelled by end year, with Play) drives the whole screen: the pyramid and sex split redraw for that period, every trend chart highlights that period (ringed point, value label, guide), and the key figures show that period. A profile is always "as of" one period.

## Chart gallery to build (richer than the prototype)

Every chart has a table view and CSV. Each panel shows the selected area and, when comparing, the other area.

- **Overview:** key figures (population, households, median age, median income, rent, home value), map, population and income trends, pyramid.
- **Population:** men and women (counts, shares, sex ratio, female share over time), pyramid by period, age groups (under 18, 18 to 64, 65 and over) and 65-plus over time, race, Hispanic or Latino origin and its trend, median age over time, group quarters, language spoken at home, disability, nativity if added.
- **Housing:** own or rent, units in structure, year built, vacancy, household type and size, vehicles by tenure, rent and home value brackets, rent and owner cost burden, median rent and home value over time.
- **Income and education:** income brackets, median income over time, poverty over time, educational attainment, school enrollment, employment status and unemployment, internet access.
- **Jobs and commute:** jobs and workers over time, jobs by industry, who holds the jobs (age, earnings, education, race, sex, firm size), commute mode, travel time, where workers live and where residents work, QCEW employment and pay by industry.
- **Indicators:** the full indicator table with margins of error and method labels, CSV download.

## Kept from the first build

Data layer and queries, method labels and MOE handling, vintages and era split, URL hash state, accessible table views, light and dark themes, DuckDB-WASM reading the committed Parquet, no ranking or recommendations.
