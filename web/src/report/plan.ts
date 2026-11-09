// The curated contents of the report. The dashboard lets a reader pick any chart and any map; the report is a fixed document, so
// each page here names the tiles and the charts it carries, and each chart has one fixed type chosen for print. A new chart
// reaches the PDF by being added to a page below.
import { SPECS, yearBuiltCategories } from "../lib/specs";
import {
  jobsBy, languages, lodesTrend, populationTrend, pyramid, qcew, rate, share, trend, vehicleBars,
  type Ctx, type Loader, type Orientation,
} from "./model";

export type Source = "acs" | "lodes" | "qcew" | "pep";

export interface PanelDef {
  title: string;
  note?: string;
  source?: Source;
  span?: Record<Orientation, [number, number]>;
  load: Loader;
}

export interface GridPageDef {
  id: string;
  section: string;
  kicker: string;
  title: string;
  tiles?: { ids: string[]; jobs?: boolean };
  panels: PanelDef[];
}

/** Two rows tall in either orientation. */
const TALL: PanelDef["span"] = { portrait: [1, 2], landscape: [1, 2] };

const builtCategories = async (ctx: Ctx) => {
  const categories = await yearBuiltCategories(ctx.db, ctx.v);
  return { spec: { topic: "housing", den: ["B25034_001"], categories }, categories };
};

