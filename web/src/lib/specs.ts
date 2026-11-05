// Distribution charts, defined once: categories over ACS variable codes, and the builders that turn them
// into chart rows (a share of a total, with the margin of error, for the selected and compared areas).
import type { Db } from "./db";
import { acsLabels, acsVariables, lodesValues, lodesVariables, shareMoe, sumOf, type Ref } from "./data";
import { fmtInt, METHODS, methodOf } from "./format";

export interface AreaRef extends Ref {
  label: string;
}
export interface Category { label: string; vars: string[] }
export interface Spec { topic: string; den: string[]; minus?: string[]; categories: Category[] }
export interface ShareRow { category: string; series: string; value: number; count?: number; moe?: number | null; note?: string }

const code = (table: string, n: number) => `${table}_${String(n).padStart(3, "0")}`;
const codes = (table: string, ...n: number[]) => n.map((i) => code(table, i));
const span = (table: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => code(table, a + i));

// Sex by age, merged to 5-year groups (the Census splits 15-24 and 60-69 more finely).
const AGE_GROUPS: [string, number[], number[]][] = [
  ["Under 5", [3], [27]], ["5–9", [4], [28]], ["10–14", [5], [29]], ["15–19", [6, 7], [30, 31]],
  ["20–24", [8, 9, 10], [32, 33, 34]], ["25–29", [11], [35]], ["30–34", [12], [36]], ["35–39", [13], [37]],
  ["40–44", [14], [38]], ["45–49", [15], [39]], ["50–54", [16], [40]], ["55–59", [17], [41]],
  ["60–64", [18, 19], [42, 43]], ["65–69", [20, 21], [44, 45]], ["70–74", [22], [46]], ["75–79", [23], [47]],
  ["80–84", [24], [48]], ["85+", [25], [49]],
];
export const AGES = AGE_GROUPS.map((g) => g[0]);

