# Crosswalk QA

Tolerance 0.50% of the published value.

## By vintage

Largest relative gap across the 29 counties when rebuilt from polygons (counties), the WFRC AOG against the sum of its counties (AOG), and people in ACS block groups missing from the block table (unmatched).

| Vintage | Era | Counties: pop / hh / hu | AOG: pop / hh / hu | Unmatched people |
|---:|---:|---|---|---:|
| 2013 | 2010 | 0.005% / 0.005% / 0.007% | 0.000% / 0.000% / 0.000% | 0 |
| 2014 | 2010 | 0.005% / 0.006% / 0.008% | 0.000% / 0.000% / 0.000% | 0 |
| 2015 | 2010 | 0.006% / 0.006% / 0.008% | 0.000% / 0.000% / 0.000% | 0 |
| 2016 | 2010 | 0.006% / 0.007% / 0.007% | 0.000% / 0.000% / 0.000% | 0 |
| 2017 | 2010 | 0.006% / 0.007% / 0.007% | 0.000% / 0.000% / 0.000% | 0 |
| 2018 | 2010 | 0.006% / 0.007% / 0.007% | 0.000% / 0.000% / 0.000% | 0 |
| 2019 | 2010 | 0.005% / 0.006% / 0.007% | 0.000% / 0.000% / 0.000% | 0 |
| 2020 | 2020 | 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% | 0 |
| 2021 | 2020 | 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% | 0 |
| 2022 | 2020 | 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% | 0 |
| 2023 | 2020 | 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% | 0 |
| 2024 | 2020 | 0.000% / 0.000% / 0.000% | 0.000% / 0.000% / 0.000% | 0 |

## Interpolated medians vs published county medians

Medians interpolated from county bracket counts, compared with the Census-published county median (all counties and vintages, excluding open-ended results). Brackets are coarse for very small counties, so the check is applied to counties of at least 50,000 people, which is the scale of the WFRC areas; the worst case over all counties is shown for information.

| Median | Rows | Mean gap | Worst gap | Worst gap, counties of 50,000+ |
|---|---:|---:|---:|---:|
| `B19013_001` | 464 | 0.79% | 9.80% | 3.26% |
| `B25064_001` | 461 | 0.03% | 6.67% | 0.00% |
| `B25077_001` | 464 | 0.02% | 2.68% | 0.03% |
| `B01002_001` | 464 | 0.51% | 4.25% | 1.21% |
| `B01002_002` | 464 | 0.74% | 5.87% | 1.56% |
| `B01002_003` | 464 | 0.75% | 6.82% | 1.52% |

## Blocks inside more than one area of the same layer (era 2020)

- `fws`: 2 block(s)

## Block groups with no population count in the Decennial (era 2020)

These used the next available count (housing units, then land area):

- `aog-wfrc` block group 490459800001: used aland
- `rpo-tooele` block group 490459800001: used aland

## Employment data (LODES and QCEW)

Largest relative gap across all years between a total and the sum of its parts.

| Check | Gap |
|---|---:|
| LODES jobs: counties sum to the state | 0.0000% |
| LODES jobs: WFRC AOG equals its counties | 0.0000% |
| QCEW employment: WFRC AOG equals its counties | 0.0000% |

LODES jobs (all job types, by workplace) against QCEW covered employment in 2023. They differ by design (LODES counts jobs on a point in the year, QCEW an annual average, and each covers a different mix of workers), so this is a reasonableness check, not a test.

| County | LODES jobs | QCEW employment | LODES / QCEW |
|---|---:|---:|---:|
| `49035` | 775,993 | 787,881 | 0.98 |
| `49011` | 130,842 | 144,110 | 0.91 |
| `49057` | 122,390 | 120,101 | 1.02 |
| `49045` | 18,741 | 19,363 | 0.97 |
| `49029` | 3,089 | 3,020 | 1.02 |

