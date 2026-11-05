// Charts built with Observable Plot. Each function returns a DOM element that fills `width` by `height`.
//
// Rules applied everywhere: thin marks with rounded data ends, a surface gap between stacked fills, a quiet grid, no tick
// marks on the value axis, one colour for a single series, a legend for two or more, hover tooltips that carry the value,
// and a table view next to every chart (see ChartCard).
// Colour grammar: the selected area is always blue and the compared area orange-brown (`areaColors`). The population
// pyramid keeps the industry convention instead: men blue on the left, women pink on the right.
import * as Plot from "@observablehq/plot";
import type { Palette } from "./theme.svelte";

export type Fmt = (v: number | null | undefined) => string;

export const areaColors = (pal: Palette, n = 2) => [pal.selected, pal.compare].slice(0, Math.max(1, n));

const LEGEND_H = 24;

const base = (pal: Palette, opts: any): any => ({
  style: { fontFamily: "var(--f-body)", fontSize: "12px", background: "transparent", color: pal.ink2, overflow: "visible" },
  ...opts,
});

// A legend row: one entry per series, a short key that mirrors the mark.
export function legend(items: { label: string; color: string }[], shape: "rect" | "line" | "dash" = "rect"): HTMLElement {
  const el = document.createElement("div");
  el.className = "legend";
  for (const { label, color } of items) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const key = document.createElement("span");
    key.className = `key key-${shape}`;
    if (shape !== "dash") key.style.background = color;
    item.append(key, document.createTextNode(label));
    el.append(item);
  }
  return el;
}

const withLegend = (items: { label: string; color: string }[], chart: Element, shape: "rect" | "line" | "dash") => {
  const wrap = document.createElement("div");
  if (items.length > 1) wrap.append(legend(items, shape));
  wrap.append(chart);
  return wrap;
};
const innerHeight = (height: number | undefined, legendCount: number, fallback: number) =>
  height ? Math.max(120, height - (legendCount > 1 ? LEGEND_H : 0)) : fallback;

const longest = (xs: unknown[]) => Math.max(0, ...xs.map((x) => String(x).length));
// Room for the longest category label (about 6.4px a character at 12px), capped so bars keep their width.
export const labelMargin = (cats: unknown[], width = 600) => Math.min(Math.max(90, width * 0.5), Math.max(64, longest(cats) * 6.4 + 12));

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

