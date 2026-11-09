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

// The breakdowns LEHD gives every origin-destination flow: monthly earnings (SE), industry class (SI) and worker age (SA), three groups each.
export const COMMUTE_MIX: { id: "earnings" | "industry" | "age"; label: string; groups: [string, string][] }[] = [
  { id: "earnings", label: "Earnings", groups: [["SE01", "$1,250 a month or less"], ["SE02", "$1,251 to $3,333"], ["SE03", "More than $3,333"]] },
  { id: "industry", label: "Industry", groups: [["SI01", "Goods producing"], ["SI02", "Trade, transport, utilities"], ["SI03", "All other services"]] },
  { id: "age", label: "Age", groups: [["SA01", "29 or younger"], ["SA02", "30 to 54"], ["SA03", "55 or older"]] },
];

export interface CommuteSides {
  out: Record<string, number>;   // residents who work elsewhere, by breakdown column
  inn: Record<string, number>;   // workers who live elsewhere and work here
  here: Record<string, number>;  // people who live and work in the area (in neither direction)
  byArea: Map<string, { out: number; inn: number }>;   // the other area of each flow: where residents work (out), where workers live (inn)
}

/** The two directions of an area's commute, summed: by the other end of each flow, and by each breakdown column named in `keys`. */
export function commuteSides(rows: (OdRow & Record<string, any>)[], id: string, keys: string[]): CommuteSides {
  const out: Record<string, number> = {}, inn: Record<string, number> = {}, here: Record<string, number> = {};
  const byArea = new Map<string, { out: number; inn: number }>();
  const at = (other: string) => byArea.get(other) ?? byArea.set(other, { out: 0, inn: 0 }).get(other)!;
  for (const r of rows) {
    const o = r.origin_id === id, d = r.dest_id === id;
    if (!o && !d) continue;
    const side = o && d ? here : o ? out : inn;
    if (o && !d) at(r.dest_id).out += r.jobs; else if (d && !o) at(r.origin_id).inn += r.jobs;
    for (const k of keys) side[k] = (side[k] ?? 0) + (r[k] ?? 0);
  }
  return { out, inn, here, byArea };
}
