<script lang="ts">
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { SPECS } from "../lib/specs";

  // Poverty is not published below the tract, so a WFRC area is split from tracts and is the more approximate table.
  const custom = $derived(app.refs.some((r) => ["aog", "mpo", "rpo", "fws"].includes(r.type)));
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["median_income", "poverty", "unemployment"]} />
  <div class="g" style="flex:1;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <ShareCard title="Household income" spec={SPECS.income} note="Dollars of each year, not adjusted for inflation." style="grid-row:1 / span 2" />
    <TrendCard title="Median household income over time" id="median_income" />
    <TrendCard title="People below the poverty level" id="poverty" />
    <TrendCard title="Unemployment rate" id="unemployment" />
    <section class="pn">
      <div class="pn-head"><h3>A caution for planning areas</h3></div>
      <div class="pn-body prose-note">
        <p>The Census Bureau does not publish poverty, group quarters, school enrollment or disability below the census tract. For the WFRC region, MPO, RPO and workshop areas these tables are split from tracts, so they are the more approximate figures for the smaller areas.</p>
        {#if custom}<p class="caveat">The area you are looking at is one of these planning areas.</p>{/if}
      </div>
    </section>
  </div>
</div>
