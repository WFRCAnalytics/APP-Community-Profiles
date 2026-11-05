// Commute flows of one area from LEHD origin-destination rows (pure, so it is unit tested; the map itself needs a browser).
// A row is jobs held by workers who live in `origin_id` and work in `dest_id`. Every share here is taken from the rows
// themselves, so "commute in" and "live and work here" always add up to the jobs in the area.
export interface OdRow { origin_id: string; dest_id: string; jobs: number }
export type Direction = "both" | "work" | "live";

export interface FlowSummary {
  both: number;      // live and work in the area
  inflow: number;    // jobs here held by people who live elsewhere (including outside the state)
  outflow: number;   // residents who work elsewhere
  outside: number;   // part of the inflow from outside the state
  jobs: number;      // jobs in the area
  workers: number;   // resident workers (that is, residents with a job inside the state)
  liveShare: number | null;   // both / workers: residents who work in their own area
  jobShare: number | null;    // both / jobs: jobs held by residents
  inShare: number | null;     // inflow / jobs
  outShare: number | null;    // outflow / workers
  net: number;                // inflow - outflow
}

const share = (n: number, d: number) => (d > 0 ? n / d : null);

export function summarizeFlows(rows: OdRow[], id: string, outOfState = "out-of-state"): FlowSummary {
  let both = 0, inflow = 0, outflow = 0, outside = 0;
  for (const r of rows) {
    const o = r.origin_id === id, d = r.dest_id === id;
    if (o && d) both += r.jobs;
    else if (d) { inflow += r.jobs; if (r.origin_id === outOfState) outside += r.jobs; }
    else if (o) outflow += r.jobs;
  }
  const jobs = both + inflow, workers = both + outflow;
  return { both, inflow, outflow, outside, jobs, workers, liveShare: share(both, workers), jobShare: share(both, jobs), inShare: share(inflow, jobs), outShare: share(outflow, workers), net: inflow - outflow };
}

export interface MapFlow { origin: string; dest: string; count: number }
export interface Unmapped { id: string; work: number; live: number }   // work: residents who work there; live: workers who live there

// The lines to draw for one area. A row whose other end has no point on the map (the rest of the state, other states) is
// not drawn; it comes back in `unmapped` so it is still shown as a number. Only the `limit` largest routes are kept (0 keeps all). The area's
// flow to itself is not a line, and drawn it would swamp every other route in size and colour, so it is left out too.
export function buildFlows(rows: OdRow[], id: string, direction: Direction, limit: number, known: Set<string>): { flows: MapFlow[]; unmapped: Unmapped[] } {
  const flows: MapFlow[] = [];
  const hidden = new Map<string, Unmapped>();
  for (const r of rows) {
    const o = r.origin_id === id, d = r.dest_id === id;
    if (!o && !d) continue;
    const other = o ? r.dest_id : r.origin_id;
    if (o && d) continue;
    if (!known.has(other)) {
      const h = hidden.get(other) ?? { id: other, work: 0, live: 0 };
      if (o) h.work += r.jobs; else h.live += r.jobs;
      hidden.set(other, h);
      continue;
    }
    if ((o && direction === "live") || (d && direction === "work")) continue;
    flows.push({ origin: r.origin_id, dest: r.dest_id, count: r.jobs });
  }
  flows.sort((a, b) => b.count - a.count);
  if (limit > 0) flows.length = Math.min(flows.length, limit);
  return { flows, unmapped: [...hidden.values()].sort((a, b) => b.work + b.live - (a.work + a.live)) };
}

// How many routes the map draws. A city has hundreds, and every one drawn makes the large ones harder to see.
export const ROUTE_LIMITS = [{ id: "50", label: "Top 50 routes" }, { id: "100", label: "Top 100 routes" }, { id: "250", label: "Top 250 routes" }, { id: "0", label: "All routes" }];
