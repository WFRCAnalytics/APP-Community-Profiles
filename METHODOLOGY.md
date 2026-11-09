# Community profiles: methods and sources

Where the numbers come from, how WFRC planning areas are built from Census geography, and what to keep in mind when reading them.

The community profiles show facts and figures for the Wasatch Front at several levels: the WFRC region, the metropolitan and rural planning areas, WFRC's workshop areas, counties, cities and the state. This page explains where each number comes from and how much weight it can bear.

## What you are looking at

Every value in the dashboard carries a label that says how it was made.

| Label | Meaning |
|---|---|
| **Census published** | The Census Bureau published this value for exactly this area (a county, city or the state), or the area is the same as a county. |
| **WFRC aggregate** | An exact sum of whole Census block groups or blocks that lie inside the area. |
| **WFRC estimate** | WFRC built the value from Census block groups that are only partly inside the area, or interpolated a median. It carries more uncertainty than a published value. |

Counties, cities and the state are always Census published. The WFRC region (the Association of Governments boundary), the Metropolitan Planning Organization (MPO), the Rural Planning Organizations (RPOs) and the workshop areas do not follow Census geography exactly, so WFRC builds them.

## Sources

| Topic | Source | Years | Finest geography used |
|---|---|---|---|
| People, households, housing, income, education, commuting | American Community Survey (ACS) 5-year estimates, Census Bureau | 2005–2009 through 2020–2024 | Block group (from the 2009–2013 period); county, city and tract before that |
| Allocation weights | Decennial Census counts of people, households and housing units in each block (2010 and 2020) | 2010, 2020 | Block |
| Annual population | Population Estimates Program, Census Bureau | 2010–2024 | County, city |
| Jobs, workers, commute flows | LEHD Origin-Destination Employment Statistics (LODES8), Census Bureau | 2002–2023 | Block |
| Employment, establishments, wages by industry | Quarterly Census of Employment and Wages (QCEW), Bureau of Labor Statistics | 2014–2025 | County |
| Boundaries | WFRC Administrative and Planning Area Boundaries (ArcGIS), Census TIGER/Line | Current | |

An ACS 5-year estimate pools five years of survey responses, so "2020–2024" is an average over those years. Adjacent periods share four of their five years: compare periods that do not overlap (for example 2014–18 with 2019–23) when looking for change.

## How the planning areas are built

1. **Assign blocks to areas.** Each Census block belongs to an area if its internal point falls inside the area's boundary.
2. **Split block groups.** The ACS publishes counts for block groups, which are larger than blocks. A block group that is only partly inside an area is split by what its table counts, using the Decennial Census count for every block: tables of people (age, race, jobs held, commuting) by the people living in each block, tables of households (tenure, income brackets, rent, rent burden, vehicles) by the occupied homes, and tables of all housing units (units in structure, year built, vacancy) by the housing units. It is the count in each block, not the number of blocks, that sets the share, and a block group's share can differ between tables: a block group with a dormitory has many people but few households in the part that lies inside an area. Where a block group has no count of the preferred kind (for example new development since the Census), the other counts and finally land area are used.
3. **Sum.** Values for the pieces are added up. Margins of error are combined by adding squares and taking the square root, scaled by the share used. The share itself is treated as exact, although it is a count of Census blocks, so the margins of split areas are slightly too narrow.
4. **Label.** If every block group is wholly inside the area the sum is exact and is labelled a WFRC aggregate. Otherwise it is a WFRC estimate. "Exact" describes the estimate: a margin of error always remains, because the underlying survey is a sample. The WFRC region (five whole counties) is summed from the counties' published estimates, with the margins of error combined as in step 3, which gives much narrower margins than adding up block groups; Morgan RPO is the same as Morgan County, so it uses the county's published values. A Census-controlled count (such as total population for a county) has no margin of error, so a sum made only of controlled counts has none either.

A few ACS tables, including poverty status and disability, are not published at block group, so for those the same method is applied to tracts, which are larger. They are the more approximate tables for the smaller areas.

LODES counts are already at the block, so jobs and workers for every area are exact sums of whole blocks, with no splitting.

### Medians

A median cannot be added across pieces. For WFRC areas, medians (household income, rent, home value and age) are interpolated from the distribution of allocated bracket counts, assuming values are spread evenly within a bracket. Checked against published county medians, the interpolation is within about 1.5% for rent, home value and age, and within about 3.3% for household income (on average 0.4% high), for counties of 50,000 people or more. Their margin of error is not the Census one, which needs design factors that are not published through the data service. It is built from the margins of the bracket counts: the share of households below the median gets a margin of error, and the median's limits are the values at 50% minus and plus that margin. Compared with the published county margins (counties of 50,000+), it is about the same for rent (ratio 1.0), a little wider for home value and income (1.1 to 1.2), and conservative for age (about 1.6 times too wide). It is empty when a limit falls in the open-ended top bracket.

### Time

