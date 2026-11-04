# Crosswalk QA

ACS 2024 5-year allocated with era 2020 blocks. Tolerance 0.50% of the direct value.

## Counties rebuilt from polygons vs published

| Variable | Counties | Largest gap | Total allocated | Total published |
|---|---:|---:|---:|---:|
| `B01001_001` (pop) | 29 | 0.0000% | 3,392,331 | 3,392,331 |
| `B25003_001` (hh) | 29 | 0.0000% | 1,124,822 | 1,124,822 |
| `B25002_001` (hu) | 29 | 0.0000% | 1,223,468 | 1,223,468 |

## WFRC AOG vs the counties inside it

Whole counties found inside the AOG: 49011, 49029, 49035, 49045, 49057.

| Variable | AOG allocated | Counties published | Gap |
|---|---:|---:|---:|
| `B01001_001` (pop) | 1,929,244 | 1,929,244 | 0.0000% |
| `B25003_001` (hh) | 663,999 | 663,999 | 0.0000% |
| `B25002_001` (hu) | 700,016 | 700,016 | 0.0000% |

## Blocks inside more than one area of the same layer

- `fws`: 2 block(s)

## Block groups with no population count in the Decennial

These used the next available count (housing units, then land area):

- `aog-wfrc` block group 490459800001: used aland
- `rpo-tooele` block group 490459800001: used aland

