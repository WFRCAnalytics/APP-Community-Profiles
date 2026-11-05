import { describe, expect, it } from "vitest";
import { arcPath, thinTicks } from "./charts";
import { formatHash, parseHash } from "./hash";
import { classOf, colourFor, quantileBreaks, RAMPS } from "./classes";
import { silhouette } from "./place";
import { seriesFrom } from "./series";
import { shareTable, trendTable } from "./tables";
import { SPECS } from "./specs";
import { INDICATORS, variablesOf } from "./indicators";
import { buildFlows, summarizeFlows } from "./flows";

describe("hash state", () => {
  it("round-trips the shareable state", () => {
    const s = { type: "county", id: "49035", cmp: "49", v: 2024, tab: "jobs" };
    expect(parseHash(formatHash(s))).toMatchObject(s);
  });
  it("ignores junk and omits the default tab", () => {
    expect(parseHash("#v=abc&tab=").v).toBeUndefined();
    expect(formatHash({ type: "aog", id: "aog-wfrc", tab: "overview" })).toBe("#type=aog&id=aog-wfrc");
  });
});

describe("time axis", () => {
  it("labels by end year and always keeps the latest period", () => {
    const years = Array.from({ length: 16 }, (_, i) => 2009 + i);
    const t = thinTicks(years, 300);
    expect(t.at(-1)).toBe(2024);
    expect(t.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThan(0);
    expect(thinTicks([2020, 2021], 400)).toEqual([2020, 2021]);
  });
});

describe("map classes", () => {
  it("cuts into quantile classes and collapses equal cuts", () => {
    expect(quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toHaveLength(4);
    expect(quantileBreaks([5, 5, 5, 5, 5, 5])).toEqual([5]);
    expect(quantileBreaks([null, undefined])).toEqual([]);
  });
  it("colours the lowest and highest class with the ends of the ramp, and gaps with the no-data colour", () => {
    const cuts = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(classOf(1, cuts)).toBe(0);
    expect(colourFor(1, cuts, "light")).toBe(RAMPS.light[0]);
    expect(colourFor(10, cuts, "light")).toBe(RAMPS.light[4]);
    expect(colourFor(null, cuts, "dark")).not.toBe(RAMPS.dark[0]);
  });
});

describe("silhouette", () => {
  const square = (x: number, y: number, s: number) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]]] } });
  it("draws the shape inside the state, and rings a tiny one", () => {
    const state = square(-114, 37, 5);
    const big = silhouette({ state, shape: square(-112, 38, 2) });
    expect(big.shape).toBeTruthy();
    expect(big.ring).toBeNull();
    expect(silhouette({ state, shape: square(-112, 38, 0.01) }).ring).not.toBeNull();
  });
});

describe("chart data", () => {
  it("builds one series per area that has data", () => {
    const refs = [{ id: "a", type: "county", label: "A" }, { id: "b", type: "county", label: "B" }];
    const s = seriesFrom(refs, [{ id: "a", x: 2020, y: 1 }]);
    expect(s.map((x) => x.label)).toEqual(["A"]);
  });
  it("pivots share rows into one column per area", () => {
    const rows = [{ category: "Own", series: "A", value: 0.6, count: 60 }, { category: "Own", series: "B", value: 0.7, count: 70 }];
    const t = shareTable(rows, ["A", "B"], (v) => `${(v! * 100).toFixed(0)}%`);
    expect(t.rows[0]).toMatchObject({ category: "Own", "v:A": "60%", "v:B": "70%", "n:A": "60" });
    const tt = trendTable([{ label: "A", color: "", points: [{ x: 2020, y: 1 }] }], String, (x) => `${x - 4}–${x}`);
    expect(tt.rows[0].x).toBe("2016–2020");
  });
});

describe("definitions", () => {
  it("every share indicator has a denominator and every spec a total", () => {
    for (const i of INDICATORS) {
      expect(variablesOf(i).length).toBeGreaterThan(0);
      if (i.type === "share") expect(i.den?.length).toBeGreaterThan(0);
    }
    for (const spec of Object.values(SPECS)) expect(spec.den.length).toBeGreaterThan(0);
  });
});

describe("donut geometry", () => {
  it("draws a finite annular sector, and a full ring for a single 100 percent slice", () => {
    const part = arcPath(50, 50, 20, 40, 0, Math.PI / 2);
    expect(part.startsWith("M")).toBe(true);
    expect(part).not.toContain("NaN");
    const full = arcPath(50, 50, 20, 40, 0, Math.PI * 2);
    expect(full).not.toContain("NaN");
    expect(full).toContain(" 0 1 1 ");      // a large arc, so the ring closes rather than collapsing
  });
});

describe("commute flows", () => {
  const rows = [
    { origin_id: "a", dest_id: "a", jobs: 60 }, { origin_id: "b", dest_id: "a", jobs: 30 }, { origin_id: "out-of-state", dest_id: "a", jobs: 10 },
    { origin_id: "a", dest_id: "b", jobs: 20 }, { origin_id: "a", dest_id: "other-ut", jobs: 20 }, { origin_id: "a", dest_id: "c", jobs: 3 },
  ];
  it("splits jobs and workers into live-and-work, in and out, and the shares add up", () => {
    const s = summarizeFlows(rows, "a");
    expect([s.both, s.inflow, s.outflow, s.outside]).toEqual([60, 40, 43, 10]);
    expect([s.jobs, s.workers, s.net]).toEqual([100, 103, -3]);
    expect(s.inShare! + s.jobShare!).toBeCloseTo(1);
    expect(s.outShare! + s.liveShare!).toBeCloseTo(1);
  });
  it("has no shares for an area with no flows", () => {
    expect(summarizeFlows([], "a").liveShare).toBeNull();
  });
  it("draws only places that have a point, keeps the rest as numbers, and honours direction and the route limit", () => {
    const known = new Set(["a", "b", "c"]);
    const all = buildFlows(rows, "a", "both", 0, known);
    expect(all.flows.map((f) => `${f.origin}>${f.dest}`).sort()).toEqual(["a>b", "a>c", "b>a"]);
    expect(all.unmapped).toEqual([{ id: "other-ut", work: 20, live: 0 }, { id: "out-of-state", work: 0, live: 10 }]);
    expect(buildFlows(rows, "a", "work", 0, known).flows.map((f) => f.dest).sort()).toEqual(["b", "c"]);
    expect(buildFlows(rows, "a", "live", 0, known).flows.map((f) => f.origin).sort()).toEqual(["b"]);
    expect(buildFlows(rows, "a", "both", 2, known).flows.map((f) => `${f.origin}>${f.dest}`)).toEqual(["b>a", "a>b"]);
  });
});
