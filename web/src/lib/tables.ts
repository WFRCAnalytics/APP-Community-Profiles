// Table views of chart data: one row per category with a column per area.
import type { Column, Row } from "../components/DataTable.svelte";
import type { LineSeries } from "./charts";
import type { Fmt } from "./charts";

export interface Tabular { columns: Column[]; rows: Row[]; groupKey?: string }

export function shareTable(rows: { category: string; series: string; value: number; count?: number; moe?: number | null }[], series: string[], fmt: Fmt, withCount = true): Tabular {
  const cats = [...new Set(rows.map((r) => r.category))];
  const columns: Column[] = [{ key: "category", label: "Category" }];
  for (const s of series) {
    columns.push({ key: `v:${s}`, label: series.length > 1 ? `${s} (share)` : "Share", align: "right" });
    if (withCount && rows.some((r) => r.count != null)) columns.push({ key: `n:${s}`, label: series.length > 1 ? `${s} (count)` : "Count", align: "right" });
    if (rows.some((r) => r.moe != null)) columns.push({ key: `m:${s}`, label: series.length > 1 ? `${s} (margin of error)` : "Margin of error (90%)", align: "right" });
  }
  const out: Row[] = cats.map((category) => {
    const row: Row = { category };
    for (const s of series) {
      const r = rows.find((x) => x.category === category && x.series === s);
      row[`v:${s}`] = r ? fmt(r.value) : "";
      row[`n:${s}`] = r?.count != null ? Math.round(r.count).toLocaleString("en-US") : "";
      row[`m:${s}`] = r?.moe != null ? `±${fmt(r.moe)}` : "";
    }
    return row;
  });
  return { columns, rows: out };
}

export function trendTable(series: LineSeries[], fmt: Fmt, xLabel: (x: number) => string): Tabular {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const columns: Column[] = [{ key: "x", label: "Period" }];
  for (const s of series) {
    columns.push({ key: `v:${s.label}`, label: s.label, align: "right" });
    if (s.points.some((p) => p.lo != null)) columns.push({ key: `m:${s.label}`, label: `${s.label} margin of error`, align: "right" });
  }
  const rows: Row[] = xs.map((x) => {
    const row: Row = { x: xLabel(x) };
    for (const s of series) {
      const p = s.points.find((q) => q.x === x);
      row[`v:${s.label}`] = p ? fmt(p.y) : "";
      row[`m:${s.label}`] = p?.lo != null && p.hi != null ? `±${fmt((p.hi - p.lo) / 2)}` : "";
    }
    return row;
  });
  return { columns, rows };
}