// Horizontal bars. One series draws in the selected colour; two draw grouped (selected blue, compared orange) with a legend.
// With a `height` the rows share it; the chart never gets taller than its natural size, and the panel scrolls if it must.
export function bars({ rows, order, seriesOrder, pal, colors, format, tickFormat = format, labels = true, width, height }: {
  rows: BarRow[]; order?: string[]; seriesOrder?: string[]; pal: Palette; colors?: string[]; format: Fmt; tickFormat?: Fmt; labels?: boolean; width: number; height?: number;
}) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const palette = colors ?? areaColors(pal, series.length);
  const color = Object.fromEntries(series.map((s, i) => [s, palette[i % palette.length]]));
  const grouped = series.length > 1;
  const available = innerHeight(height, series.length, 9999);
  const dense = cats.length > 10;
  const unit = Math.max(grouped ? (dense ? 20 : 22) : 17, Math.min(grouped ? 46 : 32, (available - 30) / Math.max(1, cats.length)));
  const chartH = cats.length * unit + 30;
  const max = Math.max(0.0001, ...rows.map((r) => r.value ?? 0)) * 1.18;
  const marginLeft = labelMargin(cats, width);
  const chars = Math.floor((marginLeft - 8) / 6.2);
  // Short lists wrap long labels onto two lines; dense lists cut them (the tooltip has the full name).
  const fit = (d: string) => (dense ? (d.length > chars ? `${d.slice(0, Math.max(4, chars - 1))}…` : d) : wrapLabel(d, chars));
  const tipText = (d: BarRow) => `${d.category}\n${d.series}: ${format(d.value)}${d.note ? `\n${d.note}` : ""}`;
  const marks: any[] = [
    Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined, fill: (d: BarRow) => color[d.series],
      rx: 3, title: tipText, tip: true, insetTop: grouped ? 1 : 3, insetBottom: grouped ? 1 : 3,
    }),
  ];
  if (labels) {
    marks.push(Plot.text(rows, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined,
      text: (d: BarRow) => format(d.value), dx: 5, textAnchor: "start", fill: pal.ink, fontSize: 11,
    }));
  }
  const chart = Plot.plot(base(pal, {
    width, height: chartH, marginLeft, marginRight: labels ? 48 : 12, marginTop: 4, marginBottom: 24,
    x: { domain: [0, max], grid: true, tickFormat: tickFormat as any, label: null, ticks: 4, tickSize: 0 },
    y: grouped ? { axis: null, domain: series } : { domain: cats, label: null, tickSize: 0, tickFormat: (d: string) => fit(d) },
    fy: grouped ? { domain: cats, label: null, tickSize: 0, padding: 0.18, tickFormat: (d: string) => fit(d) } : undefined,
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

// Stacked horizontal bars: rows [{category, series, value}] stacked per category with a gap between fills.
export function stacked({ rows, order, seriesOrder, pal, colors, format, tickFormat = format, width, height }: {
  rows: BarRow[]; order: string[]; seriesOrder: string[]; pal: Palette; colors: string[]; format: Fmt; tickFormat?: Fmt; width: number; height?: number;
}) {
  const color = Object.fromEntries(seriesOrder.map((s, i) => [s, colors[i % colors.length]]));
  const available = innerHeight(height, seriesOrder.length, 9999);
  const unit = Math.max(22, Math.min(40, (available - 30) / Math.max(1, order.length)));
  const chart = Plot.plot(base(pal, {
    width, height: order.length * unit + 30, marginLeft: labelMargin(order, width), marginTop: 4, marginBottom: 24,
    x: { grid: true, tickFormat: tickFormat as any, label: null, ticks: 4, tickSize: 0 },
    y: { domain: order, label: null, tickSize: 0 },
    marks: [
      Plot.barX(rows, {
        x: "value", y: "category", fill: (d: BarRow) => color[d.series], stroke: pal.surface, strokeWidth: 2, rx: 3,
        order: seriesOrder, title: (d: BarRow) => `${d.category}\n${d.series}: ${format(d.value)}`, tip: true,
      }),
      Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    ],
  }));
  return withLegend(seriesOrder.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

// ---- population pyramid ----------------------------------------------------------------------------------

export interface PyramidRow { age: string; sex: "Male" | "Female"; value: number }

// Shares of the population by age and sex: men blue on the left, women pink on the right (the usual convention). A compared
// area is a dashed outline on each bar, so it never competes with the sex colours.
export function pyramid({ rows, compare, ages, pal, format, tickFormat = format, label, compareLabel, width, height }: {
  rows: PyramidRow[]; compare?: PyramidRow[] | null; ages: string[]; pal: Palette; format: Fmt; tickFormat?: Fmt; label: string; compareLabel?: string; width: number; height?: number;
}) {
  const max = Math.max(...rows.map((r) => r.value), ...(compare ?? []).map((r) => r.value), 0.001) * 1.1;
  const signed = (d: PyramidRow) => (d.sex === "Male" ? -d.value : d.value);
  const fill = (d: PyramidRow) => (d.sex === "Male" ? pal.male : pal.female);
  const marks: any[] = [
    Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: signed, y: "age", fill, rx: 2, insetTop: 1.5, insetBottom: 1.5,
      title: (d: PyramidRow) => `${label}, ages ${d.age}\n${d.sex}: ${format(d.value)} of the population`, tip: true,
    }),
    Plot.text(["Men"], { x: -max, text: (d: string) => d, frameAnchor: "top", dy: -16, textAnchor: "start", fill: pal.ink2, fontWeight: 600 }),
    Plot.text(["Women"], { x: max, text: (d: string) => d, frameAnchor: "top", dy: -16, textAnchor: "end", fill: pal.ink2, fontWeight: 600 }),
  ];
  if (compare) {
    marks.push(Plot.barX(compare, {
      x: signed, y: "age", fill: "none", stroke: pal.ink, strokeWidth: 1.4, strokeDasharray: "3 2", rx: 2, insetTop: 0.5, insetBottom: 0.5,
      title: (d: PyramidRow) => `${compareLabel}, ages ${d.age}\n${d.sex}: ${format(d.value)}`, tip: true,
    }));
  }
  const h = innerHeight(height, compare ? 2 : 1, ages.length * 19 + 52);
  const chart = Plot.plot(base(pal, {
    width, height: h, marginLeft: 56, marginRight: 18, marginTop: 24, marginBottom: 24,
    x: { domain: [-max, max], grid: true, label: null, tickFormat: ((d: number) => tickFormat(Math.abs(d))) as any, ticks: 6, tickSize: 0 },
    y: { domain: [...ages].reverse(), label: null, tickSize: 0 },
    marks,
  }));
  if (!compare) return chart;
  const wrap = legend([{ label: "Men", color: pal.male }, { label: "Women", color: pal.female }, { label: `${compareLabel} (outline)`, color: pal.ink }], "rect");
  const keys = wrap.querySelectorAll(".key");
  keys[2]?.classList.replace("key-rect", "key-dash");
  (keys[2] as HTMLElement | undefined)?.style.removeProperty("background");
  wrap.append(chart);
  return wrap;
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

// A line per series with a dot at each point and a margin-of-error band where there is one. The chosen year is highlighted:
// a guide, a ringed point on every line and its value labelled; the other points recede.
export function lines({ series, pal, format, tickFormat = format, xFormat = String, tipX = xFormat, zero = false, width, height, highlight, xTicks }: {
  series: LineSeries[]; pal: Palette; format: Fmt; tickFormat?: Fmt; xFormat?: (d: number) => string; tipX?: (d: number) => string; zero?: boolean; width: number; height?: number; highlight?: number; xTicks?: number[];
}) {
  const flat = series.flatMap((s) => s.points.map((p) => ({ ...p, series: s.label })));
  const color = Object.fromEntries(series.map((s) => [s.label, s.color]));
  const bands = flat.filter((p) => p.lo != null && p.hi != null);
  // The point of each series at (or the latest before) the chosen year.
  const marked = highlight == null ? [] : series
    .map((s) => ({ ...([...s.points].filter((p) => p.x <= highlight).pop() ?? s.points[0]), series: s.label }))
    .filter((p) => p.x != null);
  const topY = marked.length ? Math.max(...marked.map((p) => p.y)) : 0;
  // Two lines that end close together get their labels one above, one below; otherwise both go above.
  const allY = flat.map((p) => p.y);
  const spread = Math.max(...allY) - Math.min(...allY) || 1;
  const split = marked.length > 1 && (topY - Math.min(...marked.map((p) => p.y))) / spread < 0.2;
  const aboveLabel = (d: any) => !split || d.y >= topY;
  const guideX = marked.length ? Math.max(...marked.map((p) => p.x)) : undefined;
  const tip = (d: (typeof flat)[number]) => `${d.series}\n${tipX(d.x)}: ${format(d.y)}${d.lo != null && d.hi != null ? `\n±${format((d.hi - d.lo) / 2)}` : ""}${d.note ? `\n${d.note}` : ""}`;
  const faded = highlight != null;
  const marks: any[] = [
    Plot.ruleY(zero ? [0] : [], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.areaY(bands, { x: "x", y1: "lo", y2: "hi", fill: (d: any) => color[d.series], fillOpacity: 0.14, z: "series" }),
    guideX != null ? Plot.ruleX([guideX], { stroke: pal.ink2, strokeDasharray: "2 3", strokeOpacity: 0.8 }) : null,
    Plot.lineY(flat, { x: "x", y: "y", stroke: (d: any) => color[d.series], z: "series", strokeWidth: 2, curve: "monotone-x" }),
    Plot.dot(flat, { x: "x", y: "y", fill: (d: any) => color[d.series], fillOpacity: faded ? 0.5 : 1, stroke: pal.surface, strokeWidth: faded ? 0 : 2, r: faded ? 2.4 : 3.5 }),
    Plot.dot(marked, { x: "x", y: "y", r: 7, fill: pal.surface, stroke: (d: any) => color[d.series], strokeWidth: 2.5 }),
    Plot.dot(marked, { x: "x", y: "y", r: 3, fill: (d: any) => color[d.series] }),
    Plot.text(marked.filter(aboveLabel), { x: "x", y: "y", text: (d: any) => format(d.y), dy: -13, fill: pal.ink, fontWeight: 700, fontSize: 12, stroke: pal.surface, strokeWidth: 3, paintOrder: "stroke" }),
    Plot.text(marked.filter((d: any) => !aboveLabel(d)), { x: "x", y: "y", text: (d: any) => format(d.y), dy: 17, fill: pal.ink, fontWeight: 700, fontSize: 12, stroke: pal.surface, strokeWidth: 3, paintOrder: "stroke" }),
    Plot.ruleX(flat, Plot.pointerX({ x: "x", py: "y", stroke: pal.ink2, strokeOpacity: 0.4 })),
    Plot.tip(flat, Plot.pointerX({ x: "x", y: "y", title: tip })),
  ].filter(Boolean);
  const ticks = thinTicks(xTicks ?? flat.map((p) => p.x), width - 90);
  const chart = Plot.plot(base(pal, {
    width, height: innerHeight(height, series.length, 230), marginRight: 46, marginLeft: 52, marginTop: 22, marginBottom: 26,
    x: { label: null, tickFormat: xFormat as any, ticks, type: "linear", nice: false, tickSize: 3 },
    y: { grid: true, label: null, tickFormat: tickFormat as any, zero, nice: true, tickSize: 0 },
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s.label, color: s.color })), chart, "line");
}
