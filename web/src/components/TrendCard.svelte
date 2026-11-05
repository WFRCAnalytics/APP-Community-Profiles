<script lang="ts">
  // An ACS history chart for one indicator (one point per 5-year period, labelled by the period's end year), with the margin of
  // error as a band where the Census publishes one.
  import { app } from "../lib/app.svelte";
  import { lines, type LineSeries } from "../lib/charts";
  import { indicatorSeries } from "../lib/data";
  import { FORMATS, METHODS, fmtPct } from "../lib/format";
  import { BY_ID } from "../lib/indicators";
  import { trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";

  let { title, id, zero = false }: { title: string; id: string; zero?: boolean } = $props();
  const ind = $derived(BY_ID[id]);
  const fmt = $derived(FORMATS[ind.format]);
  const tickFmt = $derived(ind.format === "pct" ? (d: number | null | undefined) => fmtPct(d, 0) : fmt);
  const NOTE = "Each point is a 5-year ACS period, labelled by its last year. Periods overlap, so compare periods that do not (for example 2014–18 and 2019–23). Shaded band: margin of error where one is published.";

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
  note={NOTE}
  {load}
  isEmpty={(s) => !s.length}
  draw={(s, width, pal) => lines({ series: s.map((x) => ({ ...x, color: x.label === app.selected?.label ? pal.selected : pal.compare })), pal, format: fmt, tickFormat: tickFmt, zero, width, tipX: (v) => `${v - 4}–${v}` })}
  table={(s) => trendTable(s, fmt, (x) => `${x - 4}–${x}`)}
/>
