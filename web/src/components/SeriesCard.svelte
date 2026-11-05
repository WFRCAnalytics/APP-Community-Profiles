<script lang="ts">
  // Annual series that are not ACS indicators: population estimates (PEP) and LEHD jobs or workers (LODES8).
  import { app } from "../lib/app.svelte";
  import { lines } from "../lib/charts";
  import { hasPep, lodesSeries, pepSeries } from "../lib/data";
  import { fmtCompact, fmtInt } from "../lib/format";
  import { colorize, seriesFrom } from "../lib/series";
  import { trendTable } from "../lib/tables";
  import TrendCard from "./TrendCard.svelte";
  import ChartCard from "./ChartCard.svelte";

  let { kind, title, style = "" }: { kind: "pop" | "jobs" | "workers"; title: string; style?: string } = $props();

  // Population estimates exist for the state, counties, places and whole-county WFRC areas; otherwise fall back to the ACS.
  const usePep = $derived(kind === "pop" && app.refs.every((r) => hasPep(r.type)));

  async function load() {
    const refs = app.refs, db = app.db!;
    if (kind === "pop") return seriesFrom(refs, (await pepSeries(db, refs)).map((p) => ({ id: p.id, x: p.year, y: p.value, note: p.year === 2020 ? "New base: 2020 Census" : "" })));
    return seriesFrom(refs, (await lodesSeries(db, kind === "jobs" ? "wac" : "rac", refs)).map((p) => ({ id: p.id, x: p.year, y: p.value })));
  }
  const source = $derived(kind === "pop" ? "Source: Census Bureau population estimates. The 2010s are based on the 2010 Census and the 2020s on the 2020 Census, so the series steps at 2020."
    : `Source: LEHD LODES8, ${kind === "jobs" ? "jobs by place of work" : "workers by place of residence"}, all jobs, 2002 to ${app.lodesLatest}. Block counts carry noise, so small areas are rough.`);
</script>

{#if kind === "pop" && !usePep}
  <TrendCard {title} id="pop" zero {style} />
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
