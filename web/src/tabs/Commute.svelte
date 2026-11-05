<script lang="ts">
  import { site } from "../lib/site";
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import Tile from "../components/Tile.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { bars, type BarRow } from "../lib/charts";
  import { lodesValues, odFlows, odTop } from "../lib/data";
  import { fmtCompact, fmtInt } from "../lib/format";
  import { SPECS } from "../lib/specs";

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
    const rows = await odTop(app.db!, sel.type, sel.id, lodes, direction, 10);
    return rows.map((r): BarRow => ({ category: label(r.other, sel.id), series: "Jobs", value: r.jobs }));
  }
  const flowTable = (rows: BarRow[]) => ({ columns: [{ key: "category", label: "Area" }, { key: "jobs", label: "Jobs", align: "right" as const }], rows: rows.map((r) => ({ category: r.category, jobs: fmtInt(r.value) })) });
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <div class="cols6" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px">
    <div style="display:contents"><Tiles ids={["drive_alone", "transit", "wfh"]} cols={3} style="grid-column:1 / span 3" /></div>
    {#await flow then f}
      <div class="tiles" style="grid-column:4 / span 3;grid-template-columns:repeat(3,minmax(0,1fr))">
        {#if f}
          <Tile label="Live and work here" value={fmtInt(f.both)} meta="LODES8 {lodes}" method="aggregated" />
          <Tile label="Commute in" value={fmtInt(f.inflow)} meta="{fmtInt(f.outside)} from outside {site.state.name}" method="aggregated" />
          <Tile label="Commute out" value={fmtInt(f.outflow)} meta="to other {site.state.name} areas" method="aggregated" />
        {:else}
          <p class="empty" style="grid-column:1 / span 3">{NO_OD}</p>
        {/if}
      </div>
    {/await}
  </div>
  <div class="g" style="flex:1;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <ShareCard title="How workers get to work" spec={SPECS.commuteMode} />
    <ShareCard title="Travel time to work" spec={SPECS.travelTime} />
    <TrendCard title="Workers who work from home" id="wfh" />
    <ChartCard
      title="Where workers live, {lodes}"
      note="People who work here, by where they live, top 10. Source: LEHD LODES8, {lodes}. Areas are of the same kind as the one chosen."
      load={() => loadTop("origins")}
      isEmpty={(d) => !d.length}
      emptyText={NO_OD}
      draw={(d, width, height, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width, height })}
      table={flowTable}
    />
    <ChartCard
      title="Where residents work, {lodes}"
      note="Workers who live here, by where they work, top 10. Jobs outside {site.state.name} are not in this data. Source: LEHD LODES8, {lodes}."
      load={() => loadTop("destinations")}
      isEmpty={(d) => !d.length}
      emptyText={NO_OD}
      draw={(d, width, height, pal) => bars({ rows: d, order: d.map((r) => r.category), pal, format: fmtInt, tickFormat: fmtCompact, width, height })}
      table={flowTable}
    />
    <TrendCard title="Workers who take transit" id="transit" />
  </div>
</div>
