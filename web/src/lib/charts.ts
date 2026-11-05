// Charts built with Observable Plot. Each function returns a DOM element that fills `width` by `height`.
//
// Rules applied everywhere: thin marks with rounded data ends, a surface gap between stacked fills, a quiet grid, no tick
// marks on the value axis, one colour for a single series, a legend for two or more, hover tooltips that carry the value,
// and a table view next to every chart (see ChartCard).
// Colour grammar: one area draws in the theme accent; with a comparison the selected area is blue and the compared area
// orange-brown, so the two can be told apart (`areaColors`). The population
// pyramid keeps the industry convention instead: men blue on the left, women pink on the right.
import * as Plot from "@observablehq/plot";
import { METHODS, type Method } from "./format";
import type { Palette } from "./theme.svelte";

export type Fmt = (v: number | null | undefined) => string;

export const areaColors = (pal: Palette, n = 2) => (n > 1 ? [pal.selected, pal.compare] : [pal.accent]);

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

const wrapPlain = (chart: Element) => {
  const wrap = document.createElement("div");
  wrap.append(chart);
  return wrap;
};
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

// Legend for a chart whose colours mean categories: the areas are told apart by their dot (blue selected, orange compared, as in the
// donut and the 100% bar) and by the bar itself, solid for the selected area and lighter for the compared one.
export function areaLegend(series: string[], pal: Palette): HTMLElement {
  const el = document.createElement("div");
  el.className = "legend";
  series.forEach((label, i) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<i class="dot ${i === 0 ? "sel" : "cmp"}"></i><i style="display:inline-block;width:16px;height:8px;border-radius:3px;background:${pal.ink2};opacity:${i === 0 ? 1 : 0.4};border:${i === 0 ? "0" : `1.2px solid ${pal.ink2}`};box-sizing:border-box"></i>`;
    item.append(document.createTextNode(label));
    el.append(item);
  });
  return el;
}

export interface BarRow { category: string; series: string; value: number; note?: string; method?: Method; moe?: number | null }

// ---- bars ------------------------------------------------------------------------------------------------

// Horizontal bars. One series draws in the theme accent; two draw grouped (selected blue, compared orange) with a legend.
// With a `height` the rows share it; the chart never gets taller than its natural size, and the panel scrolls if it must.
export function bars({ rows, order, seriesOrder, pal, colors, format, tickFormat = format, labels = true, width, height, colorBy = "series" }: {
  rows: BarRow[]; order?: string[]; seriesOrder?: string[]; pal: Palette; colors?: string[]; format: Fmt; tickFormat?: Fmt; labels?: boolean; width: number; height?: number; colorBy?: "series" | "category";
}) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const palette = colors ?? areaColors(pal, series.length);
  const color = Object.fromEntries(series.map((s, i) => [s, palette[i % palette.length]]));
  const grouped = series.length > 1;
  // colorBy "category" gives every category its own colour, the same ones the donut and 100% bar use; a compared area is then a lighter bar.
  const byCat = colorBy === "category";
  const catPalette = colors ?? CATEGORY_COLORS;
  const catColor = (c: string) => catPalette[Math.max(0, cats.indexOf(c)) % catPalette.length];
  const available = innerHeight(height, series.length, 9999);
  const dense = cats.length > 10;
  const unit = Math.max(grouped ? (dense ? 20 : 22) : 17, Math.min(grouped ? 96 : 56, (available - 30) / Math.max(1, cats.length)));
  const chartH = cats.length * unit + 30;
  const max = Math.max(0.0001, ...rows.map((r) => r.value ?? 0)) * 1.18;
  const marginLeft = labelMargin(cats, width);
  const chars = Math.floor((marginLeft - 8) / 6.2);
  // Short lists wrap long labels onto two lines; dense lists cut them (the tooltip has the full name).
  const fit = (d: string) => (dense ? (d.length > chars ? `${d.slice(0, Math.max(4, chars - 1))}…` : d) : wrapLabel(d, chars));
  const marks: any[] = [
    Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined,
      fill: (d: BarRow) => (byCat ? catColor(d.category) : color[d.series]),
      fillOpacity: (d: BarRow) => (byCat && grouped && d.series !== series[0] ? 0.4 : 1),
      stroke: (d: BarRow) => (byCat && grouped && d.series !== series[0] ? catColor(d.category) : "none"), strokeWidth: 1.2,
      rx: 3, ariaLabel: tipLabel("b"), insetTop: grouped ? 1 : 3, insetBottom: grouped ? 1 : 3,
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
  // Hovering a bar shows every area's value for its category; the area names only appear when two are compared.
  const tipFor = (_: string, i: number): TipData => {
    const d = rows[i];
    const same = grouped ? series.flatMap((s) => rows.filter((r) => r.category === d.category && r.series === s)) : [d];
    return { title: d.category, rows: same.map((r) => ({ label: grouped ? r.series : undefined, value: format(r.value), sub: r.note, method: r.method, color: byCat ? catColor(r.category) : color[r.series] })) };
  };
  if (byCat) {
    const wrapC = document.createElement("div");
    if (grouped) wrapC.append(areaLegend(series, pal));
    wrapC.append(chart);
    return tipOverMarks(wrapC, chart, tipFor);
  }
  return tipOverMarks(withLegend(series.map((s) => ({ label: s, color: color[s] })), chart, "rect"), chart, tipFor);
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
        order: seriesOrder, ariaLabel: tipLabel("s"),
      }),
      Plot.ruleX([0], { stroke: pal.ink2, strokeOpacity: 0.5 }),
    ],
  }));
  const tipFor = (_: string, i: number): TipData => {
    const d = rows[i];
    return { title: d.category, rows: [{ label: d.series, value: format(d.value), color: color[d.series], sub: d.note, method: d.method }] };
  };
  return tipOverMarks(withLegend(seriesOrder.map((s) => ({ label: s, color: color[s] })), chart, "rect"), chart, tipFor);
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
      ariaLabel: tipLabel("a"),
    }),
    Plot.text(["Men"], { x: -max, text: (d: string) => d, frameAnchor: "top", dy: -16, textAnchor: "start", fill: pal.ink2, fontWeight: 600 }),
    Plot.text(["Women"], { x: max, text: (d: string) => d, frameAnchor: "top", dy: -16, textAnchor: "end", fill: pal.ink2, fontWeight: 600 }),
  ];
  if (compare) {
    marks.push(Plot.barX(compare, {
      x: signed, y: "age", fill: "none", stroke: pal.ink, strokeWidth: 1.4, strokeDasharray: "3 2", rx: 2, insetTop: 0.5, insetBottom: 0.5,
      ariaLabel: tipLabel("c"),
    }));
  }
  const h = innerHeight(height, compare ? 2 : 1, ages.length * 19 + 52);
  const chart = Plot.plot(base(pal, {
    width, height: h, marginLeft: 56, marginRight: 18, marginTop: 24, marginBottom: 24,
    x: { domain: [-max, max], grid: true, label: null, tickFormat: ((d: number) => tickFormat(Math.abs(d))) as any, ticks: 6, tickSize: 0 },
    y: { domain: [...ages].reverse(), label: null, tickSize: 0 },
    marks,
  }));
  // Hovering a bar shows men and women for that age band; the area names only appear when two areas are compared.
  const tipFor = (mark: string, i: number): TipData => {
    const age = (mark === "c" ? compare![i] : rows[i]).age;
    const pair = (set: PyramidRow[], who: string | null) => (["Male", "Female"] as const).map((sex) => ({
      label: who ? `${who}, ${sex === "Male" ? "men" : "women"}` : sex === "Male" ? "Men" : "Women",
      value: format(set.find((r) => r.age === age && r.sex === sex)?.value), color: sex === "Male" ? pal.male : pal.female,
    }));
    return { title: `Ages ${age}`, rows: [...pair(rows, compare ? label : null), ...(compare ? pair(compare, compareLabel ?? "Compared") : [])], foot: "Share of the population" };
  };
  if (!compare) return tipOverMarks(wrapPlain(chart), chart, tipFor);
  const wrap = legend([{ label: "Men", color: pal.male }, { label: "Women", color: pal.female }, { label: `${compareLabel} (outline)`, color: pal.ink }], "rect");
  const keys = wrap.querySelectorAll(".key");
  keys[2]?.classList.replace("key-rect", "key-dash");
  (keys[2] as HTMLElement | undefined)?.style.removeProperty("background");
  wrap.append(chart);
  return tipOverMarks(wrap, chart, tipFor);
}

// ---- lines -----------------------------------------------------------------------------------------------

export interface Point { x: number; y: number; lo?: number | null; hi?: number | null; note?: string; method?: Method }
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
  ].filter(Boolean);
  const ticks = thinTicks(xTicks ?? flat.map((p) => p.x), width - 90);
  const chart = Plot.plot(base(pal, {
    width, height: innerHeight(height, series.length, 230), marginRight: 46, marginLeft: 52, marginTop: 22, marginBottom: 26,
    x: { label: null, tickFormat: xFormat as any, ticks, type: "linear", nice: false, tickSize: 3 },
    y: { grid: true, label: null, tickFormat: tickFormat as any, zero, nice: true, tickSize: 0, insetBottom: 24 },
    marks,
  }));
  // Hovering shows the year with every line's value there; the area names only appear when two are compared.
  const xs = [...new Set(flat.map((p) => p.x))].sort((a, b) => a - b);
  const out = withLegend(series.map((s) => ({ label: s.label, color: s.color })), chart, "line");
  const { tip, showTip, hideTip } = makeTooltip(out);
  out.style.position = "relative";
  out.append(tip);
  const scale = (chart as any).scale("x");
  chart.addEventListener("pointermove", (e: Event) => {
    const box = chart.getBoundingClientRect();
    const [d0, d1] = scale.domain, [r0, r1] = scale.range;
    const at = d0 + (((e as MouseEvent).clientX - box.left - r0) / (r1 - r0)) * (d1 - d0);
    const x = xs.reduce((best, v) => (Math.abs(v - at) < Math.abs(best - at) ? v : best), xs[0]);
    const here = series.flatMap((s) => { const p = s.points.find((q) => q.x === x); return p ? [{ s, p }] : []; });
    if (!here.length) { hideTip(); return; }
    const multi = series.length > 1;
    showTip(e as PointerEvent, {
      title: tipX(x),
      rows: here.map(({ s, p }) => ({
        label: multi ? s.label : undefined, value: format(p.y), color: s.color,
        sub: p.lo != null && p.hi != null ? `±${format((p.hi - p.lo) / 2)}` : undefined, method: p.method,
      })),
      foot: here.find(({ p }) => p.note)?.p.note,
    });
  });
  chart.addEventListener("pointerleave", hideTip);
  return out;
}

// One tooltip for every chart and map: a title, then one row per value. A row has an optional label and swatch (only needed when
// two areas or categories share the tooltip) and a value drawn in the series colour. The area name is not repeated for a single
// area, because it is already at the top of the page.
export interface TipRow { label?: string; value: string; color?: string; sub?: string; moe?: string; method?: Method }
export interface TipTrend { points: { x: number; y: number }[]; at?: number }
export interface TipData { title?: string; rows: TipRow[]; foot?: string; trend?: TipTrend }

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function renderTip(tip: HTMLElement, d: string | TipData) {
  tip.replaceChildren();
  if (typeof d === "string") {
    const [first, ...rest] = d.split("\n");
    tip.append(el("div", "tt", first), ...rest.map((r) => el("div", "tf", r)));
    return;
  }
  const title = d.title ? el("div", "tt", d.title) : null;
  const solo = d.rows.length === 1 && !d.rows[0].label;
  if (d.trend && d.trend.points.length > 1 && solo) {
    // Laid out like a KPI tile: the title and the number on the left, the trend line beside them across both rows, the indicator
    // and the years under it.
    // The years are the period the number is for (an ACS 5-year ending in `at`), as everywhere else in the app.
    const r = d.rows[0], end = d.trend.at ?? Math.max(...d.trend.points.map((p) => p.x));
    const main = el("div", "tmain");
    const row = el("div", "tr solo");
    if (r.color) row.style.setProperty("--c", r.color);
    row.append(el("span", "tv", r.value));
    if (r.moe) row.append(el("span", "ts", r.moe));
    if (r.method) row.append(el("span", `chip chip-${r.method} tb`, METHODS[r.method].letter));
    if (title) main.append(title);
    main.append(row, sparkline(d.trend, 132, 52));
    tip.append(main, el("div", "ts", [r.sub, `${end - 4}–${end}`].filter(Boolean).join(", ")));
    if (d.foot) tip.append(el("div", "tf", d.foot));
    return;
  }
  if (title) tip.append(title);
  for (const r of d.rows) {
    const row = el("div", solo ? "tr solo" : "tr");
    if (r.color) row.style.setProperty("--c", r.color);
    if (r.color && !solo) row.append(el("i", "tk"));
    if (r.label) row.append(el("span", "tl", r.label));
    row.append(el("span", "tv", r.value));
    if (r.moe) row.append(el("span", "ts", r.moe));
    if (r.sub) row.append(el("span", "ts", r.sub));
    if (r.method) row.append(el("span", `chip chip-${r.method} tb`, METHODS[r.method].letter));
    tip.append(row);
  }
  if (d.foot) tip.append(el("div", "tf", d.foot));
}

// The same trend line as the KPI tiles (Tile.svelte): the theme accent, a dot at the period the map shows. Taller here, so it
// can run alongside both the title and the number.
function sparkline({ points, at }: TipTrend, W = 64, H = 26) {
  const NS = "http://www.w3.org/2000/svg";
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x: number) => 2 + ((x - x0) / (x1 - x0 || 1)) * (W - 4);
  const py = (y: number) => H - 3 - ((y - y0) / (y1 - y0 || 1)) * (H - 6);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(""));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent)");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  // The dot sits on the period the number is for; if the area has no value that period there is no dot.
  const mark = points.find((p) => p.x === (at ?? x1));
  if (mark) {
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", px(mark.x).toFixed(1));
    dot.setAttribute("cy", py(mark.y).toFixed(1));
    dot.setAttribute("r", "2.4");
    dot.setAttribute("fill", "var(--accent)");
    svg.append(dot);
  }
  return svg;
}

// A hover tooltip drawn like Observable Plot's: a surface box, a thin slate border, a notch toward the mark.
export function makeTooltip(host: HTMLElement) {
  const tip = document.createElement("div");
  tip.className = "dtip";
  tip.setAttribute("role", "presentation");
  tip.hidden = true;
  const showTip = (e: PointerEvent | MouseEvent, data: string | TipData) => {
    renderTip(tip, data);
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX - box.left - 19, y = e.clientY - box.top + 16;
    const flip = x + w > box.width - 4;
    if (flip) x = Math.max(4, e.clientX - box.left - w + 19);
    tip.classList.toggle("flip", flip);
    if (y + h > box.height) y = Math.max(0, e.clientY - box.top - h - 14);
    tip.style.left = `${Math.max(0, x)}px`;
    tip.style.top = `${y}px`;
  };
  const hideTip = () => { tip.hidden = true; };
  return { tip, showTip, hideTip };
}

// Hover tooltips for Observable Plot marks. A mark tags each of its elements with `tipLabel(mark, row)`; a pointer over one
// shows `tipFor(mark, row)`. The tag is moved off aria-label, which screen readers would read out.
const tipLabel = (mark: string) => (_: unknown, i: number) => `tip:${mark}:${i}`;
function tipOverMarks(host: HTMLElement, chart: Element, tipFor: (mark: string, row: number) => TipData | null) {
  const { tip, showTip, hideTip } = makeTooltip(host);
  host.style.position = "relative";
  host.append(tip);
  chart.querySelectorAll("[aria-label^='tip:']").forEach((n) => {
    n.setAttribute("data-tip", n.getAttribute("aria-label")!.slice(4));
    n.removeAttribute("aria-label");
  });
  chart.addEventListener("pointermove", (e) => {
    const hit = (e.target as Element).closest("[data-tip]")?.getAttribute("data-tip");
    const [mark, row] = hit?.split(":") ?? [];
    const data = hit ? tipFor(mark, +row) : null;
    if (data) showTip(e as PointerEvent, data); else hideTip();
  });
  chart.addEventListener("pointerleave", hideTip);
  return host;
}

// ---- 100% bar --------------------------------------------------------------------------------------------

// One bar per area, split into the categories and always spanning 100 percent, with the shares inside and a legend below.
// `colors` pins category colours (men and women keep the pyramid's).
export function stacked100({ rows, order, seriesOrder, pal, format, width, height, colors }: {
  rows: BarRow[]; order?: string[]; seriesOrder?: string[]; pal: Palette; format: Fmt; width: number; height?: number; colors?: string[];
}) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const value = (c: string, s: string) => rows.find((r) => r.category === c && r.series === s)?.value ?? 0;
  const colour = (i: number) => colors?.[i] ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  const areaColor = areaColors(pal, series.length);
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:relative;display:flex;flex-direction:column;justify-content:center;gap:14px;`;
  const { tip, showTip, hideTip } = makeTooltip(wrap);
  // Bars grow with the space the panel has, between 34 and 72 pixels thick.
  const barH = height ? Math.round(Math.max(34, Math.min(72, (height - 52 - 38 * series.length) / series.length))) : 34;
  series.forEach((s, si) => {
    const row = document.createElement("div");
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text);margin-bottom:5px;";
    head.innerHTML = `<i style="width:9px;height:9px;border-radius:50%;background:${areaColor[si]};display:inline-block"></i>`;
    head.append(document.createTextNode(s));
    const bar = document.createElement("div");
    bar.style.cssText = `display:flex;height:${barH}px;gap:2px;border-radius:9px;overflow:hidden;background:var(--grid);`;
    cats.forEach((c, i) => {
      const v = value(c, s);
      if (!(v > 0)) return;
      const seg = document.createElement("div");
      seg.style.cssText = `width:${v * 100}%;background:${colour(i)};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:${i === 0 || colour(i) === pal.male ? "#fff" : "#131A27"};white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums;`;
      if (v * width > 46) seg.textContent = format(v);
      const src = rows.find((r) => r.category === c && r.series === s), note = src?.note;
      seg.addEventListener("pointermove", (e) => showTip(e, { title: c, rows: [{ label: series.length > 1 ? s : undefined, value: format(v), color: series.length > 1 ? areaColor[Math.min(series.indexOf(s), areaColor.length - 1)] : colour(i), sub: note, method: src?.method }] }));
      seg.addEventListener("pointerleave", hideTip);
      bar.append(seg);
    });
    row.append(head, bar);
    wrap.append(row);
  });
  const legendEl = document.createElement("div");
  legendEl.style.cssText = "display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--text);";
  cats.forEach((c, i) => {
    const item = document.createElement("span");
    item.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
    item.innerHTML = `<i style="width:10px;height:10px;border-radius:3px;background:${colour(i)};display:inline-block"></i>`;
    item.append(document.createTextNode(c));
    legendEl.append(item);
  });
  wrap.append(legendEl, tip);
  return wrap;
}