// topic, total variable(s) and categories. `minus` removes rows that are not part of the base.
export const SPECS: Record<string, Spec> = {
  occupancy: { topic: "housing", den: codes("B25002", 1), categories: [{ label: "Occupied", vars: codes("B25002", 2) }, { label: "Vacant", vars: codes("B25002", 3) }] },
  internet: { topic: "social", den: codes("B28002", 1), categories: [
    { label: "Has an internet subscription", vars: codes("B28002", 2) }, { label: "Access without a subscription", vars: codes("B28002", 12) },
    { label: "No internet access", vars: codes("B28002", 13) }] },
  enrollment: { topic: "education", den: codes("B14001", 1), categories: [
    { label: "Not enrolled", vars: codes("B14001", 10) }, { label: "Preschool", vars: codes("B14001", 3) },
    { label: "Kindergarten to grade 8", vars: codes("B14001", 4, 5, 6) }, { label: "High school", vars: codes("B14001", 7) },
    { label: "College", vars: codes("B14001", 8) }, { label: "Graduate or professional school", vars: codes("B14001", 9) }] },
  ageBands: { topic: "population", den: codes("B01001", 1), categories: [
    { label: "Under 18", vars: [...codes("B01001", 3, 4, 5, 6), ...codes("B01001", 27, 28, 29, 30)] },
    { label: "18 to 64", vars: [...span("B01001", 7, 19), ...span("B01001", 31, 43)] },
    { label: "65 and over", vars: [...span("B01001", 20, 25), ...span("B01001", 44, 49)] }] },
  race: { topic: "population", den: codes("B02001", 1), categories: [
    { label: "White", vars: codes("B02001", 2) }, { label: "Black or African American", vars: codes("B02001", 3) },
    { label: "Am. Indian, Alaska Native", vars: codes("B02001", 4) }, { label: "Asian", vars: codes("B02001", 5) },
    { label: "Pacific Islander", vars: codes("B02001", 6) },
    { label: "Some other race", vars: codes("B02001", 7) }, { label: "Two or more races", vars: codes("B02001", 8) }] },
  ethnicity: { topic: "population", den: codes("B03003", 1), categories: [
    { label: "Hispanic or Latino (any race)", vars: codes("B03003", 3) }, { label: "Not Hispanic or Latino", vars: codes("B03003", 2) }] },
  tenure: { topic: "households", den: codes("B25003", 1), categories: [
    { label: "Own", vars: codes("B25003", 2) }, { label: "Rent", vars: codes("B25003", 3) }] },
  structure: { topic: "housing", den: codes("B25024", 1), categories: [
    { label: "Single-family detached", vars: codes("B25024", 2) }, { label: "Single-family attached", vars: codes("B25024", 3) },
    { label: "2 units", vars: codes("B25024", 4) }, { label: "3 to 4 units", vars: codes("B25024", 5) },
    { label: "5 to 9 units", vars: codes("B25024", 6) }, { label: "10 to 19 units", vars: codes("B25024", 7) },
    { label: "20 or more units", vars: codes("B25024", 8, 9) }, { label: "Mobile home", vars: codes("B25024", 10) },
    { label: "Boat, RV, van, etc.", vars: codes("B25024", 11) }] },
  householdType: { topic: "households", den: codes("B11012", 1), categories: [
    { label: "Married couple", vars: codes("B11012", 2) }, { label: "Cohabiting couple", vars: codes("B11012", 5) },
    { label: "Female householder, no partner", vars: codes("B11012", 8) }, { label: "Male householder, no partner", vars: codes("B11012", 13) }] },
  income: { topic: "income", den: codes("B19001", 1), categories: [
    { label: "Under $15,000", vars: codes("B19001", 2, 3) }, { label: "$15,000 to $24,999", vars: codes("B19001", 4, 5) },
    { label: "$25,000 to $34,999", vars: codes("B19001", 6, 7) }, { label: "$35,000 to $49,999", vars: codes("B19001", 8, 9, 10) },
    { label: "$50,000 to $74,999", vars: codes("B19001", 11, 12) }, { label: "$75,000 to $99,999", vars: codes("B19001", 13) },
    { label: "$100,000 to $149,999", vars: codes("B19001", 14, 15) }, { label: "$150,000 to $199,999", vars: codes("B19001", 16) },
    { label: "$200,000 or more", vars: codes("B19001", 17) }] },
  rentBurden: { topic: "housing", den: codes("B25070", 1), minus: codes("B25070", 11), categories: [
    { label: "Under 20% of income", vars: codes("B25070", 2, 3, 4) }, { label: "20% to 29%", vars: codes("B25070", 5, 6) },
    { label: "30% to 34%", vars: codes("B25070", 7) }, { label: "35% to 49%", vars: codes("B25070", 8, 9) },
    { label: "50% or more", vars: codes("B25070", 10) }] },
  education: { topic: "education", den: codes("B15003", 1), categories: [
    { label: "Less than high school", vars: span("B15003", 2, 16) }, { label: "High school or GED", vars: codes("B15003", 17, 18) },
    { label: "Some college or associate degree", vars: codes("B15003", 19, 20, 21) },
    { label: "Bachelor's degree", vars: codes("B15003", 22) }, { label: "Graduate or professional degree", vars: codes("B15003", 23, 24, 25) }] },
  employment: { topic: "employment", den: codes("B23025", 1), categories: [
    { label: "Employed", vars: codes("B23025", 4) }, { label: "Unemployed", vars: codes("B23025", 5) },
    { label: "Armed forces", vars: codes("B23025", 6) }, { label: "Not in labor force", vars: codes("B23025", 7) }] },
  commuteMode: { topic: "commute", den: codes("B08301", 1), categories: [
    { label: "Drove alone", vars: codes("B08301", 3) }, { label: "Carpooled", vars: codes("B08301", 4) },
    { label: "Public transportation", vars: codes("B08301", 10) }, { label: "Walked", vars: codes("B08301", 19) },
    { label: "Bicycle", vars: codes("B08301", 18) }, { label: "Taxi, motorcycle or other", vars: codes("B08301", 16, 17, 20) },
    { label: "Worked from home", vars: codes("B08301", 21) }] },
  travelTime: { topic: "commute", den: codes("B08303", 1), categories: [
    { label: "Under 10 minutes", vars: codes("B08303", 2, 3) }, { label: "10 to 19", vars: codes("B08303", 4, 5) },
    { label: "20 to 29", vars: codes("B08303", 6, 7) }, { label: "30 to 44", vars: codes("B08303", 8, 9, 10) },
    { label: "45 to 59", vars: codes("B08303", 11) }, { label: "60 minutes or more", vars: codes("B08303", 12, 13) }] },
};

