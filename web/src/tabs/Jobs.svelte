<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import Tile from "../components/Tile.svelte";
  import { app } from "../lib/app.svelte";
  import { bars, type BarRow } from "../lib/charts";
  import { hasQcew, lodesValues, odFlows, odTop, qcewCodes, qcewIndustries } from "../lib/data";
  import { fmtCompact, fmtInt, fmtMoney, fmtPct } from "../lib/format";
  import { SECTOR_BY_NAICS, SPECS, lodesDistribution, sortByFirst } from "../lib/specs";
  import { shareTable } from "../lib/tables";

  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);
  const GROUPS: [string, string][] = [["Worker age", "age"], ["Monthly earnings", "earnings"], ["Education", "education"], ["Race", "race"], ["Ethnicity", "ethnicity"], ["Sex", "sex"], ["Firm age", "firm_age"], ["Firm size", "firm_size"]];
  const OD_TYPES = ["aog", "mpo", "rpo", "fws", "county", "place"];

  let year = $state(0);
  let group = $state("age");
  const lodesYear = $derived(year || app.lodesLatest);
  const hasOd = $derived(!!app.selected && OD_TYPES.includes(app.selected.type));
  const NO_OD = "Commute flows are published for the region, MPO, RPO, workshop areas, counties and cities.";
  const NO_QCEW = "BLS publishes this only for counties, the state, the WFRC region and Morgan RPO.";

  const summary = $derived.by(async () => {
    const sel = app.selected!, refs = app.refs, y = lodesYear, db = app.db!;
    const [jobs, workers, flows] = await Promise.all([lodesValues(db, "wac", refs, y), lodesValues(db, "rac", refs, y), OD_TYPES.includes(sel.type) ? odFlows(db, sel.type, sel.id, y) : []]);
    let both = 0, inflow = 0, outflow = 0, outside = 0;
    for (const f of flows) {
      const o = f.origin_id === sel.id, d = f.dest_id === sel.id;
      if (o && d) both += f.jobs;
      else if (d) { inflow += f.jobs; if (f.origin_id === "out-of-state") outside += f.jobs; }
      else if (o) outflow += f.jobs;
    }
    const j = jobs.get(`${sel.id}|C000`), w = workers.get(`${sel.id}|C000`);
    const cmp = app.compare;
    const src = `${y} LODES`;
    const tiles: { label: string; value: string; meta: string; compare?: { label: string; value: string } | null; method: "aggregated" | null }[] = [
      { label: "Jobs located here", value: fmtInt(j), meta: src, method: "aggregated", compare: cmp ? { label: cmp.label, value: fmtInt(jobs.get(`${cmp.id}|C000`)) } : null },
      { label: "Workers who live here", value: fmtInt(w), meta: src, method: "aggregated", compare: cmp ? { label: cmp.label, value: fmtInt(workers.get(`${cmp.id}|C000`)) } : null },
      { label: "Jobs per worker", value: j && w ? (j / w).toFixed(2) : "–", meta: "jobs here ÷ workers here", method: null },
    ];
    if (OD_TYPES.includes(sel.type)) tiles.push(
      { label: "Live and work here", value: fmtInt(both), meta: src, method: "aggregated" },
      { label: "Commute in", value: fmtInt(inflow), meta: `${fmtInt(outside)} from outside Utah`, method: "aggregated" },
      { label: "Commute out", value: fmtInt(outflow), meta: "to other Utah areas", method: "aggregated" });
    return tiles;
  });

  async function loadIndustry() {
    const refs = app.refs;
    const rows = await lodesDistribution(app.db!, "wac", refs, lodesYear, "industry");
    return { rows, order: sortByFirst(rows), series: refs.map((r) => r.label) };
  }
  async function loadGroup() {
    const refs = app.refs;
    const rows = await lodesDistribution(app.db!, "wac", refs, lodesYear, group);
    return { rows, order: [...new Set(rows.map((r) => r.category))], series: refs.map((r) => r.label) };
  }

  const placeLabel = (id: string, sel: string) => (id === sel ? "Same area" : id === "other-ut" ? "Elsewhere in Utah" : id === "out-of-state" ? "Outside Utah" : app.names.get(id) ?? id);
  async function loadFlow(direction: "origins" | "destinations") {
    const sel = app.selected!;
    if (!OD_TYPES.includes(sel.type)) return [] as BarRow[];
    const rows = await odTop(app.db!, sel.type, sel.id, lodesYear, direction, 10);
    return rows.map((r) => ({ category: placeLabel(r.other, sel.id), series: "Jobs", value: r.jobs }));
  }

  async function loadQcew(variable: "employment" | "avg_annual_pay") {
    const sel = app.selected!;
    const [rows, codes] = await Promise.all([qcewIndustries(app.db!, sel, app.qcewLatest), qcewCodes(app.db!)]);
    const label = new Map(codes.filter((c) => c.kind === "industry").map((c) => [c.code, c.label]));
    return rows
      .filter((r) => r.industry !== "10" && r.industry !== "99" && r[variable] != null)
      .map((r) => ({ category: SECTOR_BY_NAICS[r.industry] ?? label.get(r.industry) ?? r.industry, series: variable === "employment" ? "Employment" : "Average annual pay", value: r[variable] as number }))
      .sort((a, b) => b.value - a.value);
  }

  const flowTable = (rows: BarRow[]) => ({ columns: [{ key: "category", label: "Area" }, { key: "jobs", label: "Jobs", align: "right" as const }], rows: rows.map((r) => ({ category: r.category, jobs: fmtInt(r.value) })) });
