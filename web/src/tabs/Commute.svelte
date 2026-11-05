<script lang="ts">
  import { site } from "../lib/site";
  import ChartCard from "../components/ChartCard.svelte";
  import FlowSlot from "../components/FlowSlot.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tile from "../components/Tile.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { bars, type BarRow } from "../lib/charts";
  import { lodesValues, odFlows, odTop } from "../lib/data";
  import { fmtCompact, fmtInt, fmtPct } from "../lib/format";
  import { SPECS } from "../lib/specs";

  const SUBS = [{ id: "travel", label: "How people travel" }, { id: "flows", label: "Where they go" }];
  let sub = $state("travel");

  const OD_TYPES = ["aog", "mpo", "rpo", "fws", "county", "place"];
  const lodes = $derived(Math.min(app.v, app.lodesLatest));
  const NO_OD = "Commute flows are published for the region, MPO, RPO, workshop areas, counties and cities.";

  // Live-and-work-here, commute in and commute out (LODES8 origin-destination).
  const flow = $derived.by(async () => {
    const sel = app.selected!, y = lodes, db = app.db!;
    if (!OD_TYPES.includes(sel.type)) return null;
    const [flows, jobs, workers] = await Promise.all([odFlows(db, sel.type, sel.id, y), lodesValues(db, "wac", [sel], y), lodesValues(db, "rac", [sel], y)]);
    let both = 0, inflow = 0, outflow = 0, outside = 0;
    for (const f of flows) {
      const o = f.origin_id === sel.id, d = f.dest_id === sel.id;
      if (o && d) both += f.jobs;
      else if (d) { inflow += f.jobs; if (f.origin_id === "out-of-state") outside += f.jobs; }
      else if (o) outflow += f.jobs;
    }
    const j = jobs.get(`${sel.id}|C000`) ?? 0, w = workers.get(`${sel.id}|C000`) ?? 0;
    return { both, inflow, outflow, outside, stay: w ? both / w : null, j, w };
  });

  const label = (id: string, sel: string) => (id === sel ? "Same area" : id === site.outside_id ? `Elsewhere in ${site.state.name}` : id === "out-of-state" ? `Outside ${site.state.name}` : app.names.get(id) ?? id);
  async function loadTop(direction: "origins" | "destinations") {
    const sel = app.selected!;
    if (!OD_TYPES.includes(sel.type)) return [] as BarRow[];
    const rows = await odTop(app.db!, sel.type, sel.id, lodes, direction, 8);
    return rows.map((r): BarRow => ({ category: label(r.other, sel.id), series: "Jobs", value: r.jobs }));
  }
  const flowTable = (rows: BarRow[]) => ({ columns: [{ key: "category", label: "Area" }, { key: "jobs", label: "Jobs", align: "right" as const }], rows: rows.map((r) => ({ category: r.category, jobs: fmtInt(r.value) })) });
</script>

<div class="tab">
  {#if sub === "travel"}
    <Tiles ids={["drive_alone", "transit", "wfh", "walk_bike", "long_commute", "mean_travel"]} />
  {:else}
    {#await flow then f}
      <div class="tiles" style="grid-template-columns:repeat(4,minmax(0,1fr))" aria-label="Key figures">
        {#if f}
          <Tile label="Live and work here" value={fmtInt(f.both)} meta="LODES8 {lodes}" method="aggregated" />
          <Tile label="Residents who work here" value={f.stay == null ? "–" : fmtPct(f.stay, 0)} meta="of workers who live here" method="derived" />
          <Tile label="Commute in" value={fmtInt(f.inflow)} meta="{fmtInt(f.outside)} from outside {site.state.name}" method="aggregated" />
          <Tile label="Commute out" value={fmtInt(f.outflow)} meta="to other {site.state.name} areas" method="aggregated" />
        {:else}
          <p class="empty" style="grid-column:1 / span 4">{NO_OD}</p>
        {/if}
      </div>
    {/await}
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "travel"}
    <div class="g c3r2">
      <ShareCard title="How workers get to work" spec={SPECS.commuteMode} />
      <ShareCard title="Travel time to work" spec={SPECS.travelTime} />
      <TrendCard title="Average commute (minutes)" id="mean_travel" />
      <TrendCard title="Workers who work from home" id="wfh" />
      <TrendCard title="Workers who take transit" id="transit" />
      <TrendCard title="Workers commuting 45 minutes or more" id="long_commute" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <FlowSlot style="grid-row:1 / span 2" />
    <ChartCard
      title="Where workers live, {lodes}"
      note="People who work here, by where they live, top 8. Source: LEHD LODES8, {lodes}. Areas are of the same kind as the one chosen."
      load={() => loadTop("origins")}
      isEmpty={(d) => !d.length}
      emptyText={NO_OD}
      draw={(d, width, height, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width, height })}
      table={flowTable}
    />
    <ChartCard
      title="Where residents work, {lodes}"
      note="Workers who live here, by where they work, top 8. Jobs outside {site.state.name} are not in this data. Source: LEHD LODES8, {lodes}."
      load={() => loadTop("destinations")}
      isEmpty={(d) => !d.length}
      emptyText={NO_OD}
      draw={(d, width, height, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width, height })}
      table={flowTable}
    />
    </div>
  {/if}
</div>
