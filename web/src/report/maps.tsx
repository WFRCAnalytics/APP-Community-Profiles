// Vector maps for the report, drawn with d3-geo into react-pdf shapes: a tract choropleth of one area, the commute flow map, and a
// plain flow diagram for areas too large to map. There is no basemap, so a map is crisp at any zoom, works offline and has no tile
// licence to carry. A quiet ground of neighbouring counties gives each map its place, the way a basemap would.
import { Circle, ClipPath, Defs, G, Path, Rect, Svg } from "@react-pdf/renderer";
import { geoCentroid, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { ReactElement } from "react";
import { NO_DATA, RAMPS, colourFor } from "../lib/classes";
import type { Frame } from "./geo";
import { Txt, fit, type Fmt } from "./charts";
import { C } from "./theme";

type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;
const n2 = (n: number) => Math.round(n * 100) / 100;
const LEG = 24;

const GROUND = "#eef1f5";   // the map's page, a little cooler than the panel
const LAND = "#f8f9fb";     // neighbouring counties
const LAND_LINE = "#cbd2dc";
const LABEL = "#7b8596";
const OUT_COLOUR = "#12355b", IN_COLOUR = "#3f97a6";

const corners = (west: number, south: number, east: number, north: number): GeoJSON.MultiPoint => ({ type: "MultiPoint", coordinates: [[west, south], [east, north]] });
const countyName = (names: Map<string, string>, id: string) => (names.get(id) ?? "").replace(/ County$/, "").toUpperCase();

/** County names placed where there is room, dropping any that would sit on one already placed. */
function countyLabels(context: Feature[], names: Map<string, string>, project: GeoProjection, w: number, h: number, busy: [number, number][]): { x: number; y: number; s: string }[] {
  const out: { x: number; y: number; s: string; box: [number, number, number, number] }[] = [];
  for (const f of context) {
    const s = countyName(names, f.properties.id);
    if (!s) continue;
    const p = project(geoCentroid(f as any) as [number, number]);
    if (!p || p[0] < 14 || p[0] > w - 14 || p[1] < 10 || p[1] > h - 8) continue;
    // A name would only sit on the data where tracts are crowded together, so it is left off there.
    if (busy.filter(([x, y]) => Math.abs(x - p[0]) < 14 && Math.abs(y - p[1]) < 8).length > 3) continue;
    const tw = s.length * 4.8 * 0.55, box: [number, number, number, number] = [p[0] - tw / 2, p[1] - 5, tw, 7];
    if (out.some((o) => box[0] < o.box[0] + o.box[2] && o.box[0] < box[0] + box[2] && box[1] < o.box[1] + o.box[3] && o.box[1] < box[1] + box[3])) continue;
    out.push({ x: p[0], y: p[1] + 2, s, box });
  }
  return out;
}

export function ChoroplethMap({ w, h, uid, tracts, values, cuts, area, tick, context, names }: {
  w: number; h: number; uid: string; tracts: Feature[]; values: Map<string, number | null>; cuts: number[]; area: Feature; tick: Fmt;
  context: Feature[]; names: Map<string, string>;
}): ReactElement {
  const mh = h - LEG;
  const main = geoMercator().fitExtent([[6, 6], [w - 6, mh - 6]], area as any);
  const draw = (project: GeoProjection, outline: number) => {
    const path = geoPath(project);
    return (
      <G>
        {context.map((f) => { const d = path(f as any); return d ? <Path key={f.properties.id} d={d} fill={LAND} stroke={LAND_LINE} strokeWidth={0.4} /> : null; })}
        {tracts.map((t) => {
          const v = values.get(t.properties.id), d = path(t as any);
          return d ? <Path key={t.properties.id} d={d} fill={v == null ? NO_DATA.light : colourFor(v, cuts, "light")} stroke={C.white} strokeWidth={0.18} /> : null;
        })}
        <Path d={path(area as any) ?? ""} fill="none" stroke={C.white} strokeWidth={outline + 1.4} strokeLinejoin="round" />
        <Path d={path(area as any) ?? ""} fill="none" stroke={C.sel} strokeWidth={outline} strokeLinejoin="round" />
      </G>
    );
  };

  const labels = countyLabels(context, names, main, w, mh, tracts.map((t) => main(geoCentroid(t as any) as [number, number])).filter((p): p is [number, number] => !!p));
  const noData = tracts.some((t) => values.get(t.properties.id) == null);
  const classes = RAMPS.light.length;
  const sw = Math.min(28, (w - 8 - (noData ? 40 : 0)) / classes);
  const x0 = (w - sw * classes - (noData ? 36 : 0)) / 2;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs><ClipPath id={`m${uid}`}><Rect x={0} y={0} width={w} height={mh} /></ClipPath></Defs>
      <Rect x={0} y={0} width={w} height={mh} fill={GROUND} rx={3} />
      <G clipPath={`url(#m${uid})`}>{draw(main, 0.9)}</G>
      {labels.length >= 2 && labels.map((l) => <Txt key={l.s} x={l.x} y={l.y} s={l.s} size={4.8} fill={LABEL} anchor="middle" weight={600} halo />)}
      {RAMPS.light.map((c, i) => <Rect key={c} x={n2(x0 + i * sw)} y={mh + 5} width={n2(sw - 1)} height={5} fill={c} />)}
      {cuts.map((v, i) => <Txt key={i} x={x0 + (i + 1) * sw - 0.5} y={mh + 18} s={tick(v)} size={5.4} fill={C.muted} anchor="middle" />)}
      {noData && <G><Rect x={n2(x0 + classes * sw + 6)} y={mh + 5} width={8} height={5} fill={NO_DATA.light} /><Txt x={x0 + classes * sw + 17} y={mh + 10} s="No data" size={5.4} fill={C.muted} /></G>}
    </Svg>
  );
}

