// The report's charts, drawn straight with react-pdf's vector primitives (so they are crisp at any zoom and their text is real
// text). Each takes the size of the cell it fills in points and draws inside it. Colour grammar as in the app: blue is the
// selected area, orange-brown the compared one.
import { Circle, G, Line, Path, Rect, Svg, Text } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { C, CATS, F } from "./theme";

export interface Row { category: string; series: string; value: number }
export type Fmt = (v: number) => string;
export interface LinePoint { x: number; y: number; lo?: number | null; hi?: number | null }
export interface LineSeries { label: string; color: string; points: LinePoint[] }

const n2 = (n: number) => Math.round(n * 100) / 100;
/** Rough text width in points for Instrument Sans (about half the font size per character). */
const textW = (s: string, size: number) => s.length * size * 0.5;
const labelW = (s: string, size: number) => s.length * size * 0.47;
export function fit(s: string, width: number, size: number): string {
  const max = Math.max(3, Math.floor(width / (size * 0.47)));
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

interface TxtProps { x: number; y: number; s: string; size?: number; fill?: string; anchor?: "start" | "middle" | "end"; weight?: number; halo?: boolean }
export function Txt({ x, y, s, size = 6.8, fill = C.ink, anchor = "start", weight = 400, halo = false }: TxtProps): ReactElement {
  const style = { fontFamily: F.body, fontSize: size, fontWeight: weight };
  // A halo is the same text drawn first in a thick white outline, so a label stays readable over lines and fills.
  return halo ? (
    <G>
      <Text x={n2(x)} y={n2(y)} textAnchor={anchor} fill={C.white} stroke={C.white} strokeWidth={2.4} strokeLinejoin="round" style={style}>{s}</Text>
      <Text x={n2(x)} y={n2(y)} textAnchor={anchor} fill={fill} style={style}>{s}</Text>
    </G>
  ) : <Text x={n2(x)} y={n2(y)} textAnchor={anchor} fill={fill} style={style}>{s}</Text>;
}

export const seriesColors = (n: number) => (n > 1 ? [C.sel, C.cmp] : [C.sel]);

/** A row of colour keys; returns the elements and the width used. */
export function Legend({ items, x = 0, y }: { items: { label: string; color: string }[]; x?: number; y: number }): ReactElement {
  let cx = x;
  return (
    <G>
      {items.map((it) => {
        const at = cx;
        cx += 14 + textW(it.label, 6.6) + 8;
        return (
          <G key={it.label}>
            <Rect x={n2(at)} y={n2(y - 6)} width={6.5} height={6.5} rx={1.5} fill={it.color} />
            <Txt x={at + 9.5} y={y} s={it.label} size={6.6} fill={C.muted} />
          </G>
        );
      })}
    </G>
  );
}

const LEGEND_H = 13;

// ---- bars ---------------------------------------------------------------------------------------------------------

export function BarChart({ rows, order, series, w, h, fmt, max }: { rows: Row[]; order: string[]; series: string[]; w: number; h: number; fmt: Fmt; max?: number }): ReactElement {
  const cols = seriesColors(series.length);
  const top = series.length > 1 ? LEGEND_H : 0;
  const cats = order.filter((c) => rows.some((r) => r.category === c));
  const n = Math.max(1, cats.length), ns = series.length;
  const avail = h - top;
  // Rows keep a natural pitch instead of stretching over the cell: a few bars stay slim and sit together (a little above centre),
  // many bars share the height and shrink to fit.
  const pitch = Math.min(ns > 1 ? 32 : 26, avail / n);
  const block = pitch * n;
  const start = top + (avail - block) * 0.3;
  const th = ns > 1 ? Math.max(2.5, Math.min(9, (pitch - 4) / 2)) : Math.max(2.5, Math.min(13, pitch * 0.5));
  const fs = Math.max(5.4, Math.min(6.8, pitch * 0.42 + 1.2));
  const lw = Math.min(w * 0.5, Math.max(40, Math.max(0, ...cats.map((c) => labelW(c, fs))) + 12));
  const barW = Math.max(10, w - lw - 30);
  const peak = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {ns > 1 && <Legend y={8} items={series.map((s, i) => ({ label: s, color: cols[i] }))} />}
      {cats.map((cat, i) => {
        const y0 = start + i * pitch + (pitch - (th * ns + (ns - 1))) / 2;
        return (
          <G key={cat}>
            <Txt x={0} y={start + i * pitch + pitch / 2 + fs * 0.35} s={fit(cat, lw - 4, fs)} size={fs} fill={C.ink} />
            {series.map((s, j) => {
              const r = rows.find((x) => x.category === cat && x.series === s);
              if (!r) return null;
              const len = Math.max(0.8, (Math.max(0, r.value) / peak) * barW);
              const y = y0 + j * (th + 1);
              return (
                <G key={s}>
                  <Rect x={lw} y={n2(y)} width={n2(len)} height={n2(th)} rx={Math.min(1.8, th / 2)} fill={cols[j]} />
                  <Txt x={lw + len + 2.5} y={y + th / 2 + 2.1} s={fmt(r.value)} size={Math.min(6.4, th + 1.6)} fill={ns > 1 ? cols[j] : C.muted} weight={600} />
                </G>
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
}

/** Words wrapped onto at most `max` lines of about `chars` characters, the last one shortened with an ellipsis if it still overflows. */
function wrapWords(text: string, chars: number, max = 3): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > chars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const out = lines.slice(0, max);
  if (lines.length > max) out[max - 1] = `${out[max - 1].slice(0, Math.max(1, chars - 1))}\u2026`;
  return out.map((l) => (l.length > chars + 2 ? `${l.slice(0, chars)}\u2026` : l));
}

/** Vertical bars, for a few ordered categories (travel time, vehicles): they fill a squarish cell where horizontal bars would leave it empty. */
export function ColumnChart({ rows, order, series, w, h, fmt, max }: { rows: Row[]; order: string[]; series: string[]; w: number; h: number; fmt: Fmt; max?: number }): ReactElement {
  const cols = seriesColors(series.length);
  const top = series.length > 1 ? LEGEND_H : 0;
  const cats = order.filter((c) => rows.some((r) => r.category === c));
  const n = Math.max(1, cats.length), ns = series.length;
  const slot = w / n;
  const fs = 5.8;
  const chars = Math.max(5, Math.floor((slot - 2) / (fs * 0.5)));
  const labels = cats.map((c) => wrapWords(c, chars));
  const lines = Math.max(1, ...labels.map((l) => l.length));
  const labelH = lines * 7 + 4;
  const base = h - labelH, plotTop = top + 10;
  const peak = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  const bw = Math.max(3, Math.min(30, (slot * 0.72 - (ns - 1) * 1.5) / ns));
  const group = bw * ns + (ns - 1) * 1.5;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {ns > 1 && <Legend y={8} items={series.map((s, i) => ({ label: s, color: cols[i] }))} />}
      <Line x1={0} x2={w} y1={n2(base)} y2={n2(base)} stroke={C.grid} strokeWidth={0.7} />
      {cats.map((cat, i) => {
        const x0 = i * slot + (slot - group) / 2;
        return (
          <G key={cat}>
            {series.map((s, j) => {
              const r = rows.find((x) => x.category === cat && x.series === s);
              if (!r) return null;
              const bh = Math.max(0.8, (Math.max(0, r.value) / peak) * (base - plotTop));
              const x = x0 + j * (bw + 1.5);
              return (
                <G key={s}>
                  <Rect x={n2(x)} y={n2(base - bh)} width={n2(bw)} height={n2(bh)} rx={Math.min(1.6, bw / 2)} fill={cols[j]} />
                  <Txt x={x + bw / 2} y={base - bh - 2.2} s={fmt(r.value)} size={Math.min(6.2, Math.max(5, slot / (ns * 4.4)))} fill={ns > 1 ? cols[j] : C.muted} weight={600} anchor="middle" />
                </G>
              );
            })}
            {labels[i].map((l, k) => <Txt key={k} x={i * slot + slot / 2} y={base + 7.5 + k * 7} s={l} size={fs} fill={C.ink} anchor="middle" />)}
          </G>
        );
      })}
    </Svg>
  );
}

// ---- donut --------------------------------------------------------------------------------------------------------

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${n2(cx + r * Math.sin(a))},${n2(cy - r * Math.cos(a))}`;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${big} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${big} 0 ${p(r0, a0)}Z`;
}

function Ring({ cx, cy, r0, r1, values, colors }: { cx: number; cy: number; r0: number; r1: number; values: number[]; colors: string[] }): ReactElement {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let a = 0;
  return (
    <G>
      {values.map((v, i) => {
        const span = (Math.max(0, v) / total) * Math.PI * 2;
        const d = span > 0.0005 ? arc(cx, cy, r0, r1, a + (span > 0.04 ? 0.01 : 0), a + span - (span > 0.04 ? 0.01 : 0)) : "";
        a += span;
        return d ? <Path key={i} d={d} fill={colors[i % colors.length]} /> : null;
      })}
    </G>
  );
}

export function DonutChart({ rows, order, series, w, h, fmt }: { rows: Row[]; order: string[]; series: string[]; w: number; h: number; fmt: Fmt }): ReactElement {
  const cats = order.filter((c) => rows.some((r) => r.category === c));
  const two = series.length > 1;
  const top = two ? LEGEND_H : 0;
  const r = Math.max(10, Math.min((h - top) / 2 - 1, w * 0.22, 66));
  const cx = r + 1, cy = top + (h - top) / 2;
  const val = (cat: string, s: string) => rows.find((x) => x.category === cat && x.series === s)?.value ?? 0;
  const colors = cats.map((_, i) => CATS[i % CATS.length]);
  const lx = 2 * r + 14;
  const colA = w, colB = w - 30;
  // A long label wraps onto a second line (the legend is taller, not cut short); with many labels it falls back to one line each.
  const room = (two ? colB - 4 : colA - 6) - lx - 10 - (two ? 30 : 24);
  const chars = Math.max(6, Math.floor(room / (6.6 * 0.47)));
  const wrapped = cats.map((c) => wrapWords(c, chars, 2));
  const natural = wrapped.reduce((t, l) => t + l.length * 7.6 + 4, 0);
  const tall = natural <= h - top - 2;
  const lines = cats.map((c, i) => (tall ? wrapped[i] : [fit(c, room, 6.6)]));
  const heights = lines.map((l) => (tall ? l.length * 7.6 + 4 : Math.min(14, (h - top - 2) / Math.max(1, cats.length))));
  const used = heights.reduce((t, x) => t + x, 0);
  const rowTop = (i: number) => top + (h - top - used) / 2 + heights.slice(0, i).reduce((t, x) => t + x, 0);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {two && <Legend y={8} items={series.map((s, i) => ({ label: s, color: seriesColors(2)[i] }))} />}
      {two ? (
        <G>
          <Ring cx={cx} cy={cy} r0={r * 0.72} r1={r} values={cats.map((c) => val(c, series[0]))} colors={colors} />
          <Ring cx={cx} cy={cy} r0={r * 0.4} r1={r * 0.66} values={cats.map((c) => val(c, series[1]))} colors={colors} />
        </G>
      ) : (
        <Ring cx={cx} cy={cy} r0={r * 0.6} r1={r} values={cats.map((c) => val(c, series[0]))} colors={colors} />
      )}
      {two && <Txt x={cx} y={cy + 2} s="outer / inner" size={4.8} fill={C.faint} anchor="middle" />}
      {cats.map((cat, i) => {
        const y = rowTop(i) + (tall && lines[i].length > 1 ? 7 : heights[i] / 2 + 2.2);
        return (
          <G key={cat}>
            <Rect x={lx} y={n2(y - 6)} width={6.5} height={6.5} rx={1.5} fill={colors[i]} />
            {lines[i].map((l, k) => <Txt key={k} x={lx + 10} y={y + k * 7.6} s={l} size={6.6} />)}
            {two ? (
              <G>
                <Txt x={colB} y={y} s={fmt(val(cat, series[0]))} size={6.4} fill={C.sel} weight={600} anchor="end" />
                <Txt x={colA} y={y} s={fmt(val(cat, series[1]))} size={6.4} fill={C.cmp} weight={600} anchor="end" />
              </G>
            ) : (
              <Txt x={colA} y={y} s={fmt(val(cat, series[0]))} size={6.6} weight={600} anchor="end" />
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ---- one 100% bar per area ----------------------------------------------------------------------------------------

export function StackedChart({ rows, order, series, w, h, fmt }: { rows: Row[]; order: string[]; series: string[]; w: number; h: number; fmt: Fmt }): ReactElement {
  const cats = order.filter((c) => rows.some((r) => r.category === c));
  const lw = series.length > 1 ? Math.min(w * 0.3, Math.max(...series.map((s) => textW(s, 6.6))) + 6) : 0;
  const bw = w - lw;
  const bh = Math.min(18, Math.max(10, (h - LEGEND_H - 4) / series.length - 8));
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Legend y={8} items={cats.map((c, i) => ({ label: c, color: CATS[i % CATS.length] }))} />
      {series.map((s, j) => {
        const y = LEGEND_H + 4 + j * (bh + 9);
        const total = cats.reduce((a, c) => a + (rows.find((r) => r.category === c && r.series === s)?.value ?? 0), 0) || 1;
        let x = lw;
        return (
          <G key={s}>
            {lw > 0 && <Txt x={0} y={y + bh / 2 + 2.3} s={fit(s, lw - 4, 6.6)} fill={seriesColors(2)[j]} weight={600} />}
            {cats.map((c, i) => {
              const v = rows.find((r) => r.category === c && r.series === s)?.value ?? 0;
              const sw = (v / total) * bw;
              const at = x;
              x += sw;
              return (
                <G key={c}>
                  <Rect x={n2(at + 0.4)} y={y} width={n2(Math.max(0, sw - 0.8))} height={bh} rx={1.6} fill={CATS[i % CATS.length]} />
                  {sw > 24 && <Txt x={at + sw / 2} y={y + bh / 2 + 2.2} s={fmt(v)} size={6.2} fill={C.white} anchor="middle" weight={600} />}
                </G>
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
}

// ---- lines --------------------------------------------------------------------------------------------------------

export function LineChart({ series, w, h, fmt, tick, highlight, zero }: { series: LineSeries[]; w: number; h: number; fmt: Fmt; tick?: Fmt; highlight?: number; zero?: boolean }): ReactElement {
  const two = series.length > 1;
  const tf = tick ?? fmt;
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = Math.min(...all.map((p) => p.lo ?? p.y)), hi = Math.max(...all.map((p) => p.hi ?? p.y));
  if (zero) lo = Math.min(0, lo);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
  if (!zero) lo -= pad;
  hi += pad;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const L = Math.max(...ticks.map((t) => tf(t).length * 6 * 0.58)) + 6, R = 8, T = two ? LEGEND_H + 2 : 6, B = 13;
  const X = (x: number) => L + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (w - L - R);
  const Y = (y: number) => T + (h - T - B) - ((y - lo) / (hi - lo || 1)) * (h - T - B);
  const years = [...new Set(xs)].sort((a, b) => a - b);
  const want = Math.max(2, Math.min(6, Math.floor((w - L) / 38)));
  const shown = years.filter((_, i) => i === years.length - 1 || i % Math.max(1, Math.ceil(years.length / want)) === 0).filter((x, _i, a) => x === a[a.length - 1] || a[a.length - 1] - x >= (x1 - x0) / (want * 1.6));
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {two && <Legend y={8} items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      {ticks.map((t, i) => (
        <G key={i}>
          <Line x1={L} x2={w - R} y1={n2(Y(t))} y2={n2(Y(t))} stroke={C.grid} strokeWidth={0.6} />
          <Txt x={L - 3} y={Y(t) + 2.2} s={tf(t)} size={6} fill={C.faint} anchor="end" />
        </G>
      ))}
      {shown.map((x) => <Txt key={x} x={X(x)} y={h - 3} s={String(x)} size={6} fill={C.faint} anchor="middle" />)}
      {highlight != null && highlight >= x0 && highlight <= x1 && <Line x1={n2(X(highlight))} x2={n2(X(highlight))} y1={T} y2={h - B} stroke={C.faint} strokeWidth={0.6} strokeDasharray="2 2" />}
      {series.map((s) => {
        const pts = [...s.points].sort((a, b) => a.x - b.x);
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i ? "L" : "M"}${n2(X(p.x))},${n2(Y(p.y))}`).join("");
        const banded = pts.every((p) => p.lo != null && p.hi != null) && pts.length > 1;
        const band = banded ? `${pts.map((p, i) => `${i ? "L" : "M"}${n2(X(p.x))},${n2(Y(p.hi!))}`).join("")}${[...pts].reverse().map((p) => `L${n2(X(p.x))},${n2(Y(p.lo!))}`).join("")}Z` : "";
        const last = pts[pts.length - 1];
        const mark = highlight != null ? pts.find((p) => p.x === highlight) ?? last : last;
        const before = pts[pts.indexOf(mark) - 1];
        const falling = !!before && mark.y < before.y;
        return (
          <G key={s.label}>
            {banded && <Path d={band} fill={s.color} fillOpacity={0.13} />}
            {pts.length > 1 ? <Path d={d} stroke={s.color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            <Circle cx={n2(X(mark.x))} cy={n2(Y(mark.y))} r={2.5} fill={C.white} stroke={s.color} strokeWidth={1.4} />
            <Txt x={X(mark.x) - 4} y={falling ? Math.min(h - B - 2, Y(mark.y) + 9) : Math.max(T + 6, Y(mark.y) - 5)} s={fmt(mark.y)} size={6.4} fill={s.color} weight={700} anchor="end" />
          </G>
        );
      })}
    </Svg>
  );
}

export function Sparkline({ points, w, h }: { points: { x: number; y: number }[]; w: number; h: number }): ReactElement | null {
  if (points.length < 2) return null;
  const lo = Math.min(...points.map((p) => p.y)), hi = Math.max(...points.map((p) => p.y));
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const X = (x: number) => 1.5 + ((x - x0) / (x1 - x0 || 1)) * (w - 3);
  const Y = (y: number) => 2 + (h - 4) - ((y - lo) / (hi - lo || 1)) * (h - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${n2(X(p.x))},${n2(Y(p.y))}`).join("");
  const last = points[points.length - 1];
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} stroke={C.sel} strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={n2(X(last.x))} cy={n2(Y(last.y))} r={1.6} fill={C.sel} />
    </Svg>
  );
}

// ---- population pyramid ------------------------------------------------------------------------------------------

export interface PyramidRow { age: string; sex: "Male" | "Female"; value: number }

export function Pyramid({ rows, other, ages, w, h, otherLabel }: { rows: PyramidRow[]; other: PyramidRow[] | null; ages: string[]; w: number; h: number; otherLabel?: string }): ReactElement {
  const val = (rs: PyramidRow[], age: string, sex: string) => rs.find((r) => r.age === age && r.sex === sex)?.value ?? 0;
  const peak = Math.max(0.001, ...ages.flatMap((a) => [val(rows, a, "Male"), val(rows, a, "Female"), other ? val(other, a, "Male") : 0, other ? val(other, a, "Female") : 0]));
  const step = peak > 0.06 ? 0.02 : peak > 0.03 ? 0.01 : 0.005;
  const top = Math.ceil(peak / step) * step;
  const lab = 24, half = (w - lab) / 2, k = half / top;
  const T = LEGEND_H, B = 11, rh = (h - T - B) / ages.length;
  const ys = (i: number) => T + i * rh + rh / 2;
  const lineL = other ? ages.map((a, i) => `${n2(half - val(other, a, "Male") * k)},${n2(ys(i))}`).join(" ") : "";
  const lineR = other ? ages.map((a, i) => `${n2(half + lab + val(other, a, "Female") * k)},${n2(ys(i))}`).join(" ") : "";
  const path = (pts: string) => `M${pts.split(" ").join("L")}`;
  const marks = [0, top / 2, top];
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Legend y={8} items={[{ label: "Men", color: C.male }, { label: "Women", color: C.female }]} />
      {other && <G><Line x1={w - 8 - textW(otherLabel ?? "", 6.6) - 10} x2={w - 8 - textW(otherLabel ?? "", 6.6) - 2} y1={5} y2={5} stroke={C.cmp} strokeWidth={1.4} /><Txt x={w} y={8} s={otherLabel ?? ""} size={6.6} fill={C.cmp} anchor="end" /></G>}
      {ages.map((a, i) => {
        const m = val(rows, a, "Male") * k, f = val(rows, a, "Female") * k;
        const y = T + i * rh + 0.9, bh = Math.max(1, rh - 1.8);
        return (
          <G key={a}>
            <Rect x={n2(half - m)} y={n2(y)} width={n2(m)} height={n2(bh)} rx={1.2} fill={C.male} />
            <Rect x={n2(half + lab)} y={n2(y)} width={n2(f)} height={n2(bh)} rx={1.2} fill={C.female} />
            <Txt x={half + lab / 2} y={ys(i) + 2} s={a} size={5.4} fill={C.muted} anchor="middle" />
          </G>
        );
      })}
      {other && <G><Path d={path(lineL)} stroke={C.cmp} strokeWidth={1.2} fill="none" /><Path d={path(lineR)} stroke={C.cmp} strokeWidth={1.2} fill="none" /></G>}
      {marks.map((t, i) => (
        <G key={i}>
          <Txt x={half - t * k} y={h - 2} s={`${Math.round(t * 1000) / 10}%`} size={5.6} fill={C.faint} anchor={i === marks.length - 1 ? "start" : "middle"} />
          {t > 0 && <Txt x={half + lab + t * k} y={h - 2} s={`${Math.round(t * 1000) / 10}%`} size={5.6} fill={C.faint} anchor={i === marks.length - 1 ? "end" : "middle"} />}
        </G>
      ))}
    </Svg>
  );
}
