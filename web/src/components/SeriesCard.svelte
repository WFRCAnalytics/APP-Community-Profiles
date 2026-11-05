<script lang="ts">
  // Annual series that are not plain ACS indicators: LEHD jobs or workers (LODES8). Population over time is the ACS series, so it
  // carries the margin-of-error band where the Census publishes one.
  import { app } from "../lib/app.svelte";
  import { lines } from "../lib/charts";
  import { lodesSeries } from "../lib/data";
  import { fmtCompact, fmtInt } from "../lib/format";
  import { colorize, seriesFrom } from "../lib/series";
  import { trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import TrendCard from "./TrendCard.svelte";

  let { kind, title, style = "" }: { kind: "pop" | "jobs" | "workers"; title: string; style?: string } = $props();

  async function load() {
    const refs = app.refs;
    return seriesFrom(refs, (await lodesSeries(app.db!, kind === "jobs" ? "wac" : "rac", refs)).map((p) => ({ id: p.id, x: p.year, y: p.value })));
  }
  const source = $derived(`Source: LEHD LODES8, ${kind === "jobs" ? "jobs by place of work" : "workers by place of residence"}, all jobs, 2002 to ${app.lodesLatest}. Block counts carry noise, so small areas are rough.`);
</script>

{#if kind === "pop"}
  <TrendCard {title} id="pop" {style} />
{:else}
  <ChartCard
    {title}
    {style}
    note={source}
    {load}
    isEmpty={(s) => !s.length}
    draw={(s, width, height, pal) => lines({ series: colorize(s, app.selected?.label, pal), pal, format: fmtInt, tickFormat: fmtCompact, width, height, highlight: Math.min(app.v, s.flatMap((x) => x.points).reduce((m, p) => Math.max(m, p.x), 0)) })}
    table={(s) => trendTable(s, fmtInt, String)}
  />
{/if}