</script>

<div class="tab-body">
  <div class="controls">
    <div class="field">
      <label for="f-year">Jobs and commute year</label>
      <select id="f-year" value={lodesYear} onchange={(e) => (year = +e.currentTarget.value)}>
        {#each app.lodesYears.slice().reverse() as y}<option value={y}>{y}</option>{/each}
      </select>
    </div>
  </div>

  <div class="tiles" style="padding:0" aria-label="Jobs and commute figures">
    {#await summary}
      {#each Array(6) as _}<div class="tile"><div class="loading" style="height:72px"></div></div>{/each}
    {:then tiles}
      {#each tiles as t (t.label)}<Tile label={t.label} value={t.value} meta={t.meta} method={t.method} compare={t.compare} />{/each}
    {/await}
  </div>

  <ChartCard
    title="Jobs by industry"
    note="Share of jobs located here by industry (NAICS sector), {lodesYear}. Hover a bar for the number of jobs."
    load={loadIndustry}
    isEmpty={(d) => !d.rows.length}
    draw={(d, width, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width })}
    table={(d) => shareTable(d.rows, d.series, pct1)}
  />

  <ChartCard
    title="Who holds the jobs"
    note="Share of jobs located here, {lodesYear}. Education is reported for workers 30 and older."
    load={loadGroup}
    isEmpty={(d) => !d.rows.length}
    draw={(d, width, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width })}
    table={(d) => shareTable(d.rows, d.series, pct1)}
  >
    {#snippet controls()}
      <div class="controls" style="margin-bottom:8px">
        <div class="field">
          <label for="f-group">Break down by</label>
          <select id="f-group" bind:value={group}>{#each GROUPS as [label, key]}<option value={key}>{label}</option>{/each}</select>
        </div>
      </div>
    {/snippet}
  </ChartCard>

  <ShareCard title="Commute mode (workers who live here)" spec={SPECS.commuteMode} />
  <ShareCard title="Travel time to work" spec={SPECS.travelTime} />

  <ChartCard
    title="Where workers live"
    note="People who work in {app.selected?.label}, by where they live, top 10 in {lodesYear}. Areas are of the same kind as the one chosen."
    load={() => loadFlow("origins")}
    isEmpty={(d) => !d.length}
    emptyText={NO_OD}
    draw={(d, width, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width })}
    table={flowTable}
  />
  <ChartCard
    title="Where residents work"
    note="Workers who live in {app.selected?.label}, by where they work, top 10 in {lodesYear}. Jobs outside Utah are not in this data."
    load={() => loadFlow("destinations")}
    isEmpty={(d) => !d.length}
    emptyText={NO_OD}
    draw={(d, width, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width })}
    table={flowTable}
  />

  <ChartCard
    title="Private-sector employment by industry (QCEW)"
    note="Average annual employment in {app.qcewLatest}, private sector (BLS QCEW). Sectors BLS withholds for confidentiality are left out."
    load={() => loadQcew("employment")}
    isEmpty={(d) => !d.length}
    emptyText={NO_QCEW}
    draw={(d, width, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width })}
    table={(d) => ({ columns: [{ key: "category", label: "Industry" }, { key: "v", label: "Employment", align: "right" }], rows: d.map((r) => ({ category: r.category, v: fmtInt(r.value) })) })}
  />
  <ChartCard
    title="Average annual pay by industry (QCEW)"
    note="Average annual pay per job in {app.qcewLatest}, private sector (BLS QCEW)."
    load={() => loadQcew("avg_annual_pay")}
    isEmpty={(d) => !d.length}
    emptyText={NO_QCEW}
    draw={(d, width, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtMoney, tickFormat: fmtCompact, width })}
    table={(d) => ({ columns: [{ key: "category", label: "Industry" }, { key: "v", label: "Average annual pay", align: "right" }], rows: d.map((r) => ({ category: r.category, v: fmtMoney(r.value) })) })}
  />
  {#if !hasQcew(app.type)}<p class="note" style="margin:0">QCEW covers counties and the WFRC areas that are whole counties; it will not match LODES exactly.</p>{/if}
</div>
