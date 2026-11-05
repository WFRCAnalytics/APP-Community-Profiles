// Sections for the map tooltips. Every section has the same grammar: a muted label on the left and the figure that matters on
// the right, then one quiet graphic: a rail that places an area among all of them, a line against the median area, two bars,
// or a bar split in two. Marks are thin, lines are solid, colour is the theme accent against neutral grey.
export type Pt = { x: number; y: number };
type Head = [string, string?];
export type TipVisual =
  | { kind: "rank"; head: Head; values: number[]; value: number; median: number; short: (v: number) => string }
  | { kind: "bivar"; metrics: { label: string; value: string; level: string }[]; cell: [number, number] | null; colors: string[][] }
  | { kind: "trend"; head: Head; points: Pt[]; typical?: Pt[]; at?: number; key?: string }
  | { kind: "bars"; head?: Head; rows: { label: string; value: number; text: string }[]; note?: string }
  | { kind: "stack"; head: Head; parts: { label: string; value: number }[] };

const NS = "http://www.w3.org/2000/svg";
const W = 220;
const h = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
function s(tag: string, attrs: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}
const svgRoot = (H: number) => s("svg", { class: "tg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true" });
const text = (parent: Element, x: number, y: number, anchor: string, t: string) => {
  const e = s("text", { x, y, "text-anchor": anchor, class: "tgt" }, parent);
  e.textContent = t;
};
const section = (head: Head | undefined, ...body: Element[]) => {
  const box = h("div", "tsec");
  if (head) {
    const row = h("div", "thead");
    row.append(h("span", "hl", head[0]));
    if (head[1]) row.append(h("b", "hr", head[1]));
    box.append(row);
  }
  box.append(...body);
  return box;
};

const REST = "color-mix(in srgb, var(--muted) 38%, transparent)";

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((p, q) => p - q), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const change = (ps: Pt[] | undefined) => {
  const a = ps?.[0]?.y, b = ps?.[ps.length - 1]?.y;
  if (a == null || b == null || ps!.length < 2 || !a) return null;
  const c = (b - a) / Math.abs(a);
  return `${c < 0 ? "−" : "+"}${Math.abs(c * 100).toFixed(Math.abs(c) < 0.1 ? 1 : 0)}%`;
};

// Smooth density of every area's value along one hairline, so a crowd and an outlier look different. The median is a tick, this area a dot.
function density(values: number[], lo: number, hi: number, steps: number) {
  const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)];
  const spread = Math.min(sd, iqr / 1.34) || sd || (hi - lo) / 6;
  const bw = Math.max(0.9 * spread * n ** -0.2, (hi - lo) / 40);
  const ys = Array.from({ length: steps + 1 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / steps;
    let d = 0;
    for (const v of values) d += Math.exp(-0.5 * ((x - v) / bw) ** 2);
    return d;
  });
  const peak = Math.max(...ys) || 1;
  return ys.map((y) => y / peak);
}

