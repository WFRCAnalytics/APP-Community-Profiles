// The poster: one fixed page of the most important figures, charts and maps, on a 24 by 36 inch sheet. Like the document it is built
// from a frozen view with the same loaders; this file only says which ones, and where they sit.
import { SPECS } from "../lib/specs";
import {
  EMPTY_TEXT, MAPS, empty, jobsBy, loadFlows, loadMap, loadTiles, mapBases, populationTrend, pyramid, rate, share, trend, vehicleBars,
  type Ctx, type Loader, type Orientation, type Panel, type Tile,
} from "./model";
import { SOURCES, type Source } from "./plan";

type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;

/** The sheet, in points, and the design canvas the page is laid out on (the sheet is the canvas scaled by `ZOOM`). */
export const ZOOM = 2;
export const SHEET: Record<Orientation, { W: number; H: number }> = { portrait: { W: 1728, H: 2592 }, landscape: { W: 2592, H: 1728 } };
export const CANVAS: Record<Orientation, { W: number; H: number }> = {
  portrait: { W: SHEET.portrait.W / ZOOM, H: SHEET.portrait.H / ZOOM },
  landscape: { W: SHEET.landscape.W / ZOOM, H: SHEET.landscape.H / ZOOM },
};
export const GRID: Record<Orientation, { cols: number; rows: number }> = { portrait: { cols: 3, rows: 6 }, landscape: { cols: 6, rows: 3 } };

export interface PosterCell { panel: Panel; col: number; row: number; cs: number; rs: number }
export interface PosterModel {
  ctx: Ctx;
  orientation: Orientation;
  generated: string;
  tiles: Tile[];
  cells: PosterCell[];
  mapYear: number;
}

const TILES = ["pop", "households", "median_age", "age65", "median_income", "poverty", "bachelors", "unemployment", "renters", "median_rent", "median_value", "wfh"];

type Rect = [number, number, number, number];   // column, row, columns, rows
interface Slot { title: string; note?: string; source?: Source; load: Loader; at: Partial<Record<Orientation, Rect>> }

// The fixed layout: where each panel sits in the 3 by 6 (portrait) or 6 by 3 (landscape) grid. The 2 by 2 block holds the commute flow
// map, or four charts in its place for an area whose commute flows cannot be mapped.
const SLOTS: Slot[] = [
  { title: "Age and sex", note: "Share of the population in each 5-year age group.", load: pyramid(), at: { portrait: [0, 0, 1, 2], landscape: [0, 0, 2, 2] } },
  { title: "Population over time", source: "pep", load: populationTrend(), at: { portrait: [1, 0, 1, 1], landscape: [2, 0, 1, 1] } },
  { title: "Median household income", load: trend("median_income"), at: { portrait: [2, 0, 1, 1], landscape: [3, 0, 1, 1] } },
  { title: "Race and Hispanic origin", load: share(SPECS.raceEthnicity, { as: "bars", sort: true, top: 6 }), at: { portrait: [1, 1, 1, 1], landscape: [4, 0, 1, 1] } },
  { title: "Own or rent", load: share(SPECS.tenure, { as: "donut" }), at: { portrait: [2, 1, 1, 1], landscape: [5, 0, 1, 1] } },
  { title: "Household income", note: "Dollars of each year.", load: share(SPECS.income, { as: "bars" }), at: { portrait: [0, 2, 1, 1], landscape: [5, 2, 1, 1] } },
  { title: "Jobs by industry", source: "lodes", note: "Share of jobs located here.", load: jobsBy("industry", { sort: true, top: 8 }), at: { portrait: [0, 3, 1, 1], landscape: [4, 2, 1, 1] } },
  { title: "How workers get to work", load: share(SPECS.commuteMode, { as: "donut" }), at: { portrait: [0, 4, 1, 1], landscape: [0, 2, 1, 1] } },
  { title: "Educational attainment (25 and over)", load: share(SPECS.education, { as: "donut" }), at: { portrait: [0, 5, 1, 1], landscape: [1, 2, 1, 1] } },
];
// Shown only where the commute flows cannot be mapped: they fill the 2 by 2 block in the flow map's place.
const FALLBACK: Slot[] = [
  { title: "Travel time to work", load: share(SPECS.travelTime, { as: "columns" }), at: { portrait: [1, 4, 1, 1], landscape: [2, 1, 1, 1] } },
  { title: "Median gross rent", load: trend("median_rent"), at: { portrait: [2, 4, 1, 1], landscape: [3, 1, 1, 1] } },
  { title: "Poverty by age", note: "Share of each age group below the poverty level.", load: rate("povertyByAge"), at: { portrait: [1, 5, 1, 1], landscape: [2, 2, 1, 1] } },
  { title: "Vehicles available", note: "Share of all households.", load: vehicleBars(), at: { portrait: [2, 5, 1, 1], landscape: [3, 2, 1, 1] } },
];
// The two tract maps are tall in portrait (two rows each), so the map has room to be read.
const MAP_SLOTS: { id: string; at: Record<Orientation, Rect> }[] = [
  { id: "median_income", at: { portrait: [1, 2, 1, 2], landscape: [4, 1, 1, 1] } },
  { id: "poverty", at: { portrait: [2, 2, 1, 2], landscape: [5, 1, 1, 1] } },
];
const FLOW_AT: Record<Orientation, Rect> = { portrait: [1, 4, 2, 2], landscape: [2, 1, 2, 2] };

