// Charts built with Observable Plot. Each function returns a DOM element sized to `width`.
//
// Rules applied everywhere: thin marks with rounded data ends, a surface gap between stacked fills, a quiet grid, no tick
// marks on the value axis, one colour for a single series, a legend for two or more, hover tooltips that carry the value,
// and a table view next to every chart (see ChartCard).
// Colour grammar: the selected area is always blue and the compared area always brick (`areaColors`).
import * as Plot from "@observablehq/plot";
import type { Palette } from "./theme.svelte";

export type Fmt = (v: number | null | undefined) => string;

export const areaColors = (pal: Palette, n = 2) => [pal.selected, pal.compare].slice(0, Math.max(1, n));

const base = (pal: Palette, opts: any): any => ({
  style: { fontFamily: "var(--font-body)", fontSize: "12px", background: "transparent", color: pal.ink2, overflow: "visible" },
  ...opts,
});

// A legend row: one entry per series, a short key that mirrors the mark.
export function legend(items: { label: string; color: string }[], shape: "rect" | "line" | "tick" = "rect"): HTMLElement {
  const el = document.createElement("div");
  el.className = "legend";
  for (const { label, color } of items) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const key = document.createElement("span");
    key.className = `key key-${shape}`;
    key.style.background = color;
    item.append(key, document.createTextNode(label));
    el.append(item);
  }
  return el;
}

const withLegend = (items: { label: string; color: string }[], chart: Element, shape: "rect" | "line" | "tick") => {
  const wrap = document.createElement("div");
  if (items.length > 1) wrap.append(legend(items, shape));
  wrap.append(chart);
  return wrap;
};

const longest = (xs: unknown[]) => Math.max(0, ...xs.map((x) => String(x).length));
// Room for the longest category label (Inter 12px is about 6.6px a character), capped so bars keep their width.
export const labelMargin = (cats: unknown[], width = 600) => Math.min(Math.max(90, width * 0.42), Math.max(64, longest(cats) * 6.6 + 12));

// Wrap long category labels onto two lines so a narrow panel keeps room for the bars.
function wrapLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) return `${line}\n${words.slice(words.indexOf(w)).join(" ")}`;
    line = (line + " " + w).trim();
  }
  return text;
}

export interface BarRow { category: string; series: string; value: number; note?: string; moe?: number | null }

// ---- bars ------------------------------------------------------------------------------------------------

