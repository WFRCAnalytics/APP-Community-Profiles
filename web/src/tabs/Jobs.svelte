<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import SeriesCard from "../components/SeriesCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { bars, type BarRow } from "../lib/charts";
  import { qcewCodes, qcewIndustries } from "../lib/data";
  import { fmtCompact, fmtInt, fmtMoney, fmtPct } from "../lib/format";
  import { SECTOR_BY_NAICS, SPECS, lodesDistribution, sortByFirst } from "../lib/specs";
  import { shareTable } from "../lib/tables";

  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);
  const GROUPS: [string, string][] = [["Worker age", "age"], ["Monthly earnings", "earnings"], ["Education", "education"], ["Race", "race"], ["Ethnicity", "ethnicity"], ["Sex", "sex"], ["Firm age", "firm_age"], ["Firm size", "firm_size"]];
  let group = $state("age");
  const lodes = $derived(Math.min(app.v, app.lodesLatest));
  const qcewYear = $derived(Math.min(app.v, app.qcewLatest));
  const NO_QCEW = "BLS publishes this only for counties, the state, the WFRC region and Morgan RPO, and from 2014.";

  async function loadIndustry() {
    const refs = app.refs;
    const rows = await lodesDistribution(app.db!, "wac", refs, lodes, "industry");
    return { rows, order: sortByFirst(rows), series: refs.map((r) => r.label) };
  }
  async function loadGroup() {
    const refs = app.refs;
    const rows = await lodesDistribution(app.db!, "wac", refs, lodes, group);
    return { rows, order: [...new Set(rows.map((r) => r.category))], series: refs.map((r) => r.label) };
  }
  async function loadQcew(variable: "employment" | "avg_annual_pay") {
    const sel = app.selected!;
    const [rows, codes] = await Promise.all([qcewIndustries(app.db!, sel, qcewYear), qcewCodes(app.db!)]);
    const label = new Map(codes.filter((c) => c.kind === "industry").map((c) => [c.code, c.label]));
    return rows
      .filter((r) => r.industry !== "10" && r.industry !== "99" && r[variable] != null)
      .map((r): BarRow => ({ category: SECTOR_BY_NAICS[r.industry] ?? label.get(r.industry) ?? r.industry, series: variable === "employment" ? "Employment" : "Average annual pay", value: r[variable] as number }))
      .sort((a, b) => b.value - a.value);
  }
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["unemployment"]} jobs cols={2} style="max-width:560px" />
  <div class="g" style="flex:1;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <SeriesCard kind="jobs" title="Jobs over time" />
    <ChartCard
      title="Jobs by industry, {lodes}"
      style="grid-row:1 / span 2"
      note="Share of jobs located here, by NAICS sector. Source: LEHD LODES8, {lodes}."
      load={loadIndustry}
      isEmpty={(d) => !d.rows.length}
      draw={(d, width, height, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height })}
      table={(d) => shareTable(d.rows, d.series, pct1)}
    />
    <ChartCard
      title="Who holds the jobs, {lodes}"
      note="Share of jobs located here. Education is reported for workers 30 and older. Source: LEHD LODES8, {lodes}."
      load={loadGroup}
      isEmpty={(d) => !d.rows.length}
      draw={(d, width, height, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height })}
      table={(d) => shareTable(d.rows, d.series, pct1)}
    >
      {#snippet controls()}
        <div class="controls"><div class="field"><label for="grp">Break down by</label><select id="grp" bind:value={group}>{#each GROUPS as [text, key]}<option value={key}>{text}</option>{/each}</select></div></div>
      {/snippet}
    </ChartCard>
    <ChartCard
      title="Employment by industry, {qcewYear}"
      style="grid-row:1 / span 2"
      note="Private-sector average annual employment. Sectors BLS withholds are left out. Source: BLS QCEW, {qcewYear}."
      load={() => loadQcew("employment")}
      isEmpty={(d) => !d.length}
      emptyText={NO_QCEW}
      draw={(d, width, height, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width, height })}
      table={(d) => ({ columns: [{ key: "category", label: "Industry" }, { key: "v", label: "Employment", align: "right" }], rows: d.map((r) => ({ category: r.category, v: fmtInt(r.value) })) })}
    />
    <SeriesCard kind="workers" title="Workers who live here over time" />
    <ShareCard title="Employment status (16 and over)" spec={SPECS.employment} note="Published from 2011." />
  </div>
</div>