export const PAGES: GridPageDef[] = [
  {
    id: "overview", section: "Overview", kicker: "Overview", title: "At a glance",
    tiles: { ids: ["pop", "households", "median_age", "median_income", "median_rent", "median_value"] },
    panels: [
      { title: "Age and sex", span: TALL, note: "Share of the population in each 5-year age group.", load: pyramid() },
      { title: "Population over time", source: "pep", load: populationTrend() },
      { title: "Median household income", load: trend("median_income") },
      { title: "Own or rent", load: share(SPECS.tenure, { as: "donut" }) },
      { title: "Race and Hispanic origin", note: "Hispanic or Latino people of any race are one group.", load: share(SPECS.raceEthnicity, { as: "bars", sort: true, top: 6 }) },
    ],
  },
  {
    id: "people-age", section: "People", kicker: "People", title: "Age, sex and marital status",
    tiles: { ids: ["pop", "median_age", "under18", "age65", "female"] },
    panels: [
      { title: "Age groups", load: share(SPECS.ageBands, { as: "donut" }) },
      { title: "Sex", load: share(SPECS.sex, { as: "donut" }) },
      { title: "Median age", load: trend("median_age") },
      { title: "Marital status (15 and over)", load: share(SPECS.marital, { as: "columns" }) },
      { title: "Under 18", load: trend("under18") },
      { title: "Age 65 and over", load: trend("age65") },
    ],
  },
  {
    id: "people-race", section: "People", kicker: "People", title: "Race, origin and moves",
    tiles: { ids: ["hispanic", "nh_white", "race_asian", "foreign_born", "movers"] },
    panels: [
      { title: "Race", load: share(SPECS.race, { as: "bars", sort: true }) },
      { title: "Hispanic or Latino origin", load: share(SPECS.ethnicity, { as: "donut" }) },
      { title: "Where people were born", load: share(SPECS.nativity, { as: "donut" }) },
      { title: "Where people lived a year ago", load: share(SPECS.mobility, { as: "donut" }) },
      { title: "Foreign-born residents", load: trend("foreign_born") },
      { title: "Hispanic or Latino", load: trend("hispanic") },
    ],
  },
  {
    id: "people-language", section: "People", kicker: "People", title: "Language and health",
    tiles: { ids: ["disability", "uninsured", "veterans", "lep", "spanish_home"] },
    panels: [
      { title: "Languages spoken at home", note: "Languages other than English, share of people 5 and over.", load: languages() },
      { title: "English proficiency", note: "People who speak a language other than English at home.", load: share(SPECS.english, { as: "donut" }) },
      { title: "Disability by age", note: "Share of each age group with a disability.", load: rate("disabilityByAge", "columns") },
      { title: "No health insurance by age", note: "Share of each age group without coverage.", load: rate("uninsuredByAge") },
      { title: "Veterans by age", note: "Share of civilians 18 and over who served.", load: rate("veteransByAge", "columns") },
      { title: "Speak English less than very well", load: trend("lep") },
    ],
  },
  {
    id: "households", section: "Households", kicker: "Households", title: "Households and cars",
    tiles: { ids: ["households", "avg_hh_size", "living_alone", "married", "renters", "no_vehicle"] },
    panels: [
      { title: "Household types", note: "Published from 2019.", load: share(SPECS.householdType, { as: "donut" }) },
      { title: "Own or rent", load: share(SPECS.tenure, { as: "donut" }) },
      { title: "Vehicles available", note: "Share of all households.", load: vehicleBars() },
      { title: "Internet access", note: "Published from 2017.", load: share(SPECS.internet, { as: "donut" }) },
      { title: "Households", load: trend("households") },
      { title: "Average household size", load: trend("avg_hh_size") },
    ],
  },
  {
    id: "housing-stock", section: "Housing", kicker: "Housing", title: "Homes",
    tiles: { ids: ["housing_units", "vacant", "single_family", "multifamily", "crowded"] },
    panels: [
      { title: "Units in structure", load: share(SPECS.structure, { as: "donut" }) },
      { title: "When homes were built", note: "Categories follow the Census definitions for this year.", load: share(builtCategories, { as: "bars" }) },
      { title: "Occupied and vacant", load: share(SPECS.occupancy, { as: "donut" }) },
      { title: "Why homes are vacant", note: "Vacant units only.", load: share(SPECS.vacancyStatus, { as: "donut" }) },
      { title: "People per room", note: "Occupied homes; more than 1.0 is usually called crowded.", load: share(SPECS.crowding, { as: "columns" }) },
      { title: "Housing units", load: trend("housing_units") },
    ],
  },
  {
    id: "housing-prices", section: "Housing", kicker: "Housing", title: "Rents, values and cost burden",
    tiles: { ids: ["median_rent", "median_value", "median_income", "rent_burden", "owner_burden"] },
    panels: [
      { title: "Monthly gross rent", note: "Renter households paying cash rent. Published from 2015.", load: share(SPECS.rentBands, { as: "bars" }) },
      { title: "Home value", note: "Owner-occupied homes, as the owner estimates it.", load: share(SPECS.valueBands, { as: "bars" }) },
      { title: "Households paying 30% or more of income", note: "Share of households in each group.", load: rate("costBurden", "columns") },
      { title: "Median gross rent", load: trend("median_rent") },
      { title: "Median home value", load: trend("median_value") },
      { title: "Renters paying 30% or more", load: trend("rent_burden") },
    ],
  },
  {
    id: "income", section: "Income and poverty", kicker: "Income and poverty", title: "Income and poverty",
    tiles: { ids: ["median_income", "low_income", "high_income", "poverty", "snap"] },
    panels: [
      { title: "Household income", span: TALL, note: "Dollars of each year, not adjusted for inflation.", load: share(SPECS.income, { as: "bars" }) },
      { title: "Median household income", load: trend("median_income") },
      { title: "Poverty status", load: share(SPECS.poverty, { as: "donut" }) },
      { title: "Poverty by age", note: "Share of each age group below the poverty level.", load: rate("povertyByAge") },
      { title: "People below the poverty level", load: trend("poverty") },
    ],
  },
  {
    id: "education", section: "Education", kicker: "Education", title: "Education",
    tiles: { ids: ["bachelors", "grad", "no_hs", "enrolled", "college"] },
    panels: [
      { title: "Educational attainment (25 and over)", note: "Published from 2012.", load: share(SPECS.education, { as: "donut" }) },
      { title: "School enrollment (3 and over)", load: share(SPECS.enrollment, { as: "donut" }) },
      { title: "Bachelor's degree or more", load: trend("bachelors") },
      { title: "Graduate degree", load: trend("grad") },
      { title: "No high school diploma", load: trend("no_hs") },
      { title: "In college or graduate school", load: trend("college") },
    ],
  },
  {
    id: "jobs-workforce", section: "Jobs and economy", kicker: "Jobs and economy", title: "Workforce",
    tiles: { ids: ["unemployment", "labor_force"], jobs: true },
    panels: [
      { title: "Jobs by industry", source: "lodes", span: TALL, note: "Share of jobs located here.", load: jobsBy("industry", { sort: true, top: 12 }) },
      { title: "Jobs over time", source: "lodes", note: "Jobs by place of work, all jobs.", load: lodesTrend("wac") },
      { title: "Workers who live here over time", source: "lodes", note: "Workers by place of residence, all jobs.", load: lodesTrend("rac") },
      { title: "Employment status (16 and over)", note: "Published from 2011.", load: share(SPECS.employment, { as: "donut" }) },
      { title: "Jobs by monthly earnings", source: "lodes", load: jobsBy("earnings", { as: "donut" }) },
    ],
  },
  {
    id: "jobs-industries", section: "Jobs and economy", kicker: "Jobs and economy", title: "Workers and employers",
    panels: [
      { title: "Jobs by worker age", source: "lodes", load: jobsBy("age", { as: "donut" }) },
      { title: "Jobs by worker education", source: "lodes", note: "Workers 30 and older.", load: jobsBy("education", { as: "donut" }) },
      { title: "Industry of employed residents", span: TALL, note: "Where residents work, wherever the job is.", load: share(SPECS.residentIndustry, { as: "bars", sort: true, top: 12 }) },
      { title: "Employment by industry", source: "qcew", note: "Private sector; the eight largest industries.", load: qcew("employment") },
      { title: "Average annual pay by industry", source: "qcew", note: "Private sector; the same industries.", load: qcew("avg_annual_pay") },
    ],
  },
  {
    id: "commute", section: "Commute", kicker: "Commute", title: "How people travel to work",
    tiles: { ids: ["drive_alone", "transit", "wfh", "walk_bike", "long_commute", "mean_travel"] },
    panels: [
      { title: "How workers get to work", load: share(SPECS.commuteMode, { as: "donut" }) },
      { title: "Travel time to work", load: share(SPECS.travelTime, { as: "columns" }) },
      { title: "Average commute (minutes)", load: trend("mean_travel") },
      { title: "Workers who work from home", load: trend("wfh") },
      { title: "Workers who take transit", load: trend("transit") },
      { title: "Commuting 45 minutes or more", load: trend("long_commute") },
    ],
  },
];

export const SOURCES: Record<Source, (ctx: Ctx) => string> = {
  acs: (ctx) => `Source: ${ctx.acs}.`,
  pep: () => "Source: Census Population Estimates Program where published, otherwise the American Community Survey.",
  lodes: (ctx) => `Source: LEHD LODES8, ${ctx.lodes}.`,
  qcew: (ctx) => `Source: BLS QCEW, ${ctx.qcew}.`,
};