const unique = <T,>(xs: T[]) => [...new Set(xs)];

// Short display names for the 20 NAICS sectors, keyed by LODES variable (CNS01...) and by NAICS code (QCEW),
// so chart axes do not need a quarter of the card for labels.
const SECTORS = [
  ["CNS01", "11", "Agriculture, forestry, fishing"], ["CNS02", "21", "Mining and oil and gas"], ["CNS03", "22", "Utilities"],
  ["CNS04", "23", "Construction"], ["CNS05", "31-33", "Manufacturing"], ["CNS06", "42", "Wholesale trade"],
  ["CNS07", "44-45", "Retail trade"], ["CNS08", "48-49", "Transportation and warehousing"], ["CNS09", "51", "Information"],
  ["CNS10", "52", "Finance and insurance"], ["CNS11", "53", "Real estate and rental"],
  ["CNS12", "54", "Professional and technical services"], ["CNS13", "55", "Management of companies"],
  ["CNS14", "56", "Administrative and waste services"], ["CNS15", "61", "Educational services"],
  ["CNS16", "62", "Health care and social assistance"], ["CNS17", "71", "Arts, entertainment, recreation"],
  ["CNS18", "72", "Accommodation and food services"], ["CNS19", "81", "Other services"], ["CNS20", "92", "Public administration"],
];
export const SECTOR_BY_CNS: Record<string, string> = Object.fromEntries(SECTORS.map(([cns, , name]) => [cns, name]));
export const SECTOR_BY_NAICS: Record<string, string> = Object.fromEntries(SECTORS.map(([, naics, name]) => [naics, name]));

// Share rows for each area: [{category, series, value, count, moe, note}]. An empty result means the table does
// not exist for this vintage (for example household type in 2015 to 2018).
export async function distribution(handle: Db, spec: Spec, refs: AreaRef[], vintage: number, categories: Category[] = spec.categories): Promise<ShareRow[]> {
  const vars = unique([...categories.flatMap((c) => c.vars), ...spec.den, ...(spec.minus ?? [])]);
  const map = await acsVariables(handle, spec.topic, refs, vintage, vars);
  const rows: ShareRow[] = [];
  for (const ref of refs) {
    const total = sumOf(map, ref.id, spec.den);
    const minus = spec.minus ? sumOf(map, ref.id, spec.minus) : { value: 0, moe: 0 };
    const den = total.any ? (total.value ?? 0) - (minus.value ?? 0) : null;
    const denMoe = total.moe == null ? null : Math.sqrt(total.moe ** 2 + (minus.moe ?? 0) ** 2);
    for (const cat of categories) {
      const s = sumOf(map, ref.id, cat.vars);
      if (!s.any || !den) continue;
      rows.push({
        category: cat.label, series: ref.label, value: (s.value ?? 0) / den, count: s.value ?? 0,
        moe: shareMoe(s.value, den, s.moe, denMoe),
        note: `${fmtInt(s.value)} (${METHODS[methodOf(Math.max(s.rank, total.rank))].short.toLowerCase()})`,
      });
    }
  }
  return rows;
}

