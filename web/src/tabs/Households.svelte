<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { stacked } from "../lib/charts";
  import { fmtPct, fmtPctTick } from "../lib/format";
  import { SPECS, vehicles } from "../lib/specs";

  const SUBS = [{ id: "types", label: "Household makeup" }, { id: "cars", label: "Cars and internet" }];
  let sub = $state("types");
  const pct0 = fmtPctTick;
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);
  async function loadVehicles() {
    const result = await vehicles(app.db!, app.refs, app.v);
    return { labels: result.labels, parts: app.refs.map((r) => ({ label: r.label, rows: result.rows[r.id] ?? [] })) };
  }
</script>

<div class="tab">
  {#if sub === "types"}
    <Tiles ids={["households", "avg_hh_size", "living_alone", "married", "renters"]} />
  {:else}
    <Tiles ids={["households", "no_vehicle", "no_internet"]} />
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "types"}
    <div class="g c3r2">
      <ShareCard title="Household types" spec={SPECS.householdType} note="Published from 2019; earlier years used a different table layout." />
      <ShareCard title="Households in more detail" spec={SPECS.householdDetail} note="Published from 2019; earlier years used a different table layout." />
      <ShareCard title="Own or rent" spec={SPECS.tenure} />
      <TrendCard title="Households" id="households" />
      <TrendCard title="Average household size" id="avg_hh_size" />
      <TrendCard title="One-person households" id="living_alone" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <ChartCard
        title="Vehicles available"
        note="Share of all households, by tenure. Source: {app.acs}."
        load={loadVehicles}
        isEmpty={(d) => d.parts.every((p) => !p.rows.length)}
        draw={(d, width, height, pal) => {
          const wrap = document.createElement("div");
          const live = d.parts.filter((x) => x.rows.length);
          for (const p of live) {
            if (live.length > 1) { const h = document.createElement("div"); h.style.cssText = "font-weight:600;font-size:0.82rem;margin:6px 0 2px"; h.textContent = p.label; wrap.append(h); }
            wrap.append(stacked({ rows: p.rows, order: d.labels, seriesOrder: ["Owner-occupied", "Renter-occupied"], pal, colors: [pal.c3, pal.c4], format: pct1, tickFormat: pct0, width, height: Math.floor(height / live.length) - 8 }));
          }
          return wrap;
        }}
        table={(d) => ({
          columns: [{ key: "area", label: "Area" }, { key: "category", label: "Vehicles" }, { key: "owner", label: "Owner-occupied", align: "right" }, { key: "renter", label: "Renter-occupied", align: "right" }],
          rows: d.parts.flatMap((p) => d.labels.map((category) => ({
            area: p.label, category,
            owner: pct1(p.rows.find((r) => r.category === category && r.series === "Owner-occupied")?.value),
            renter: pct1(p.rows.find((r) => r.category === category && r.series === "Renter-occupied")?.value),
          }))),
        })}
      />
        <ShareCard title="Internet access" spec={SPECS.internet} note="Published from 2017." />
      <ShareCard title="Type of internet subscription" spec={SPECS.internetType} note="Published from 2017." />
      <TrendCard title="Households with no vehicle" id="no_vehicle" />
      <TrendCard title="Households with no internet access" id="no_internet" />
    </div>
  {/if}
</div>