/** Every panel's place in the grid for one orientation, with or without the flow map (pure, so the layout is unit tested). */
export function posterRects(o: Orientation, withFlow: boolean): { title: string; col: number; row: number; cs: number; rs: number }[] {
  const rect = (title: string, a: Rect) => ({ title, col: a[0], row: a[1], cs: a[2], rs: a[3] });
  return [
    ...SLOTS.flatMap((s) => (s.at[o] ? [rect(s.title, s.at[o]!)] : [])),
    ...(withFlow ? [rect("Commute flows", FLOW_AT[o])] : FALLBACK.map((s) => rect(s.title, s.at[o]!))),
    ...MAP_SLOTS.map((m) => rect(m.id, m.at[o])),
  ];
}

export async function buildPoster(ctx: Ctx, { orientation, progress }: { orientation: Orientation; progress?: (done: number, total: number, label: string) => void }): Promise<PosterModel> {
  const aborted = () => { if (ctx.signal?.aborted) throw new DOMException("Report cancelled", "AbortError"); };
  let done = 0;
  const total = 5;
  const tick = (label: string) => progress?.(++done, total, label);
  const lost = (what: string, e: unknown) => { console.error(`poster: ${what}`, e); return empty("Could not load this panel."); };
  const cells: PosterCell[] = [];
  const add = (panel: Panel, a: Rect) => cells.push({ panel, col: a[0], row: a[1], cs: a[2], rs: a[3] });

  aborted();
  const tiles = await loadTiles(ctx, TILES).catch((e) => { console.error("poster: tiles", e); return [] as Tile[]; });
  tick("Key figures");

  // Charts.
  aborted();
  const flow = await loadFlows(ctx).catch((e) => { console.error("poster: flows", e); return null; });
  const withFlow = flow?.map.kind === "flow";
  const slots = [...SLOTS.filter((s) => s.at[orientation]), ...(withFlow ? [] : FALLBACK)];
  const made = await Promise.all(slots.map(async (s) => {
    const data = await s.load(ctx).catch((e) => lost(s.title, e));
    const note = [s.note, data.kind === "line" ? data.note : undefined, SOURCES[s.source ?? "acs"](ctx)].filter(Boolean).join(" ");
    return { s, panel: { title: s.title, note, data } as Panel };
  }));
  for (const { s, panel } of made) add(panel, s.at[orientation]!);
  tick("Charts");

  // The flow map, in the 2 by 2 block.
  if (flow && flow.map.kind === "flow") {
    add({
      title: "Commute flows", note: `Routes carrying most of the jobs between ${ctx.sel.label} and the areas where its workers live and work. Source: LEHD LODES8, ${ctx.lodes}.`,
      data: { ...flow.map, uid: "poster-flow" },
    }, FLOW_AT[orientation]);
  }
  tick("Commute flows");

  // Tract maps of the selected area only (a comparison is carried by the charts and figures).
  aborted();
  const solo: Ctx = { ...ctx, refs: [ctx.sel], cmp: undefined };
  const bases = await mapBases(solo).catch((e) => { console.error("poster: map geometry", e); return []; });
  const mapYear = ctx.v >= 2021 ? ctx.v : ctx.latestVintage;
  for (const m of MAP_SLOTS) {
    const def = MAPS.find((x) => x.id === m.id)!;
    const out = bases.length ? await loadMap(solo, bases, def).catch((e) => { console.error("poster: map", m.id, e); return null; }) : null;
    const data = out?.[0]?.data ?? empty(EMPTY_TEXT);
    if (data.kind === "map") data.uid = `poster-${m.id}`;
    add({ title: def.title, note: `Census tracts, ${mapYear - 4}–${mapYear} American Community Survey.${ctx.cmp ? ` Shown for ${ctx.sel.label} only.` : ""}`, data }, m.at[orientation]);
  }
  tick("Maps");

  tick("Finishing");
  return { ctx, orientation, tiles, cells, mapYear, generated: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) };
}
