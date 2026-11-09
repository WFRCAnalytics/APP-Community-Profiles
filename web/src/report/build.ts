// Assembles the report: runs the curated plan against a frozen view, and returns pages of plain data for Doc.tsx to lay out.
import { geojson } from "../lib/data";
import { INDICATORS } from "../lib/indicators";
import { PAGES, SOURCES } from "./plan";
import {
  EMPTY_TEXT, MAPS, empty, loadFlows, lodesTrend, loadIndicatorRows, loadMap, loadTiles, mapBases, tractYear,
  type Ctx, type IndicatorRow, type Orientation, type Panel, type Tile,
} from "./model";

type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;

export interface GridPage { type: "grid"; id: string; section: string; kicker: string; title: string; tiles: Tile[]; panels: Panel[] }
export interface TablePage { type: "table"; id: string; section: string; title: string; rows: ({ group: string } | IndicatorRow)[]; part: number; parts: number }
export type Page = GridPage | TablePage | { type: "about"; id: string; section: string; title: string };

export interface ReportModel {
  ctx: Ctx;
  orientation: Orientation;
  generated: string;
  coverTiles: Tile[];
  locator: { state: Feature | null; area: Feature | null; cmp: Feature | null };
  pages: Page[];
  toc: { label: string; page: number }[];
  mapYear: number;
}

export interface BuildOptions { orientation: Orientation; progress?: (done: number, total: number, label: string) => void }

const aborted = (ctx: Ctx) => { if (ctx.signal?.aborted) throw new DOMException("Report cancelled", "AbortError"); };
const lost = (what: string, e: unknown) => { console.error(`report: ${what}`, e); return empty("Could not load this panel."); };

/** Rows of the appendix table that fit on a page of the given height (header, footer and title block excluded). */
export const tableRowsPerPage = (orientation: Orientation) => (orientation === "portrait" ? 41 : 29);

