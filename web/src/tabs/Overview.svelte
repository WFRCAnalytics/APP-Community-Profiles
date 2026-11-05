<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { lines } from "../lib/charts";
  import { hasPep, lodesSeries, pepSeries } from "../lib/data";
  import { fmtCompact, fmtInt } from "../lib/format";
  import { colorize, seriesFrom } from "../lib/series";
  import { SPECS } from "../lib/specs";
  import { trendTable } from "../lib/tables";

  const allPep = $derived(app.refs.every((r) => hasPep(r.type)));

  async function loadPep() {
    const refs = app.refs;
    return seriesFrom(refs, (await pepSeries(app.db!, refs)).map((p) => ({ id: p.id, x: p.year, y: p.value, note: p.year === 2020 ? "New base: 2020 Census" : "" })));
  }
  async function loadJobs() {
    const refs = app.refs;
    return seriesFrom(refs, (await lodesSeries(app.db!, "wac", refs)).map((p) => ({ id: p.id, x: p.year, y: p.value })));
  }
</script>

<div class="tab-body">
  {#if allPep}
    <ChartCard
      title="Population over time"
      note="Annual population estimates, Census Bureau. The 2010s are based on the 2010 Census and the 2020s on the 2020 Census, so the series steps at 2020."
      load={loadPep}
      isEmpty={(s) => !s.length}
      draw={(s, width, pal) => lines({ series: colorize(s, app.selected?.label, pal), pal, format: fmtInt, tickFormat: fmtCompact, width })}
      table={(s) => trendTable(s, fmtInt, String)}
    />
  {:else}
    <TrendCard title="Population over time" id="pop" zero />
  {/if}
  <ChartCard
    title="Jobs over time"
    note="Jobs by place of work, all job types (LEHD LODES). Block counts carry noise, so small areas are rough."
    load={loadJobs}
    isEmpty={(s) => !s.length}
    draw={(s, width, pal) => lines({ series: colorize(s, app.selected?.label, pal), pal, format: fmtInt, tickFormat: fmtCompact, width })}
    table={(s) => trendTable(s, fmtInt, String)}
  />
  <ShareCard title="Age groups" spec={SPECS.ageBands} />
  <ShareCard title="Own or rent" spec={SPECS.tenure} />
  <ShareCard title="How workers get to work" spec={SPECS.commuteMode} />
</div>
