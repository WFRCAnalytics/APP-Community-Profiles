// Helpers shared by the line-chart cards: build series from rows, and colour them: one series in the theme accent, two by role (selected blue, compared brick).
import type { LineSeries, Point } from "./charts";
import type { Palette } from "./theme.svelte";
import type { AreaRef } from "./specs";

export function seriesFrom(refs: AreaRef[], rows: { id: string; x: number; y: number; note?: string }[]): LineSeries[] {
  return refs
    .map((r) => ({ id: r.id, label: r.label, color: "", points: rows.filter((d) => d.id === r.id).map((d): Point => ({ x: d.x, y: d.y, note: d.note })) }))
    .filter((s) => s.points.length);
}

// The series whose id is the selected area is blue; any other is the compared area. (Ids, not labels: two places can share a name.)
export function colorize(series: LineSeries[], selectedId: string | undefined, pal: Palette): LineSeries[] {
  if (series.length === 1) return [{ ...series[0], color: pal.accent }];
  return series.map((s) => ({ ...s, color: s.id === selectedId ? pal.selected : pal.compare }));
}
