// Charts for the profiles dashboard, built with Observable Plot.
//
// Rules applied everywhere (see the data-viz guidance): thin marks with rounded data ends, a surface gap
// between stacked fills, hairline recessive grid, one colour for a single series, a legend for two or more,
// selective direct labels, hover tooltips that also carry the value, and a table view elsewhere on the page.
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { escapeHtml } from "./format.js";

// Same variables the WFRC brand helper reads (--wfrc-chart-N), with its fallbacks, so charts follow
// light and dark mode on their own.
const FALLBACK = ["#1479B8", "#D2582A", "#8A5FB0", "#D6A21E", "#1FA0A6"];
export function chartColors() {
  const css = getComputedStyle(document.documentElement);
  return FALLBACK.map((f, i) => css.getPropertyValue(`--wfrc-chart-${i + 1}`).trim() || f);
}

const surface = "var(--bs-card-bg, var(--wfrc-surface, #fff))";
const ink = "var(--wfrc-ink, currentColor)";
const ink2 = "var(--wfrc-ink-2, #4F5E69)";

const base = (opts) => ({
  style: { fontFamily: "Inter, sans-serif", fontSize: "12px", background: "transparent", overflow: "visible" },
  ...opts,
});

// Render `build(width)` now and again whenever the container (or the colour scheme) changes size, so
// charts fit their card exactly instead of scaling a fixed-width SVG.
export function responsive(build, { minWidth = 260 } = {}) {
  const el = document.createElement("div");
  el.className = "pf-chart";
  let drawn = 0, frame = 0;
  const draw = (force = false) => {
    const width = Math.floor(el.clientWidth);
    if (!width || (!force && width === drawn)) return;
    drawn = width;
    try {
      el.replaceChildren(build(Math.max(minWidth, width)));
      // Each chart is a picture to a screen reader; the same numbers are in the table on the Indicators tab.
      const title = el.closest(".card")?.querySelector(".card-title")?.textContent?.trim() ?? "Chart";
      for (const svg of el.querySelectorAll("svg")) {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", `${title}. The values are in the table on the Indicators tab.`);
      }
    }
    catch (e) { el.textContent = `Could not draw this chart: ${e.message}`; console.error(e); }
  };
  const schedule = (force) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => draw(force)); };
  new ResizeObserver(() => schedule(false)).observe(el);
  new MutationObserver(() => schedule(true)).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  schedule(true);
  return el;
}

// A legend row: one entry per series, a short key that mirrors the mark.
export function legend(items, shape = "rect") {
  const el = document.createElement("div");
  el.className = "pf-legend";
  for (const { label, color } of items) {
    const item = document.createElement("span");
    item.className = "pf-legend-item";
    const key = document.createElement("span");
    key.className = `pf-key pf-key-${shape}`;
    key.style.background = color;
    item.append(key, document.createTextNode(label));
    el.append(item);
  }
  return el;
}

const withLegend = (items, chart, shape) => {
  const wrap = document.createElement("div");
  if (items.length > 1) wrap.append(legend(items, shape));
  wrap.append(chart);
  return wrap;
};

// ---- bars ------------------------------------------------------------------------------------------------