// ---- donut -----------------------------------------------------------------------------------------------

// Categories take their own colours (Okabe-Ito, minus the blue and orange that mean selected and compared area), so a ring is
// told apart from the other ring by position, not by hue. Two areas are drawn as two rings: the outer is the selected area.
export const CATEGORY_COLORS = ["#009E73", "#E69F00", "#56B4E9", "#CC79A7", "#8E6BB8", "#7A8497", "#B07A4B", "#4C7A6B", "#C9B21E", "#D1495B", "#3D5A80", "#98C1D9"];

// An annular sector between radii r0 and r1, from angle a0 to a1 (radians, clockwise from 12 o'clock).
export function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  const end = full ? a0 + Math.PI * 2 - 1e-4 : a1;
  const pt = (a: number, r: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = end - a0 > Math.PI ? 1 : 0;
  return `M${pt(a0, r1)}A${r1},${r1} 0 ${large} 1 ${pt(end, r1)}L${pt(end, r0)}A${r0},${r0} 0 ${large} 0 ${pt(a0, r0)}Z`;
}

export function donut({ rows, order, seriesOrder, pal, format, width, height, colors }: {
  rows: BarRow[]; order?: string[]; seriesOrder?: string[]; pal: Palette; format: Fmt; width: number; height?: number; colors?: string[];
}) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const value = (c: string, s: string) => rows.find((r) => r.category === c && r.series === s)?.value ?? 0;
  const colour = (i: number) => colors?.[i] ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  const areaColor = areaColors(pal, series.length);
  const h = Math.max(120, height ?? 200);
  const size = Math.max(100, Math.min(h - 4, width * 0.46));
  const cx = size / 2, cy = size / 2;
  const rings = series.slice(0, 2);
  const outer = size / 2 - 2;
  const thickness = rings.length > 1 ? outer * 0.26 : outer * 0.34;
  const gap = 3;

  const NS = "http://www.w3.org/2000/svg";
  // The tooltip looks like Observable Plot's: a surface-coloured box with a thin slate border and a notch pointing at the mark.
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;display:flex;align-items:center;gap:14px;height:100%;min-height:0;";
  const { tip, showTip, hideTip } = makeTooltip(wrap);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.style.flex = "none";
  rings.forEach((s, ri) => {
    const r1 = outer - ri * (thickness + gap), r0 = r1 - thickness;
    const track = document.createElementNS(NS, "path");
    track.setAttribute("d", arcPath(cx, cy, r0, r1, 0, Math.PI * 2));
    track.setAttribute("fill", pal.grid);
    track.setAttribute("opacity", "0.5");
    svg.append(track);
    let a = 0;
    cats.forEach((c, i) => {
      const v = value(c, s);
      if (!(v > 0)) return;
      const a1 = a + v * Math.PI * 2;
      const slice = document.createElementNS(NS, "path");
      slice.setAttribute("d", arcPath(cx, cy, r0, r1, a, Math.min(a1, Math.PI * 2)));
      slice.setAttribute("fill", colour(i));
      slice.setAttribute("stroke", pal.surface);
      slice.setAttribute("stroke-width", "1.5");
      const src = rows.find((r) => r.category === c && r.series === s), note = src?.note;
      slice.style.cursor = "default";
      slice.addEventListener("pointermove", (e) => showTip(e, { title: c, rows: [{ label: series.length > 1 ? s : undefined, value: format(v), color: series.length > 1 ? areaColor[Math.min(series.indexOf(s), areaColor.length - 1)] : colour(i), sub: note, method: src?.method }] }));
      slice.addEventListener("pointerleave", hideTip);
      svg.append(slice);
      a = a1;
    });
  });
  // The leading category of the selected area in the middle.
  const first = series[0];
  let top = 0;
  cats.forEach((c, i) => { if (value(c, first) > value(cats[top], first)) top = i; });
  const inner = outer - (rings.length - 1) * (thickness + gap) - thickness;
  const centre = document.createElementNS(NS, "text");
  centre.setAttribute("x", String(cx));
  centre.setAttribute("y", String(cy + 1));
  centre.setAttribute("text-anchor", "middle");
  centre.setAttribute("fill", pal.ink);
  centre.setAttribute("font-weight", "700");
  centre.setAttribute("font-size", String(Math.max(12, Math.min(22, inner * 0.42))));
  centre.setAttribute("font-family", "var(--f-display)");
  centre.textContent = format(value(cats[top], first));
  const sub = document.createElementNS(NS, "text");
  sub.setAttribute("x", String(cx));
  sub.setAttribute("y", String(cy + Math.max(14, inner * 0.38)));
  sub.setAttribute("text-anchor", "middle");
  sub.setAttribute("fill", pal.ink2);
  sub.setAttribute("font-size", "10.5");
  const label = cats[top];
  sub.textContent = label.length > 16 ? `${label.slice(0, 15)}…` : label;
  svg.append(centre, sub);

  wrap.append(svg, tip);
  const legendEl = document.createElement("div");
  legendEl.style.cssText = "flex:1;min-width:0;display:grid;gap:3px;font-size:12px;overflow:auto;max-height:100%;";
  if (rings.length > 1) {
    const head = document.createElement("div");
    head.style.cssText = "display:grid;grid-template-columns:12px 1fr auto auto;gap:6px;color:var(--muted);font-size:11px;";
    head.innerHTML = `<span></span><span></span>${rings.map((s, i) => `<span style="display:flex;align-items:center;gap:4px;justify-content:flex-end;"><i style="width:8px;height:8px;border-radius:50%;background:${areaColor[i]};display:inline-block"></i>${s}</span>`).join("")}`;
    legendEl.append(head);
  }
  cats.forEach((c, i) => {
    const row = document.createElement("div");
    row.style.cssText = `display:grid;grid-template-columns:12px 1fr ${rings.map(() => "auto").join(" ")};gap:6px;align-items:center;`;
    const sw = document.createElement("i");
    sw.style.cssText = `width:10px;height:10px;border-radius:3px;background:${colour(i)};display:inline-block;`;
    const name = document.createElement("span");
    name.textContent = c;
    name.title = c;
    name.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);";
    row.append(sw, name);
    for (const s of rings) {
      const v = document.createElement("b");
      v.textContent = format(value(c, s));
      v.style.cssText = "font-variant-numeric:tabular-nums;font-weight:600;text-align:right;color:var(--text);";
      row.append(v);
    }
    legendEl.append(row);
  });
  wrap.append(legendEl);
  return wrap;
}
