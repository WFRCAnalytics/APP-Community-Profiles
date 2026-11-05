<script lang="ts">
  // An ACS history chart for one indicator (one point per year, the year being the end of the 5-year estimate), with the margin
  // of error as a band where the Census publishes one. The chosen year is highlighted.
  import { app } from "../lib/app.svelte";
  import { lines, type LineSeries } from "../lib/charts";
  import { indicatorSeries } from "../lib/data";
  import { FORMATS, METHODS, fmtCompact, fmtPct } from "../lib/format";
  import { BY_ID } from "../lib/indicators";
  import { colorize } from "../lib/series";
  import { trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";

  let { title, id, zero = false, style = "" }: { title: string; id: string; zero?: boolean; style?: string } = $props();
  const ind = $derived(BY_ID[id]);
  const fmt = $derived(FORMATS[ind.format]);
  // Axis labels are short (1.2M, $98K, 24%) so they fit beside the plot; the highlighted value keeps its full form.
  const tickFmt = $derived(
    ind.format === "pct" ? (d: number | null | undefined) => fmtPct(d, 0)
    : ind.format === "int" ? (d: number | null | undefined) => fmtCompact(d)
    : ind.format === "money" ? (d: number | null | undefined) => (d == null ? "–" : d >= 10000 ? `$${fmtCompact(d)}` : fmt(d))
    : fmt,
  );

  async function load(): Promise<LineSeries[]> {
    const refs = app.refs;
    const data = await indicatorSeries(app.db!, ind, refs);
    return refs.map((r) => ({
      label: r.label, color: "",
      points: data.filter((d) => d.id === r.id).map((d) => ({
        x: d.vintage, y: d.value!, lo: d.moe == null ? null : d.value! - d.moe, hi: d.moe == null ? null : d.value! + d.moe,
        note: METHODS[d.method].label,
      })),
    })).filter((s) => s.points.length);
  }
</script>

<ChartCard
  {title}
  {style}
  note="Source: American Community Survey 5-year estimates; each point is the estimate ending that year."
  {load}
  isEmpty={(s) => !s.length}
  draw={(s, width, height, pal) => lines({ series: colorize(s, app.selected?.label, pal), pal, format: fmt, tickFormat: tickFmt, zero, width, height, highlight: app.v, tipX: (v) => `${v - 4}–${v}` })}
  table={(s) => trendTable(s, fmt, (x) => `${x}`)}
/>
