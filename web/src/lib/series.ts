// Helpers shared by the line-chart cards: build series from rows, and colour them by role (selected blue, compared brick).
import type { LineSeries, Point } from "./charts";
import type { Palette } from "./theme.svelte";
import type { AreaRef } from "./specs";

export function seriesFrom(refs: AreaRef[], rows: { id: string; x: number; y: number; note?: string }[]): LineSeries[] {
  return refs
    .map((r) => ({ label: r.label, color: "", points: rows.filter((d) => d.id === r.id).map((d): Point => ({ x: d.x, y: d.y, note: d.note })) }))
    .filter((s) => s.points.length);
}

// The first reference is the selected area; any other series is the compared area.
export function colorize(series: LineSeries[], selectedLabel: string | undefined, pal: Palette): LineSeries[] {
  return series.map((s) => ({ ...s, color: s.label === selectedLabel ? pal.selected : pal.compare }));
}