History for WFRC areas uses today's boundary in every period, so a workshop area's trend means "this area as drawn now, over time". The Census block group geography changed in 2020, so periods ending 2019 and earlier use 2010 block groups and 2020 onward use 2020 block groups; each has its own block assignment. Block groups first appear in the Census data service with the 2009–2013 period, so the WFRC areas start there, while counties, cities and the state go back to 2005–2009. Tables that start later or changed their categories are listed in the [data documentation](https://github.com/WFRCAnalytics/APP-Community-Profiles/blob/main/data/meta/acs-availability.md). City trends follow each year's published city boundary, so annexations show up as growth.

## Reading the numbers

- **Margins of error.** ACS values are estimates from a sample. The margin of error is shown at the 90% confidence level; shaded bands on trend charts show it. Small areas have wide margins.
- **Dollars.** Income, rent and home value are in the dollars of each period and are not adjusted for inflation.
- **Population estimates.** The 2010s estimates are based on the 2010 Census and the 2020s on the 2020 Census, so the series steps at 2020: the state grows 2.4% from 2019 to 2020 against about 1.7% a year on either side, and some places move by tens of percent. Read the change across 2019 to 2020 as a change of base, not of growth. (The dashboard shows ACS populations; the estimates are in the data files only.)
- **Jobs.** LODES counts jobs by place of work and workers by place of residence. The Census Bureau adds noise to block counts to protect privacy, so jobs in very small areas are rough. Commute flows include workers who live outside Utah but exclude Utah residents who work outside the state. QCEW counts covered employment and is published only for counties, the state, and the WFRC areas that are whole counties; it will not match LODES exactly.
- **LODES breakdowns.** Educational attainment is reported only for workers 30 and older, so education shares are of those workers' jobs, not of all jobs. Race, ethnicity, sex and education are not reported before 2009, and firm age and firm size are zero for Utah in every year; the app shows these as not published rather than as 0%. Residents counted by LODES (workers who live here) include those working outside Utah, while commute flows count only in-state jobs, so the two totals differ by roughly 2% (about 33,700 workers in 2023: 1,652,761 against 1,619,040). The "workers who live here" tile uses the first, the commute-flow map the second.
- **Source quirks.** Some oddities are in the data as the Census Bureau publishes it, and are left as they are. Public administration jumps by about 11,000 jobs in Utah from 2009 to 2010 and stays there while total jobs are flat. LODES places each job at its employer's address, so one large employer can move many jobs into a single block: a block in Millcreek holds about 15,000 to 21,000 jobs in 2012 to 2019 and about 600 in 2020, which is why Millcreek's job count doubles in 2012 and halves in 2020 (county totals are not affected). Davis County's resident workers fall to 67,405 in 2006 (119,825 in 2007), apparently a geocoding gap in that year's source file. Place and county LODES series use the current boundary of each place in every year. QCEW's Morgan County professional services pay more than doubles in 2025 ($104,349 to $232,900 for 242 jobs), which is the published figure.
- **Missing values.** Where the Census withholds a value, it is left empty, not shown as zero.
- **Workshop areas.** Two workshop areas share a small sliver of boundary (about 0.06 km²); the few blocks there are counted in both.

## The PDF report

The report is built in your browser from the same files as the dashboard, for the area, comparison and year on screen. Charts and maps are drawn as vector graphics, so the text can be selected and the pages print sharply. It has bookmarks and a document language but no accessibility tags; the table view and CSV download of every chart in the dashboard are the accessible form.

- **Tract maps.** Each map shows the Census tracts that make up the area: every tract with at least a quarter of its own extent inside the area, and every tract that holds at least 2% of the area (so a small city inside one large tract shows that tract). Tracts that only touch the boundary are left out. A tract that crosses the boundary is drawn whole, because its value describes the whole tract. Tract values are the newest ACS vintage whose tracts match the 2020 boundaries, so a report for an earlier year still draws the newest tracts. Classes are five groups of equal count, taken from every tract on the page set so that two areas are classed alike.
- **Commute flow map.** The map is framed to reach the routes that carry about 75 percent of the jobs between the area and the other areas of its kind (at least 4 and at most 25 routes), plus the area itself. It draws the busiest routes in the style of the dashboard's flow map: straight flows from where workers live to where they work, an arrowhead at the job end, and colour and thickness that grow with the number of jobs; a route whose far end is off the frame is clipped at the edge and counted under the map. An area made of whole counties, such as the WFRC region, draws its flows between the area and the counties around it, summed from the county flow file. An area with neither, such as the MPO, gets a two-bar diagram of where its residents work and who holds its jobs instead. Flows to the rest of the state and to other states have no location on the map and are listed beneath it. With a comparison, the flow map shows the selected area only.
- **Poster.** The poster is one 24 by 36 inch page with a fixed set of figures, charts and two tract maps (income and poverty) of the selected area, and the flow map where the area has commute flows (otherwise four more charts). With a comparison, charts and key figures show both areas and the maps show the selected area only.
- **What is fixed.** Unlike the dashboard, each chart in the report has one chart type and a fixed set of variables, chosen for print.

## Reproducing and reusing the data

All data behind the dashboard is published as Parquet files in the [project repository](https://github.com/WFRCAnalytics/APP-Community-Profiles/tree/main/data), and every chart has a table view, and the Indicators tab has a CSV download. The pipeline that downloads and processes the sources is in the same repository. It is reproducible from scratch: `uv sync`, add a Census API key to `.env`, and `uv run python -m pipeline all` rebuild every file from the original sources. The repository also holds the checks that the processing reproduces published Census totals.

WFRC's material is licensed CC BY 4.0; data from other sources keeps its own terms. See the [WFRC analytics terms of use](https://wfrcanalytics.github.io/terms/).

## Suggested citation

Wasatch Front Regional Council, Community Profiles (wfrcanalytics.github.io/APP-Community-Profiles), using data from the U.S. Census Bureau (ACS, Decennial Census, Population Estimates Program, LEHD LODES) and the U.S. Bureau of Labor Statistics (QCEW).