function rank({ head, values, value, median: med, short }: Extract<TipVisual, { kind: "rank" }>) {
  const H = 50, base = 33, top = 15, pad = 5;
  const lo = Math.min(...values), hi = Math.max(...values);
  const px = (v: number) => pad + ((v - lo) / (hi - lo || 1)) * (W - 2 * pad);
  const svg = svgRoot(H);
  if (hi > lo) {
    const steps = 48, ys = density(values, lo, hi, steps);
    const pts = ys.map((y, i) => `${(pad + ((W - 2 * pad) * i) / steps).toFixed(1)},${(base - y * (base - top)).toFixed(1)}`);
    s("path", { d: `M${pad},${base}L${pts.join("L")}L${W - pad},${base}Z`, fill: "var(--muted)", opacity: 0.2 }, svg);
  }
  s("line", { x1: pad, x2: W - pad, y1: base, y2: base, stroke: "var(--border)", "stroke-width": 1 }, svg);
  s("line", { x1: px(med).toFixed(1), x2: px(med).toFixed(1), y1: top - 3, y2: base + 4, stroke: "var(--text)", "stroke-width": 1.5, "stroke-linecap": "round" }, svg);
  const label = `median ${short(med)}`, half = label.length * 2.9;
  text(svg, Math.min(W - half, Math.max(half, px(med))), 8, "middle", label);
  s("circle", { cx: px(value).toFixed(1), cy: base, r: 4.5, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
  text(svg, pad, H - 2, "start", short(lo));
  text(svg, W - pad, H - 2, "end", short(hi));
  return section(head, svg);
}

// Both variables of a bivariate map: each value with the third it falls in, and the 3x3 key with this area's cell outlined.
function bivar({ metrics, cell, colors }: Extract<TipVisual, { kind: "bivar" }>) {
  const box = h("div", "tsec bivar");
  const list = h("div", "bmetrics");
  for (const m of metrics) {
    const row = h("div", "bm");
    row.append(h("span", "bml", m.label), h("b", "bmv", m.value), h("span", "bmlv", m.level));
    list.append(row);
  }
  const key = h("div", "bkey");
  colors.forEach((row, r) => row.forEach((c, k) => {
    const i = h("i", cell && cell[0] === r && cell[1] === k ? "on" : "");
    i.style.background = c;
    key.append(i);
  }));
  box.append(list, key);
  return box;
}

// This area's line (accent, 2px) over the median area's (solid grey) on one scale; the dot marks the period the map shows.
function trend({ head, points, typical, at, key }: Extract<TipVisual, { kind: "trend" }>) {
  const H = 46, pad = 4;
  const all = [...points, ...(typical ?? [])];
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const py = (y: number) => H - pad - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const d = (ps: Pt[]) => ps.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join("");
  const svg = svgRoot(H);
  if (typical && typical.length > 1) s("path", { d: d(typical), fill: "none", stroke: "var(--muted)", "stroke-width": 1.25, opacity: 0.55, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  s("path", { d: d(points), fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  const mark = points.find((p) => p.x === (at ?? x1));
  if (mark) s("circle", { cx: px(mark.x).toFixed(1), cy: py(mark.y).toFixed(1), r: 4, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
  const body: Element[] = [svg];
  if (key) {
    const k = h("div", "tkey");
    k.append(h("i", "kl"), h("span", "", key));
    body.push(k);
  }
  return section(head, ...body);
}

// Two or more horizontal bars on one scale.
function bars({ head, rows, note }: Extract<TipVisual, { kind: "bars" }>) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const list = h("div", "tbars");
  rows.forEach((r, i) => {
    const track = h("div", "track"), fill = h("i", "fill");
    fill.style.width = `${r.value ? Math.max(4, (r.value / max) * 100) : 0}%`;
    fill.style.background = i === 0 ? "var(--accent)" : REST;
    track.append(fill);
    list.append(h("span", "bl", r.label), track, h("b", "bv", r.text));
  });
  return section(head, list, ...(note ? [h("div", "tnote", note)] : []));
}

// One bar split in two, each part named underneath with its share.
function stack({ head, parts }: Extract<TipVisual, { kind: "stack" }>) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const bar = h("div", "sbar"), names = h("div", "snames");
  parts.forEach((p, i) => {
    const pct = total ? (p.value / total) * 100 : 0;
    if (pct > 0) { const seg = h("i", "seg"); seg.style.width = `${pct}%`; seg.style.background = i === 0 ? "var(--accent)" : REST; bar.append(seg); }
    const n = h("span", i === 0 ? "sn first" : "sn");
    n.append(h("span", "sl", p.label), h("b", "", `${Math.round(pct)}%`));
    names.append(n);
  });
  return section(head, bar, names);
}

export function renderVisual(v: TipVisual): HTMLElement {
  return v.kind === "rank" ? rank(v) : v.kind === "bivar" ? bivar(v) : v.kind === "trend" ? trend(v) : v.kind === "bars" ? bars(v) : stack(v);
}
