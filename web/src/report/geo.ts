// Geometry helpers for the report's maps (pure, so they are unit tested): which census tracts belong to an area, and how far
// out the commute flow map should reach.
type Ring = number[][];
type Poly = Ring[];   // outer ring, then holes
type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;

const polys = (g: GeoJSON.Geometry | null | undefined): Poly[] => (!g ? [] : g.type === "Polygon" ? [g.coordinates as Poly] : g.type === "MultiPolygon" ? (g.coordinates as Poly[]) : g.type === "GeometryCollection" ? g.geometries.flatMap(polys) : []);

export interface Box { w: number; s: number; e: number; n: number }
export function boxOf(f: Feature): Box {
  const b = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
  for (const p of polys(f.geometry)) for (const [x, y] of p[0]) { if (x < b.w) b.w = x; if (x > b.e) b.e = x; if (y < b.s) b.s = y; if (y > b.n) b.n = y; }
  return b;
}
const overlap = (a: Box, b: Box) => a.w <= b.e && b.w <= a.e && a.s <= b.n && b.s <= a.n;

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (x: number, y: number, p: Poly) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));
const inside = (x: number, y: number, ps: Poly[]) => ps.some((p) => inPoly(x, y, p));

/** A grid of points over the feature's box that fall inside it. */
export function samplePoints(f: Feature, perSide: number): [number, number][] {
  const b = boxOf(f), ps = polys(f.geometry), out: [number, number][] = [];
  for (let i = 0; i < perSide; i++) for (let j = 0; j < perSide; j++) {
    const x = b.w + ((i + 0.5) / perSide) * (b.e - b.w), y = b.s + ((j + 0.5) / perSide) * (b.n - b.s);
    if (inside(x, y, ps)) out.push([x, y]);
  }
  return out;
}

/**
 * The census tracts that make up an area: every tract with at least a quarter of its own extent inside the area, or that holds at
 * least 2% of the area (a small city inside one large tract still gets that tract). Tracts that only touch the boundary are left out.
 * The area is never empty: when nothing qualifies, the tract that holds most of it is returned.
 */
export function tractsFor(area: Feature, tracts: Feature[]): Feature[] {
  const ab = boxOf(area), ap = polys(area.geometry);
  const mine = samplePoints(area, 40);
  const kept: Feature[] = [];
  let best: Feature | null = null, bestCount = 0;
  for (const t of tracts) {
    if (!overlap(ab, boxOf(t))) continue;
    const tp = polys(t.geometry);
    const count = mine.reduce((n, [x, y]) => n + (inside(x, y, tp) ? 1 : 0), 0);
    if (count > bestCount) { best = t; bestCount = count; }
    const own = samplePoints(t, 8);
    const share = own.length ? own.filter(([x, y]) => inside(x, y, ap)).length / own.length : 0;
    if (share >= 0.25 || (mine.length && count / mine.length >= 0.02)) kept.push(t);
  }
  return kept.length ? kept : best ? [best] : [];
}

export interface FlowLine { origin: string; dest: string; count: number }
export interface Frame extends Box { kept: number; beyond: { routes: number; jobs: number } }

/**
 * The map extent for the commute flows of one area: the smallest set of routes that carries `share` of the mapped jobs (at least
 * `min` routes, at most `max`), plus the area itself, with some room around them. Routes that fall outside the frame are counted so
 * the page can say how many it left off.
 */
export function flowFrame(flows: FlowLine[], places: Map<string, { lon: number; lat: number }>, selId: string, area: Feature | null, share = 0.75, min = 4, max = 25): Frame | null {
  const ranked = flows.filter((f) => places.has(f.origin) && places.has(f.dest)).sort((a, b) => b.count - a.count);
  const total = ranked.reduce((s, f) => s + f.count, 0);
  const keep: FlowLine[] = [];
  let run = 0;
  for (const f of ranked) {
    if (keep.length >= max || (keep.length >= min && run >= share * total)) break;
    keep.push(f); run += f.count;
  }
  const pts: [number, number][] = [];
  const me = places.get(selId);
  if (me) pts.push([me.lon, me.lat]);
  for (const f of keep) for (const id of [f.origin, f.dest]) { const p = places.get(id); if (p) pts.push([p.lon, p.lat]); }
  if (!pts.length && !area) return null;
  const b = area ? boxOf(area) : { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
  for (const [x, y] of pts) { b.w = Math.min(b.w, x); b.e = Math.max(b.e, x); b.s = Math.min(b.s, y); b.n = Math.max(b.n, y); }
  const dx = Math.max(b.e - b.w, 0.15) * 0.12, dy = Math.max(b.n - b.s, 0.15) * 0.12;
  const frame = { w: b.w - dx, e: b.e + dx, s: b.s - dy, n: b.n + dy };
  const inFrame = (id: string) => { const p = places.get(id); return !!p && p.lon >= frame.w && p.lon <= frame.e && p.lat >= frame.s && p.lat <= frame.n; };
  const left = ranked.filter((f) => !inFrame(f.origin) || !inFrame(f.dest));
  return { ...frame, kept: keep.length, beyond: { routes: left.length, jobs: left.reduce((s, f) => s + f.count, 0) } };
}

// The view the map opens on: the area and the few routes that carry most of its jobs (the PDF report's rule, a little tighter). A
// route only counts toward it if it ends within REACH times the area's own size (at least MIN_REACH degrees) of the area, so one long
// route to the far end of the state does not shrink a small city to a dot. Every route is still drawn, and the reader can zoom out.
const REACH = 8, MIN_REACH = 0.8;
export function flowViewFrame(flows: { origin: string; dest: string; count: number }[], places: { id: string; lon: number; lat: number }[], selId: string, area: Feature | null): Frame | null {
  const at = new Map(places.map((p) => [p.id, { lon: p.lon, lat: p.lat }]));
  const all = flows.filter((q) => q.origin !== q.dest);
  let near = all;
  if (area) {
    const b = boxOf(area), cx = (b.w + b.e) / 2, cy = (b.s + b.n) / 2, reach = Math.max(REACH * Math.max(b.e - b.w, b.n - b.s), MIN_REACH);
    const close = (id: string) => { const p = at.get(id); return !!p && Math.hypot((p.lon - cx) * 0.76, p.lat - cy) <= reach; };
    near = all.filter((q) => close(q.origin) && close(q.dest));
  }
  const f = flowFrame(near, at, selId, area, 0.6, 3, 15);
  if (!f) return null;
  const inFrame = (id: string) => { const p = at.get(id); return !!p && p.lon >= f.w && p.lon <= f.e && p.lat >= f.s && p.lat <= f.n; };
  const left = all.filter((q) => !inFrame(q.origin) || !inFrame(q.dest));
  return { ...f, beyond: { routes: left.length, jobs: left.reduce((n, q) => n + q.count, 0) } };
}