// Horizontal bars. rows: [{category, series, value, note?}]. One series draws in the first colour; two or
// more draw grouped, one bar each, with a legend. `labels` puts the value at the bar end of the first
// series (use it for short lists). `order` fixes the category order (the order of the data).
export function bars({ rows, order, seriesOrder, colors = chartColors(), format, tickFormat = format, labels = true, domainMax, width }) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const color = Object.fromEntries(series.map((s, i) => [s, colors[i % colors.length]]));
  const perBar = 14, gap = 8;
  const height = cats.length * (series.length * perBar + gap) + 36;
  const max = domainMax ?? Math.max(0.0001, ...rows.map((r) => r.value ?? 0)) * 1.15;
  const tipText = (d) => `${d.category}\n${d.series}: ${format(d.value)}${d.note ? `\n${d.note}` : ""}`;
  const grouped = series.length > 1;
  const marks = [
    Plot.ruleX([0], { stroke: ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined, fill: (d) => color[d.series],
      rx: 2, title: tipText, tip: true,
    }),
  ];
  if (labels) {
    const first = rows.filter((r) => r.series === series[0]);
    marks.push(Plot.text(first, {
      x: "value", y: grouped ? "series" : "category", fy: grouped ? "category" : undefined,
      text: (d) => format(d.value), dx: 4, textAnchor: "start", fill: ink, fontSize: 11,
    }));
  }
  const chart = Plot.plot(base({
    width, height, marginLeft: labelMargin(cats), marginRight: 44, marginTop: 6,
    x: { domain: [0, max], grid: true, tickFormat, label: null, ticks: 5 },
    y: grouped ? { axis: null, domain: series } : { domain: cats, label: null, tickSize: 0 },
    fy: grouped ? { domain: cats, label: null, tickSize: 0, padding: 0.18 } : undefined,
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

const longest = (xs) => Math.max(...xs.map((x) => String(x).length));
// Room for the longest category label (Inter 12px is about 6.8px a character).
const labelMargin = (cats) => Math.min(250, Math.max(70, longest(cats) * 6.8 + 14));

// Stacked horizontal bars: rows [{category, series, value}] stacked per category with a gap between fills.
export function stacked({ rows, order, seriesOrder, colors = chartColors(), format, tickFormat = format, width }) {
  const cats = order ?? [...new Set(rows.map((r) => r.category))];
  const series = seriesOrder ?? [...new Set(rows.map((r) => r.series))];
  const color = Object.fromEntries(series.map((s, i) => [s, colors[i % colors.length]]));
  const chart = Plot.plot(base({
    width, height: cats.length * 30 + 40, marginLeft: labelMargin(cats), marginTop: 6,
    x: { grid: true, tickFormat, label: null, ticks: 5 },
    y: { domain: cats, label: null, tickSize: 0 },
    marks: [
      Plot.barX(rows, {
        x: "value", y: "category", fill: (d) => color[d.series], stroke: surface, strokeWidth: 2, rx: 2,
        order: series, title: (d) => `${d.category}\n${d.series}: ${format(d.value)}`, tip: true,
      }),
      Plot.ruleX([0], { stroke: ink2, strokeOpacity: 0.5 }),
    ],
  }));
  return withLegend(series.map((s) => ({ label: s, color: color[s] })), chart, "rect");
}

// ---- population pyramid ----------------------------------------------------------------------------------

// rows: [{age, sex: "Male"|"Female", value}] as shares of the population; compare: same shape or null.
export function pyramid({ rows, compare, ages, colors = chartColors(), format, tickFormat = format, label, compareLabel, width }) {
  const max = Math.max(...rows.map((r) => r.value), ...(compare ?? []).map((r) => r.value), 0.001) * 1.1;
  const signed = (d) => (d.sex === "Male" ? -d.value : d.value);
  const marks = [
    Plot.ruleX([0], { stroke: ink2, strokeOpacity: 0.5 }),
    Plot.barX(rows, {
      x: signed, y: "age", fill: (d) => (d.sex === "Male" ? colors[0] : colors[1]), rx: 2, insetTop: 1, insetBottom: 1,
      title: (d) => `Ages ${d.age}\n${d.sex}: ${format(d.value)} of ${label ?? "the population"}`, tip: true,
    }),
  ];
  if (compare) {
    marks.push(Plot.tickX(compare, {
      x: signed, y: "age", stroke: ink, strokeWidth: 2, strokeOpacity: 0.85,
      title: (d) => `Ages ${d.age}\n${compareLabel}: ${d.sex} ${format(d.value)}`, tip: true,
    }));
  }
  const chart = Plot.plot(base({
    width, height: ages.length * 20 + 44, marginLeft: 64, marginTop: 6,
    x: { domain: [-max, max], grid: true, label: null, tickFormat: (d) => tickFormat(Math.abs(d)), ticks: 6 },
    y: { domain: [...ages].reverse(), label: null, tickSize: 0 },
    marks,
  }));
  const items = [{ label: "Male", color: colors[0] }, { label: "Female", color: colors[1] }];
  const wrap = withLegend(items, chart, "rect");
  if (compare) {
    const note = document.createElement("div");
    note.className = "pf-legend-note";
    note.textContent = `Ticks: ${compareLabel}`;
    wrap.firstChild.append(note);
  }
  return wrap;
}

// ---- lines -----------------------------------------------------------------------------------------------

// series: [{label, color, points: [{x, y, lo?, hi?, estimated?}]}]. Draws a line per series, dots at each
// point, a margin-of-error band where lo/hi exist, a hover crosshair with a tooltip and an end label.
export function lines({ series, format, tickFormat = format, xFormat = (d) => String(d), zero = false, width, yLabel, xTicks }) {
  const flat = series.flatMap((s) => s.points.map((p) => ({ ...p, series: s.label })));
  const color = Object.fromEntries(series.map((s) => [s.label, s.color]));
  const bands = flat.filter((p) => p.lo != null && p.hi != null);
  const last = series.map((s) => ({ ...s.points[s.points.length - 1], series: s.label })).filter((p) => p.x != null);
  const tip = (d) => `${d.series}\n${xFormat(d.x)}: ${format(d.y)}${d.lo != null ? `\n±${format((d.hi - d.lo) / 2)}` : ""}${d.note ? `\n${d.note}` : ""}`;
  const marks = [
    Plot.ruleY(zero ? [0] : [], { stroke: ink2, strokeOpacity: 0.5 }),
    Plot.areaY(bands, { x: "x", y1: "lo", y2: "hi", fill: (d) => color[d.series], fillOpacity: 0.14, z: "series" }),
    Plot.lineY(flat, { x: "x", y: "y", stroke: (d) => color[d.series], z: "series", strokeWidth: 2, curve: "monotone-x" }),
    Plot.dot(flat, { x: "x", y: "y", fill: (d) => color[d.series], stroke: surface, strokeWidth: 2, r: 3.5 }),
    Plot.ruleX(flat, Plot.pointerX({ x: "x", py: "y", stroke: ink2, strokeOpacity: 0.5 })),
    Plot.tip(flat, Plot.pointerX({ x: "x", y: "y", title: tip })),
  ];
  const chart = Plot.plot(base({
    width, height: 240, marginRight: 40, marginLeft: 72, marginTop: 14,
    x: { label: null, tickFormat: xFormat, ticks: Math.min(xTicks ?? 6, Math.max(2, Math.floor(width / 85))), type: "linear", nice: false },
    y: { grid: true, label: yLabel ?? null, tickFormat, zero, nice: true },
    marks,
  }));
  return withLegend(series.map((s) => ({ label: s.label, color: s.color })), chart, "line");
}

// ---- value box and table ---------------------------------------------------------------------------------

export function valueBox({ label, value, sub, method, methods }) {
  const el = document.createElement("div");
  el.className = "pf-value";
  const m = method ? `<span class="pf-chip pf-chip-${method}" title="${escapeHtml(methods?.[method]?.note ?? "")}">${escapeHtml(methods?.[method]?.short ?? method)}</span>` : "";
  el.innerHTML = `<div class="pf-value-label">${escapeHtml(label)}</div>
    <div class="pf-value-number">${escapeHtml(value)}</div>
    <div class="pf-value-sub">${sub ? escapeHtml(sub) : "&nbsp;"} ${m}</div>`;
  return el;
}

// A plain table (the accessible view of the data). columns: [{key, label, align?}].
export function table(rows, columns) {
  const t = document.createElement("table");
  t.className = "pf-table";
  const head = t.createTHead().insertRow();
  for (const c of columns) {
    const th = document.createElement("th");
    th.scope = "col"; th.textContent = c.label;
    if (c.align) th.style.textAlign = c.align;
    head.append(th);
  }
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    for (const c of columns) {
      const td = tr.insertCell();
      td.textContent = r[c.key] ?? "";
      if (c.align) td.style.textAlign = c.align;
    }
  }
  return t;
}