// Vehicles available by tenure: shares of all households, one row per vehicle count and tenure.
export async function vehicles(handle: Db, refs: AreaRef[], vintage: number) {
  const owner = [code("B25044", 3), ...codes("B25044", 4, 5, 6, 7, 8)];
  const renter = [code("B25044", 10), ...codes("B25044", 11, 12, 13, 14, 15)];
  const labels = ["No vehicle", "1 vehicle", "2 vehicles", "3 vehicles", "4 vehicles", "5 or more"];
  const map = await acsVariables(handle, "households", refs, vintage, [...owner, ...renter, code("B25044", 1)]);
  const out: Record<string, { category: string; series: string; value: number }[]> = {};
  for (const ref of refs) {
    const den = sumOf(map, ref.id, codes("B25044", 1)).value;
    out[ref.id] = den ? labels.flatMap((label, i) => [
      { category: label, series: "Owner-occupied", value: (map.get(`${ref.id}|${owner[i]}`)?.estimate ?? 0) / den },
      { category: label, series: "Renter-occupied", value: (map.get(`${ref.id}|${renter[i]}`)?.estimate ?? 0) / den },
    ]) : [];
  }
  return { labels, rows: out };
}

// Pyramid rows (shares of the area's population) for one area.
export async function pyramidRows(handle: Db, ref: AreaRef, vintage: number): Promise<{ age: string; sex: "Male" | "Female"; value: number }[]> {
  const vars = AGE_GROUPS.flatMap(([, m, f]) => [...m.map((n) => code("B01001", n)), ...f.map((n) => code("B01001", n))]);
  const map = await acsVariables(handle, "population", [ref], vintage, [...vars, code("B01001", 1)]);
  const total = sumOf(map, ref.id, codes("B01001", 1)).value;
  if (!total) return [];
  return AGE_GROUPS.flatMap(([age, m, f]) => [
    { age, sex: "Male" as const, value: (sumOf(map, ref.id, m.map((n) => code("B01001", n))).value ?? 0) / total },
    { age, sex: "Female" as const, value: (sumOf(map, ref.id, f.map((n) => code("B01001", n))).value ?? 0) / total },
  ]);
}

// Year-built categories change between vintages, so they are read from that vintage's variable labels
// (newest first).
export async function yearBuiltCategories(handle: Db, vintage: number): Promise<Category[]> {
  const labels = await acsLabels(handle, vintage, "B25034");
  return labels.filter((l) => l.variable !== code("B25034", 1))
    .map((l) => ({ label: l.label.split(" > ").pop()!.replace(/^Built /, ""), vars: [l.variable] }));
}

// ---- LODES -----------------------------------------------------------------------------------------------

let lodesLabels: Awaited<ReturnType<typeof lodesVariables>> | undefined;
export async function lodesGroups(handle: Db) {
  lodesLabels ??= await lodesVariables(handle);
  return lodesLabels;
}

// Share of jobs (WAC) or workers (RAC) by one LODES breakdown: group is industry, age, earnings, race,
// ethnicity, education, sex, firm_age or firm_size.
export async function lodesDistribution(handle: Db, kind: "wac" | "rac", refs: AreaRef[], year: number, group: string): Promise<ShareRow[]> {
  const labels = (await lodesGroups(handle)).filter((l) => l.source === "wac/rac" && l.group === group);
  const map = await lodesValues(handle, kind, refs, year);
  const rows: ShareRow[] = [];
  for (const ref of refs) {
    const total = map.get(`${ref.id}|C000`);
    if (!total) continue;
    for (const l of labels) {
      const count = map.get(`${ref.id}|${l.variable}`) ?? 0;
      rows.push({ category: group === "industry" ? (SECTOR_BY_CNS[l.variable] ?? l.label) : l.label, series: ref.label, value: count / total, count,
                  note: `${fmtInt(count)} ${kind === "wac" ? "jobs" : "workers"}` });
    }
  }
  return rows;
}

// Order categories by the first series' value, largest first.
export function sortByFirst(rows: { series: string; category: string; value: number }[], descending = true) {
  const first = rows.length ? rows[0].series : null;
  const value = new Map(rows.filter((r) => r.series === first).map((r) => [r.category, r.value]));
  return [...value.keys()].sort((a, b) => (descending ? value.get(b)! - value.get(a)! : value.get(a)! - value.get(b)!));
}

