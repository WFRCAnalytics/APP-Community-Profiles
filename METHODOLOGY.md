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
2. **Split block groups.** The ACS publishes counts for block groups, which are larger than blocks. A block group that is only partly inside an area is split by how many people live in each of its blocks, using the Decennial Census count for every block: the share of the block group's population that lives in blocks inside the area. Household tables use the number of households in each block and housing tables the number of housing units, so the weight matches what the table counts. It is the count of people, households or housing units in each block, not the number of blocks, that sets the share. Where a block group has no counts (for example new development since the Census), the next available count, and finally land area, is used.
3. **Sum.** Values for the pieces are added up. Margins of error are combined by adding squares and taking the square root, scaled by the share used.
4. **Label.** If every block group is wholly inside the area the sum is exact and is labelled a WFRC aggregate. Otherwise it is a WFRC estimate. The WFRC region (five whole counties) is exact, and Morgan RPO is the same as Morgan County, so it uses the county's published values.

A few ACS tables, including poverty status and disability, are not published at block group, so for those the same method is applied to tracts, which are larger. They are the more approximate tables for the smaller areas.

LODES counts are already at the block, so jobs and workers for every area are exact sums of whole blocks, with no splitting.

### Medians

A median cannot be added across pieces. For WFRC areas, medians (household income, rent, home value and age) are interpolated from the distribution of allocated bracket counts, assuming values are spread evenly within a bracket. Checked against published county medians, the interpolation is within about 3% for counties of 50,000 people or more. These medians have no margin of error; the Census method for it needs design factors that are not published through the data service.

### Time

History for WFRC areas uses today's boundary in every period, so a workshop area's trend means "this area as drawn now, over time". The Census block group geography changed in 2020, so periods ending 2019 and earlier use 2010 block groups and 2020 onward use 2020 block groups; each has its own block assignment. Block groups first appear in the Census data service with the 2009–2013 period, so the WFRC areas start there, while counties, cities and the state go back to 2005–2009. Tables that start later or changed their categories are listed in the [data documentation](https://github.com/WFRCAnalytics/APP-Community-Profiles/blob/main/data/meta/acs-availability.md). City trends follow each year's published city boundary, so annexations show up as growth.

## Reading the numbers

- **Margins of error.** ACS values are estimates from a sample. The margin of error is shown at the 90% confidence level; shaded bands on trend charts show it. Small areas have wide margins.
- **Dollars.** Income, rent and home value are in the dollars of each period and are not adjusted for inflation.
- **Population estimates.** The 2010s estimates are based on the 2010 Census and the 2020s on the 2020 Census, so the series steps at 2020.
- **Jobs.** LODES counts jobs by place of work and workers by place of residence. The Census Bureau adds noise to block counts to protect privacy, so jobs in very small areas are rough. Commute flows include workers who live outside Utah but exclude Utah residents who work outside the state. QCEW counts covered employment and is published only for counties, the state, and the WFRC areas that are whole counties; it will not match LODES exactly.
- **Missing values.** Where the Census withholds a value, it is left empty, not shown as zero.
- **Workshop areas.** Two workshop areas share a small sliver of boundary (about 0.06 km²); the few blocks there are counted in both.

## Reproducing and reusing the data

All data behind the dashboard is published as Parquet files in the [project repository](https://github.com/WFRCAnalytics/APP-Community-Profiles/tree/main/data), and every chart has a table view, and the Indicators tab has a CSV download. The pipeline that downloads and processes the sources is in the same repository. It is reproducible from scratch: `uv sync`, add a Census API key to `.env`, and `uv run python -m pipeline all` rebuild every file from the original sources. The repository also holds the checks that the processing reproduces published Census totals.

WFRC's material is licensed CC BY 4.0; data from other sources keeps its own terms. See the [WFRC analytics terms of use](https://wfrcanalytics.github.io/terms/).

## Suggested citation

Wasatch Front Regional Council, Community Profiles (wfrcanalytics.github.io/APP-Community-Profiles), using data from the U.S. Census Bureau (ACS, Decennial Census, Population Estimates Program, LEHD LODES) and the U.S. Bureau of Labor Statistics (QCEW).
