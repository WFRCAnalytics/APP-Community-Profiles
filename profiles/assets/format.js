// Number and label formatting shared by every chart, value box and table.

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export const fmtInt = (v) => (v == null || Number.isNaN(v) ? "–" : int.format(Math.round(v)));
export const fmtOne = (v) => (v == null || Number.isNaN(v) ? "–" : one.format(v));
export const fmtCompact = (v) => (v == null || Number.isNaN(v) ? "–" : compact.format(v));
export const fmtPct = (v, digits = 1) => (v == null || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(digits)}%`);
export const fmtMoney = (v) => (v == null || Number.isNaN(v) ? "–" : `$${int.format(Math.round(v))}`);

export const FORMATS = { int: fmtInt, one: fmtOne, pct: fmtPct, money: fmtMoney, compact: fmtCompact };

// How a value was made, in words a reader needs. `rank` orders them so the weakest claim wins when
// several rows are combined: a published value beats an aggregate, an aggregate beats an estimate.
export const METHODS = {
  direct: { label: "Census published", short: "Published", rank: 0, note: "Published by the Census Bureau for this area." },
  aggregated: { label: "WFRC aggregate", short: "Aggregate", rank: 1, note: "Exact sum of whole Census block groups or blocks inside this area." },
  allocated: { label: "WFRC estimate", short: "Estimate", rank: 2, note: "Split from block groups that are only partly inside this area, using 2020 or 2010 Census block counts." },
  derived: { label: "WFRC estimate", short: "Estimate", rank: 2, note: "Median interpolated from allocated bracket counts; no margin of error." },
};
export const methodOf = (rank) => ["direct", "aggregated", "allocated"][Math.min(rank, 2)];

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A tidy table of objects -> CSV text (for the download button).
export function toCsv(rows, columns) {
  const cell = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}