// Horizontal bars. One series draws in the selected colour; two draw grouped (selected blue, compared brick) with a legend.
export function bars({ rows, order, seriesOrder, pal, colors, format, tickFormat = format, labels = true, width }: {
  rows: BarRow[]; order?: string[]; seriesOrder?: string[]; pal: Palette; colors?: string[]; format: Fmt; tickFormat?: Fmt; labels?: boolean; width: number;
}) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const palette = colors ?? areaColors(pal, series.length);
  const color = Object.fromEntries(series.map((s, i) => [s, palette[i % palette.length]]));
  const grouped = series.length > 1;
  const perBar = 12, gap = 10;
  const height = cats.length * (series.length * perBar + gap) + 30;
  const max = Math.max(0.0001, ...rows.map((r) => r.value ?? 0)) * 1.18;
  const marginLeft = labelMargin(cats, width);
  const chars = Math.floor((marginLeft - 8) / 6.4);
  const tipText = (d: BarRow) => `${d.category}\n${d.series}: ${format(d.value)}${d.note ? `\n${d.note}` : ""}`;
  const marks: any[] = [
    Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined, fill: (d: BarRow) => color[d.series],
      rx: 2, title: tipText, tip: true,
    }),
  ];
  if (labels) {
    marks.push(Plot.text(rows.filter((r) => r.series === series[0] || !grouped), {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined,
      text: (d: BarRow) => format(d.value), dx: 5, textAnchor: "start", fill: pal.ink, fontSize: 11,
    }));
  }
  const chart = Plot.plot(base(pal, {
    width, height, marginLeft, marginRight: labels ? 46 : 12, marginTop: 4, marginBottom: 24,
    x: { domain: [0, max], grid: true, tickFormat: tickFormat as any, label: null, ticks: 4, tickSize: 0 },
    y: grouped ? { axis: null, domain: series } : { domain: cats, label: null, tickSize: 0, tickFormat: (d: string) => wrapLabel(d, chars) },
    fy: grouped ? { domain: cats, label: null, tickSize: 0, padding: 0.2, tickFormat: (d: string) => wrapLabel(d, chars) } : undefined,
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

// Stacked horizontal bars: rows [{category, series, value}] stacked per category with a gap between fills.
export function stacked({ rows, order, seriesOrder, pal, colors, format, tickFormat = format, width }: {
  rows: BarRow[]; order: string[]; seriesOrder: string[]; pal: Palette; colors: string[]; format: Fmt; tickFormat?: Fmt; width: number;
}) {
  const color = Object.fromEntries(seriesOrder.map((s, i) => [s, colors[i % colors.length]]));
  const chart = Plot.plot(base(pal, {
    width, height: order.length * 28 + 34, marginLeft: labelMargin(order, width), marginTop: 4, marginBottom: 24,
    x: { grid: true, tickFormat: tickFormat as any, label: null, ticks: 4, tickSize: 0 },
    y: { domain: order, label: null, tickSize: 0 },
    marks: [
      Plot.barX(rows, {
        x: "value", y: "category", fill: (d: BarRow) => color[d.series], stroke: pal.surface, strokeWidth: 2, rx: 2,
        order: seriesOrder, title: (d: BarRow) => `${d.category}\n${d.series}: ${format(d.value)}`, tip: true,
      }),
      Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    ],
  }));
  return withLegend(seriesOrder.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

// ---- population pyramid ----------------------------------------------------------------------------------

export interface PyramidRow { age: string; sex: "Male" | "Female"; value: number }

// Shares of the population by age and sex. The selected area is the bars; a compared area is a brick tick on each side.
export function pyramid({ rows, compare, ages, pal, format, tickFormat = format, label, compareLabel, width }: {
  rows: PyramidRow[]; compare?: PyramidRow[] | null; ages: string[]; pal: Palette; format: Fmt; tickFormat?: Fmt; label: string; compareLabel?: string; width: number;
}) {
  const max = Math.max(...rows.map((r) => r.value), ...(compare ?? []).map((r) => r.value), 0.001) * 1.1;
  const signed = (d: PyramidRow) => (d.sex === "Male" ? -d.value : d.value);
  const marks: any[] = [
    Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: signed, y: "age", fill: pal.selected, rx: 2, insetTop: 1.5, insetBottom: 1.5,
      title: (d: PyramidRow) => `${label}, ages ${d.age}\n${d.sex}: ${format(d.value)} of the population`, tip: true,
    }),
    Plot.text([{ x: -max, t: "Male" }, { x: max, t: "Female" }], { x: "x", text: "t", frameAnchor: "top", dy: -14, textAnchor: (d: any) => (d.x < 0 ? "start" : "end"), fill: pal.ink2, fontWeight: 600 }),
  ];
  if (compare) {
    marks.push(Plot.tickX(compare, {
      x: signed, y: "age", stroke: pal.compare, strokeWidth: 2.5,
      title: (d: PyramidRow) => `${compareLabel}, ages ${d.age}\n${d.sex}: ${format(d.value)}`, tip: true,
    }));
  }
  const chart = Plot.plot(base(pal, {
    width, height: ages.length * 19 + 52, marginLeft: 56, marginTop: 22, marginBottom: 24,
    x: { domain: [-max, max], grid: true, label: null, tickFormat: ((d: number) => tickFormat(Math.abs(d))) as any, ticks: 6, tickSize: 0 },
    y: { domain: [...ages].reverse(), label: null, tickSize: 0 },
    marks,
  }));
  return compare
    ? withLegend([{ label: label, color: pal.selected }, { label: compareLabel ?? "", color: pal.compare }], chart, "rect")
    : chart;
}

// ---- lines -----------------------------------------------------------------------------------------------

export interface Point { x: number; y: number; lo?: number | null; hi?: number | null; note?: string }
export interface LineSeries { label: string; color: string; points: Point[] }

// Keep as many tick values as fit (at least `gap` px apart), always including the last one so the latest period is labelled.
export function thinTicks(values: number[], width: number, gap = 52): number[] {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  const room = Math.max(2, Math.floor(width / gap));
  if (uniq.length <= room) return uniq;
  const step = Math.ceil((uniq.length - 1) / (room - 1));
  const out: number[] = [];
  for (let i = uniq.length - 1; i >= 0; i -= step) out.unshift(uniq[i]);
  return out;
}

// A line per series with a dot at each point, a margin-of-error band where there is one, a hover crosshair with a tooltip and a
// value label at the end of each line (when two lines end close together, only the selected area's value is labelled).
export function lines({ series, pal, format, tickFormat = format, xFormat = String, tipX = xFormat, zero = false, width, xTicks }: {
  series: LineSeries[]; pal: Palette; format: Fmt; tickFormat?: Fmt; xFormat?: (d: number) => string; tipX?: (d: number) => string; zero?: boolean; width: number; xTicks?: number[];
}) {
  const flat = series.flatMap((s) => s.points.map((p) => ({ ...p, series: s.label })));
  const color = Object.fromEntries(series.map((s) => [s.label, s.color]));
  const bands = flat.filter((p) => p.lo != null && p.hi != null);
  const last = series.map((s) => ({ ...s.points[s.points.length - 1], series: s.label })).filter((p) => p.x != null);
  const ys = flat.map((p) => p.y);
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  const crowded = last.length > 1 && Math.abs(last[0].y - last[1].y) < span * 0.1;
  const tip = (d: (typeof flat)[number]) => `${d.series}\n${tipX(d.x)}: ${format(d.y)}${d.lo != null && d.hi != null ? `\n±${format((d.hi - d.lo) / 2)}` : ""}${d.note ? `\n${d.note}` : ""}`;
  const marks: any[] = [
    Plot.ruleY(zero ? [0] : [], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.areaY(bands, { x: "x", y1: "lo", y2: "hi", fill: (d: any) => color[d.series], fillOpacity: 0.14, z: "series" }),
    Plot.lineY(flat, { x: "x", y: "y", stroke: (d: any) => color[d.series], z: "series", strokeWidth: 2, curve: "monotone-x" }),
    Plot.dot(flat, { x: "x", y: "y", fill: (d: any) => color[d.series], stroke: pal.surface, strokeWidth: 2, r: 3.5 }),
    Plot.text(crowded ? last.slice(0, 1) : last, { x: "x", y: "y", text: (d: any) => format(d.y), dx: 8, textAnchor: "start", fill: pal.ink, fontSize: 11, fontWeight: 600 }),
    Plot.ruleX(flat, Plot.pointerX({ x: "x", py: "y", stroke: pal.ink2, strokeOpacity: 0.4 })),
    Plot.tip(flat, Plot.pointerX({ x: "x", y: "y", title: tip })),
  ];
  const ticks = thinTicks(xTicks ?? flat.map((p) => p.x), width - 100);
  const chart = Plot.plot(base(pal, {
    width, height: 230, marginRight: 58, marginLeft: 52, marginTop: 14, marginBottom: 26,
    x: { label: null, tickFormat: xFormat as any, ticks, type: "linear", nice: false, tickSize: 3 },
    y: { grid: true, label: null, tickFormat: tickFormat as any, zero, nice: true, tickSize: 0 },
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s.label, color: s.color })), chart, "line");
}
