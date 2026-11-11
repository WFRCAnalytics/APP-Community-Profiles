import { describe, expect, it } from "vitest";
import { BY_ID } from "../lib/indicators";
import { flowFrame, flowViewFrame, tractsFor } from "./geo";
import { placePanels } from "./layout";
import { MAPS, empty, type Panel } from "./model";
import { GRID, posterRects } from "./posterBuild";
import { PAGES } from "./plan";

type F = GeoJSON.Feature<GeoJSON.Polygon, { id: string }>;
const square = (id: string, w: number, s: number, e: number, n: number): F => ({
  type: "Feature", properties: { id }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
});

describe("tractsFor", () => {
  const area = square("city", 0, 0, 2, 2);
  const ids = (a: F, t: F[]) => tractsFor(a, t).map((x) => x.properties.id).sort();

  it("keeps tracts inside the area and drops ones that only touch its edge", () => {
    const tracts = [square("in", 0.2, 0.2, 1.8, 1.8), square("next", 2, 0, 4, 2), square("far", 10, 10, 11, 11)];
    expect(ids(area, tracts)).toEqual(["in"]);
  });

  it("keeps a tract that is mostly inside and one that holds a share of the area", () => {
    const tracts = [square("half", 1, 0, 3, 2), square("sliver", 1.99, 0, 5, 2)];
    expect(ids(area, tracts)).toEqual(["half"]);
  });

  it("gives a small area the one large tract it sits inside", () => {
    const tiny = square("town", 5, 5, 5.2, 5.2);
    expect(ids(tiny, [square("big", 0, 0, 10, 10), square("other", 20, 20, 30, 30)])).toEqual(["big"]);
  });

  it("is never empty when some tract holds the area", () => {
    expect(tractsFor(square("a", 0, 0, 1, 1), [square("t", 0.4, 0.4, 3, 3)])).toHaveLength(1);
    expect(tractsFor(square("a", 0, 0, 1, 1), [])).toEqual([]);
  });
});

describe("flowFrame", () => {
  const places = new Map(Object.entries({ me: [0, 0], a: [1, 0], b: [0, 1], c: [1, 1], far: [40, 40] }).map(([k, [lon, lat]]) => [k, { lon, lat }]));
  const flow = (dest: string, count: number) => ({ origin: "me", dest, count });

  it("reaches the routes that carry most of the jobs and leaves the long thin one beyond the frame", () => {
    const flows = [flow("a", 500), flow("b", 300), flow("c", 190), flow("far", 10)];
    const f = flowFrame(flows, places, "me", null, 0.85, 3)!;
    expect(f.e).toBeGreaterThanOrEqual(1);
    expect(f.e).toBeLessThan(5);
    expect(f.beyond).toEqual({ routes: 1, jobs: 10 });
  });

  it("always includes the area and at least the minimum number of routes", () => {
    const f = flowFrame([flow("far", 5), flow("a", 1000)], places, "me", null, 0.5, 2)!;
    expect(f.e).toBeGreaterThan(39);
  });

  it("has no frame when nothing can be placed", () => {
    expect(flowFrame([], new Map(), "me", null)).toBeNull();
  });
});

describe("the curated plan", () => {
  const stub = (title: string, span?: Panel["span"]): Panel => ({ title, span, data: empty() });

  it("names only indicators that exist", () => {
    for (const p of PAGES) for (const id of p.tiles?.ids ?? []) expect(BY_ID[id], `${p.id}: ${id}`).toBeDefined();
    for (const m of MAPS) { expect(BY_ID[m.id], m.id).toBeDefined(); expect(BY_ID[m.id].map, m.id).toBe(true); }
  });

  it("has unique page ids and unique panel titles on a page", () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    for (const p of PAGES) expect(new Set(p.panels.map((x) => x.title)).size, p.id).toBe(p.panels.length);
  });

  it("fits every panel of every page in both orientations", () => {
    for (const o of ["portrait", "landscape"] as const) for (const p of PAGES) {
      const dropped: string[] = [];
      const placed = placePanels(p.panels.map((x) => stub(x.title, x.span)), o, dropped);
      expect(dropped, `${p.id} (${o})`).toEqual([]);
      expect(placed).toHaveLength(p.panels.length);
    }
  });

  it("never places two panels on the same cell", () => {
    for (const o of ["portrait", "landscape"] as const) for (const p of PAGES) {
      const seen = new Set<string>();
      for (const q of placePanels(p.panels.map((x) => stub(x.title, x.span)), o))
        for (let r = 0; r < q.rs; r++) for (let c = 0; c < q.cs; c++) { const k = `${q.row + r},${q.col + c}`; expect(seen.has(k), `${p.id} ${k}`).toBe(false); seen.add(k); }
    }
  });
});

describe("the poster layout", () => {
  for (const o of ["portrait", "landscape"] as const) for (const flow of [true, false]) {
    it(`fills the ${o} grid exactly, with${flow ? "" : "out"} the flow map`, () => {
      const { cols, rows } = GRID[o];
      const seen = new Set<string>();
      for (const r of posterRects(o, flow)) {
        expect(r.col + r.cs, r.title).toBeLessThanOrEqual(cols);
        expect(r.row + r.rs, r.title).toBeLessThanOrEqual(rows);
        for (let i = 0; i < r.rs; i++) for (let j = 0; j < r.cs; j++) {
          const k = `${r.row + i},${r.col + j}`;
          expect(seen.has(k), `${r.title} overlaps at ${k}`).toBe(false);
          seen.add(k);
        }
      }
      expect(seen.size).toBe(cols * rows);
    });
  }
});

describe("flowViewFrame", () => {
  const sq = (w: number, s: number, e: number, n: number) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
  const where = [{ id: "me", lon: -113.58, lat: 37.1 }, { id: "near", lon: -113.3, lat: 37.12 }, { id: "far", lon: -111.9, lat: 40.7 }];
  const flows = [{ origin: "me", dest: "far", count: 7000 }, { origin: "near", dest: "me", count: 3000 }, { origin: "me", dest: "near", count: 2000 }];

  it("leaves a route to the far end of the state out of a small city's frame, and counts it", () => {
    const f = flowViewFrame(flows, where, "me", sq(-113.65, 37.05, -113.5, 37.15))!;
    expect(f.n).toBeLessThan(38);
    expect(f.beyond).toEqual({ routes: 1, jobs: 7000 });
  });
  it("reaches every route when the area is large", () => {
    const f = flowViewFrame(flows, where, "me", sq(-114, 37, -109, 42))!;
    expect(f.beyond.routes).toBe(0);
  });
  it("is null with nothing to frame", () => {
    expect(flowViewFrame([], [], "me", null)).toBeNull();
  });
});