// ---- commute flows ------------------------------------------------------------------------------------------------

export interface RouteDraw { origin: string; dest: string; count: number }

export function FlowRouteMap({ w, h, uid, frame, context, shapes, focusId, places, flows, names, fmt }: {
  w: number; h: number; uid: string; frame: Frame; context: Feature[]; shapes: Feature[]; focusId: string;
  places: Map<string, { lon: number; lat: number }>; flows: RouteDraw[]; names: (id: string) => string; fmt: Fmt;
}): ReactElement {
  const mh = h - LEG;
  const projection = geoMercator().fitExtent([[4, 4], [w - 4, mh - 4]], corners(frame.w, frame.s, frame.e, frame.n) as any);
  const path = geoPath(projection);
  const at = (id: string): [number, number] | null => { const p = places.get(id); return p ? (projection([p.lon, p.lat]) as [number, number]) : null; };
  const peak = Math.max(1, ...flows.map((f) => f.count));
  // Routes in come first and routes out are drawn over them, each from the smallest up, so neither direction hides the other.
  const sorted = [...flows].sort((a, b) => Number(a.origin === focusId) - Number(b.origin === focusId) || a.count - b.count);
  const totals = new Map<string, number>();
  for (const f of flows) for (const id of [f.origin, f.dest]) totals.set(id, (totals.get(id) ?? 0) + f.count);
  const peakNode = Math.max(1, ...[...totals].filter(([id]) => id !== focusId).map(([, v]) => v));
  const labelled = [...totals].filter(([id]) => id !== focusId).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  // Labels go on in order of importance; one that would land on a label already placed is left off (the bars beside the map name them).
  const placed: { id: string; x: number; y: number; s: string; right: boolean; box: [number, number, number, number] }[] = [];
  for (const id of [focusId, ...labelled]) {
    const p = at(id);
    if (!p) continue;
    const s = fit(names(id), 70, 5.8), tw = s.length * 5.8 * 0.5, right = p[0] < w * 0.7;
    const x = p[0] + (right ? 5 : -5), box: [number, number, number, number] = [right ? x : x - tw, p[1] - 4, tw, 7];
    if (placed.some((o) => box[0] < o.box[0] + o.box[2] && o.box[0] < box[0] + box[2] && box[1] < o.box[1] + o.box[3] && o.box[1] < box[1] + box[3])) continue;
    placed.push({ id, x, y: p[1] + 2, s, right, box });
  }
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs><ClipPath id={`f${uid}`}><Rect x={0} y={0} width={w} height={mh} /></ClipPath></Defs>
      <Rect x={0} y={0} width={w} height={mh} fill={GROUND} rx={3} />
      <G clipPath={`url(#f${uid})`}>
        {context.map((f) => { const d = path(f as any); return d ? <Path key={f.properties.id} d={d} fill={LAND} stroke={LAND_LINE} strokeWidth={0.4} /> : null; })}
        {shapes.map((s) => {
          if (s.properties.id === focusId) return null;
          const d = path(s as any);
          return d ? <Path key={s.properties.id} d={d} fill="#eef1f6" fillOpacity={0.7} stroke="#c3cbd7" strokeWidth={0.3} /> : null;
        })}
        {shapes.filter((s) => s.properties.id === focusId).map((s) => {
          const d = path(s as any) ?? "";
          return <G key={s.properties.id}><Path d={d} fill="#d7e8f6" stroke={C.white} strokeWidth={2.2} strokeLinejoin="round" /><Path d={d} fill="none" stroke={C.sel} strokeWidth={0.9} strokeLinejoin="round" /></G>;
        })}
        {sorted.map((f, i) => {
          const a = at(f.origin), b = at(f.dest);
          if (!a || !b) return null;
          const out = f.origin === focusId;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
          const cx = mx + (dy / len) * len * 0.14, cy = my - (dx / len) * len * 0.14;
          const wd = 0.6 + 3.2 * Math.sqrt(f.count / peak), col = out ? OUT_COLOUR : IN_COLOUR;
          const ang = Math.atan2(b[1] - cy, b[0] - cx), ah = 2.4 + wd * 0.9;
          const tip = `M${n2(b[0])},${n2(b[1])}L${n2(b[0] - ah * Math.cos(ang - 0.4))},${n2(b[1] - ah * Math.sin(ang - 0.4))}L${n2(b[0] - ah * Math.cos(ang + 0.4))},${n2(b[1] - ah * Math.sin(ang + 0.4))}Z`;
          return (
            <G key={`${f.origin}>${f.dest}|${i}`}>
              <Path d={`M${n2(a[0])},${n2(a[1])}Q${n2(cx)},${n2(cy)} ${n2(b[0])},${n2(b[1])}`} stroke={col} strokeWidth={n2(wd)} strokeOpacity={out ? 0.8 : 0.75} fill="none" strokeLinecap="round" />
              <Path d={tip} fill={col} fillOpacity={0.9} />
            </G>
          );
        })}
        {[...totals].filter(([id]) => id !== focusId).map(([id, v]) => { const p = at(id); return p ? <Circle key={id} cx={n2(p[0])} cy={n2(p[1])} r={n2(1.4 + 2.2 * Math.sqrt(v / peakNode))} fill={C.white} stroke={C.navy} strokeWidth={0.7} /> : null; })}
        {(() => { const p = at(focusId); return p ? <Circle cx={n2(p[0])} cy={n2(p[1])} r={3.6} fill={C.sel} stroke={C.white} strokeWidth={1.2} /> : null; })()}
        {placed.map((l) => <Txt key={l.id} x={l.x} y={l.y} s={l.s} size={5.8} fill={l.id === focusId ? C.sel : C.ink} anchor={l.right ? "start" : "end"} weight={l.id === focusId ? 700 : 500} halo />)}
      </G>
      <Rect x={4} y={mh + 8} width={14} height={2.4} rx={1.2} fill={OUT_COLOUR} />
      <Txt x={22} y={mh + 11.5} s="Residents work there" size={5.6} fill={C.muted} />
      <Rect x={96} y={mh + 8} width={14} height={2.4} rx={1.2} fill={IN_COLOUR} />
      <Txt x={114} y={mh + 11.5} s="Workers live there" size={5.6} fill={C.muted} />
      <Txt x={w - 4} y={mh + 11.5} s={`Wider = more jobs (busiest ${fmt(peak)})`} size={5.6} fill={C.muted} anchor="end" />
    </Svg>
  );
}

