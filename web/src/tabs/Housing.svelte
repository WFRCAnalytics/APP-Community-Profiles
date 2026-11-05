<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { stacked } from "../lib/charts";
  import { fmtPct } from "../lib/format";
  import { SPECS, vehicles, yearBuiltCategories } from "../lib/specs";

  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  async function loadVehicles() {
    const result = await vehicles(app.db!, app.refs, app.v);
    return { labels: result.labels, parts: app.refs.map((r) => ({ label: r.label, rows: result.rows[r.id] ?? [] })) };
  }
  async function builtSpec() {
    const categories = await yearBuiltCategories(app.db!, app.v);
    return { spec: { topic: "housing", den: ["B25034_001"], categories }, categories };
  }
</script>

<div class="tab-body">
  <ShareCard title="Own or rent" spec={SPECS.tenure} />
  <ChartCard
    title="Vehicles available to households"
    note="Share of all households, split by whether the household owns or rents."
    load={loadVehicles}
    isEmpty={(d) => d.parts.every((p) => !p.rows.length)}
    draw={(d, width, pal) => {
      const wrap = document.createElement("div");
      for (const p of d.parts.filter((x) => x.rows.length)) {
        if (d.parts.length > 1) {
          const h = document.createElement("div");
          h.className = "sub";
          h.textContent = p.label;
          wrap.append(h);
        }
        wrap.append(stacked({ rows: p.rows, order: d.labels, seriesOrder: ["Owner-occupied", "Renter-occupied"], pal, colors: [pal.c5, pal.c3], format: pct1, tickFormat: pct0, width }));
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
  <ShareCard title="Units in structure" spec={SPECS.structure} />
  <ShareCard title="When homes were built" spec={builtSpec} note="Categories follow the Census definitions for this period, so they differ between periods." />
  <ShareCard title="Household types" spec={SPECS.householdType} />
  <ShareCard title="Rent as a share of income (renters)" spec={SPECS.rentBurden} />
  <TrendCard title="Median gross rent over time" id="median_rent" />
  <TrendCard title="Median home value over time" id="median_value" />
</div>