export async function buildReport(ctx: Ctx, { orientation, progress }: BuildOptions): Promise<ReportModel> {
  const mapIds = MAPS.length;
  const total = PAGES.length + 1 + Math.ceil(mapIds / 6) * ctx.refs.length + 2;
  let done = 0;
  const tick = (label: string) => progress?.(Math.min(++done, total), total, label);
  const pages: Page[] = [];

  // Grid pages from the curated plan.
  for (const def of PAGES) {
    aborted(ctx);
    const [tiles, panels] = await Promise.all([
      def.tiles ? loadTiles(ctx, def.tiles.ids, def.tiles.jobs).catch((e) => { console.error("report: tiles", e); return [] as Tile[]; }) : Promise.resolve([] as Tile[]),
      Promise.all(def.panels.map(async (p): Promise<Panel> => {
        const data = await p.load(ctx).catch((e) => lost(p.title, e));
        const note = [p.note, data.kind === "line" ? data.note : undefined, SOURCES[p.source ?? "acs"](ctx)].filter(Boolean).join(" ");
        return { title: p.title, note, span: p.span, data };
      })),
    ]);
    pages.push({ type: "grid", id: def.id, section: def.section, kicker: def.kicker, title: def.title, tiles, panels });
    tick(def.title);
  }

  // Commute flows (areas with LODES origin-destination data).
  aborted(ctx);
  const flow = await loadFlows(ctx).catch((e) => { console.error("report: flows", e); return null; });
  if (flow) {
    const summary = flow.map.kind === "flowsum";
    // A mapped area gets a big map; one too large to map gets the two-bar diagram in a single row, and the jobs and workers series fill the rest.
    const span: Panel["span"] = summary ? { portrait: [2, 1], landscape: [2, 1] } : { portrait: [2, 2], landscape: [2, 2] };
    const lodesNote = (what: string) => `${what} Source: LEHD LODES8, ${ctx.lodes}.`;
    const extra: Panel[] = summary
      ? await Promise.all([
          lodesTrend("wac")(ctx).catch((e) => lost("jobs", e)).then((data): Panel => ({ title: "Jobs located here over time", note: lodesNote("Jobs by place of work, all jobs."), data })),
          lodesTrend("rac")(ctx).catch((e) => lost("workers", e)).then((data): Panel => ({ title: "Resident workers over time", note: lodesNote("Workers by place of residence, all jobs."), data })),
        ])
      : [];
    pages.push({
      type: "grid", id: "commute-flows", section: "Commute", kicker: "Commute", title: "Where people commute", tiles: flow.tiles,
      panels: [
        { title: "Commute flows", span, note: summary
          ? lodesNote(`Where ${ctx.sel.label}'s resident workers have their jobs, and who holds the jobs located there.`)
          : lodesNote(`Routes carrying most of the jobs between ${ctx.sel.label} and the areas where its workers live and work. Arrows point toward the job; lines curve to the right of travel and widen with jobs.`), data: flow.map },
        { title: "Where workers live", note: lodesNote("People who work here but live elsewhere, top 8."), data: flow.origins },
        { title: "Where residents work", note: lodesNote("Workers who live here but work elsewhere, top 8."), data: flow.destinations },
        ...extra,
      ],
    });
  }
  tick("Commute flows");

  // Tract maps: one set per area shown, classed on shared breaks so two areas compare fairly.
  aborted(ctx);
  const bases = await mapBases(ctx).catch((e) => { console.error("report: map geometry", e); return []; });
  const loaded = bases.length ? await Promise.all(MAPS.map((def) => loadMap(ctx, bases, def).catch((e) => { console.error("report: map", def.id, e); return bases.map((base) => ({ base, data: empty(EMPTY_TEXT) })); }))) : [];
  const my = tractYear(ctx);
  const mapNote = `Census tracts, ${my - 4}–${my} ACS${my === ctx.v ? "" : " (newest tracts)"}. Same classes on every map.`;
  bases.forEach((base, bi) => {
    for (let i = 0; i < MAPS.length; i += 6) {
      const slice = MAPS.slice(i, i + 6);
      pages.push({
        type: "grid", id: `maps-${bi}-${i / 6}`, section: "Maps", kicker: "Maps", title: `${base.label}: neighborhoods`, tiles: [],
        panels: slice.map((def, j): Panel => {
          const data = loaded[i + j]?.[bi]?.data ?? empty();
          if (data.kind === "map") data.uid = `${bi}-${i + j}`;
          return { title: def.title, note: mapNote, data };
        }),
      });
      tick(`${base.label} maps`);
    }
  });

  // Appendix: every indicator, as a table.
  aborted(ctx);
  const rows = await loadIndicatorRows(ctx, INDICATORS);
  // Rows are dealt onto pages by hand (not left to wrap), so the contents page can name exact page numbers. A group heading is
  // never the last row on a page, and a group that continues onto the next page repeats its heading.
  const per = tableRowsPerPage(orientation);
  const chunks: (IndicatorRow | { group: string })[][] = [[]];
  let group = "";
  for (const r of rows) {
    let cur = chunks[chunks.length - 1];
    const heading = r.group !== group;
    if (cur.length + (heading ? 2 : 1) > per) { cur = []; chunks.push(cur); if (!heading) cur.push({ group: r.group }); }
    if (heading) { group = r.group; cur.push({ group }); }
    cur.push(r);
  }
  chunks.forEach((rowsOnPage, p) => pages.push({ type: "table", id: `indicators-${p}`, section: "Appendix", title: "Indicators", rows: rowsOnPage, part: p + 1, parts: chunks.length }));
  tick("Indicators");

  pages.push({ type: "about", id: "about", section: "Methods and the full profile", title: "Methods, sources and the full profile" });
  tick("Finishing");

  // Cover pieces.
  const [state, areas, cmpAreas] = await Promise.all([
    geojson("state").catch(() => null),
    geojson(ctx.sel.type).catch(() => null),
    ctx.cmp ? geojson(ctx.cmp.type).catch(() => null) : null,
  ]);
  const pick = (fc: GeoJSON.FeatureCollection | null, id: string): Feature | null => fc?.features.find((f: Feature) => f.properties.id === id) ?? null;
  const toc: ReportModel["toc"] = [];
  pages.forEach((p, i) => { if (!toc.some((t) => t.label === p.section)) toc.push({ label: p.section, page: i + 2 }); });

  return {
    ctx, orientation, generated: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    coverTiles: (pages[0] as GridPage).tiles,
    locator: { state: state?.features?.[0] ?? null, area: pick(areas, ctx.sel.id), cmp: ctx.cmp ? pick(cmpAreas, ctx.cmp.id) : null },
    pages, toc, mapYear: my,
  };
}