// ---- flow diagram -------------------------------------------------------------------------------------------------

export interface Segment { label: string; value: number }
const SEGMENT_COLOURS = [C.sel, "#3f97a6", "#82c3be", "#a9b4c4", "#d3d9e2"];

/** Two stacked bars for an area with too few neighbours to map: where its residents work, and who holds the jobs in it. */
export function FlowDiagram({ w, h, out, inn, outTitle, innTitle, fmt }: { w: number; h: number; out: Segment[]; inn: Segment[]; outTitle: string; innTitle: string; fmt: Fmt }): ReactElement {
  // Rows tighten, and the bars thin, when the two blocks need more height than the cell has.
  const bar = Math.min(26, h * 0.08);
  const gap = 20, headH = 16 + bar + 12;
  const rowStep = Math.min(13, Math.max(9.5, (h - 2 * headH - gap) / Math.max(1, out.length + inn.length)));
  const block = (title: string, segs: Segment[], y: number) => {
    const total = segs.reduce((s, x) => s + x.value, 0) || 1;
    let x = 0;
    return (
      <G key={title}>
        <Txt x={0} y={y + 9} s={title} size={9} weight={700} fill={C.navy} />
        {segs.map((s, i) => {
          const sw = (s.value / total) * w, at = x;
          x += sw;
          return <Rect key={s.label} x={n2(at + 0.5)} y={y + 16} width={n2(Math.max(0, sw - 1))} height={bar} rx={2} fill={SEGMENT_COLOURS[Math.min(i, SEGMENT_COLOURS.length - 1)]} />;
        })}
        {segs.map((s, i) => {
          const ry = y + 16 + bar + 12 + i * rowStep;
          return (
            <G key={`l${s.label}`}>
              <Rect x={0} y={ry - 6} width={6.5} height={6.5} rx={1.5} fill={SEGMENT_COLOURS[Math.min(i, SEGMENT_COLOURS.length - 1)]} />
              <Txt x={11} y={ry} s={fit(s.label, w - 120, 7.6)} size={7.6} />
              <Txt x={w - 36} y={ry} s={fmt(s.value)} size={7.6} weight={600} anchor="end" />
              <Txt x={w} y={ry} s={`${Math.round((s.value / total) * 100)}%`} size={7.6} fill={C.muted} anchor="end" />
            </G>
          );
        })}
      </G>
    );
  };
  // The two blocks sit together in the middle of the cell, with a clear gap between them.
  const blockH = (segs: Segment[]) => headH + segs.length * rowStep;
  const total = blockH(out) + gap + blockH(inn);
  const y0 = Math.max(0, (h - total) / 2);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {block(outTitle, out, y0)}
      {block(innTitle, inn, y0 + blockH(out) + gap)}
    </Svg>
  );
}
