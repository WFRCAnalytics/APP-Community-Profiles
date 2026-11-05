// Every headline indicator in one list. It drives the value tiles, the map metrics and the Indicators table, so a
// number is defined once. `num`/`den` are ACS variable codes (summed); a median uses `num` alone.
//
//   type  count  one variable, a count
//         median one variable, a median (WFRC areas interpolate it from brackets; it has no margin of error)
//         share  sum(num) / sum(den)
// `map: true` marks indicators that can colour the map (one topic, available for tracts).
import type { FormatId } from "./format";

export interface Indicator {
  id: string;
  label: string;
  topic: string;
  type: "count" | "median" | "share";
  num: string[];
  den?: string[];
  minus?: string[];
  format: FormatId;
  map: boolean;
  group: string;
}

const v = (table: string, ...n: number[]) => n.map((i) => `${table}_${String(i).padStart(3, "0")}`);
const range = (table: string, a: number, b: number) => v(table, ...Array.from({ length: b - a + 1 }, (_, i) => a + i));

const P = "Population";
const H = "Households and housing";
const I = "Income and education";
const C = "Commuting";

export const INDICATORS: Indicator[] = [
  { id: "pop", label: "Population", topic: "population", type: "count", num: v("B01001", 1), format: "int", map: true, group: P },
  { id: "median_age", label: "Median age", topic: "population", type: "median", num: v("B01002", 1), format: "one", map: true, group: P },
  { id: "under18", label: "Under 18", topic: "population", type: "share", num: [...v("B01001", 3, 4, 5, 6), ...v("B01001", 27, 28, 29, 30)], den: v("B01001", 1), format: "pct", map: true, group: P },
  { id: "age65", label: "Age 65 and over", topic: "population", type: "share", num: [...range("B01001", 20, 25), ...range("B01001", 44, 49)], den: v("B01001", 1), format: "pct", map: true, group: P },
  { id: "hispanic", label: "Hispanic or Latino", topic: "population", type: "share", num: v("B03003", 3), den: v("B03003", 1), format: "pct", map: true, group: P },
  { id: "households", label: "Households", topic: "households", type: "count", num: v("B25003", 1), format: "int", map: true, group: H },
  { id: "renters", label: "Renter households", topic: "households", type: "share", num: v("B25003", 3), den: v("B25003", 1), format: "pct", map: true, group: H },
  { id: "no_vehicle", label: "Households with no vehicle", topic: "households", type: "share", num: [...v("B25044", 3), ...v("B25044", 10)], den: v("B25044", 1), format: "pct", map: true, group: H },
  { id: "housing_units", label: "Housing units", topic: "housing", type: "count", num: v("B25002", 1), format: "int", map: true, group: H },
  { id: "vacant", label: "Vacant housing units", topic: "housing", type: "share", num: v("B25002", 3), den: v("B25002", 1), format: "pct", map: true, group: H },
  { id: "median_rent", label: "Median gross rent", topic: "housing", type: "median", num: v("B25064", 1), format: "money", map: true, group: H },
  { id: "median_value", label: "Median home value", topic: "housing", type: "median", num: v("B25077", 1), format: "money", map: true, group: H },
  { id: "rent_burden", label: "Renters paying 30%+ of income", topic: "housing", type: "share", num: range("B25070", 7, 10), den: v("B25070", 1), minus: v("B25070", 11), format: "pct", map: true, group: H },
  { id: "median_income", label: "Median household income", topic: "income", type: "median", num: v("B19013", 1), format: "money", map: true, group: I },
  { id: "poverty", label: "People below poverty", topic: "income", type: "share", num: v("B17001", 2), den: v("B17001", 1), format: "pct", map: true, group: I },
  { id: "bachelors", label: "Adults with a bachelor's degree or more", topic: "education", type: "share", num: range("B15003", 22, 25), den: v("B15003", 1), format: "pct", map: true, group: I },
  { id: "unemployment", label: "Unemployment rate", topic: "employment", type: "share", num: v("B23025", 5), den: v("B23025", 3), format: "pct", map: true, group: I },
  { id: "drive_alone", label: "Workers who drive alone", topic: "commute", type: "share", num: v("B08301", 3), den: v("B08301", 1), format: "pct", map: true, group: C },
  { id: "transit", label: "Workers who take transit", topic: "commute", type: "share", num: v("B08301", 10), den: v("B08301", 1), format: "pct", map: true, group: C },
  { id: "wfh", label: "Workers who work from home", topic: "commute", type: "share", num: v("B08301", 21), den: v("B08301", 1), format: "pct", map: true, group: C },
];

export const BY_ID: Record<string, Indicator> = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

// Every ACS variable an indicator reads, as a flat list.
export const variablesOf = (ind: Indicator): string[] => [...ind.num, ...(ind.den ?? []), ...(ind.minus ?? [])];

export type GeoType = "aog" | "mpo" | "rpo" | "fws" | "county" | "place" | "state";

// The geography types a reader can pick, in menu order.
export const GEO_TYPES: { id: GeoType; label: string; plural: string; custom: boolean }[] = [
  { id: "aog", label: "WFRC region (Association of Governments)", plural: "regions", custom: true },
  { id: "mpo", label: "Metropolitan Planning Organization", plural: "MPOs", custom: true },
  { id: "rpo", label: "Rural Planning Organization", plural: "RPOs", custom: true },
  { id: "fws", label: "Workshop area", plural: "workshop areas", custom: true },
  { id: "county", label: "County", plural: "counties", custom: false },
  { id: "place", label: "City or town", plural: "places", custom: false },
  { id: "state", label: "State", plural: "states", custom: false },
];
export const TYPE_LABEL: Record<string, string> = Object.fromEntries(GEO_TYPES.map((t) => [t.id, t.label]));
