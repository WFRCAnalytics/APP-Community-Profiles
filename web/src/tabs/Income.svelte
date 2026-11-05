<script lang="ts">
  import ShareCard from "../components/ShareCard.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { SPECS } from "../lib/specs";

  // Poverty is not published below the tract, so a WFRC area is split from tracts and is the more approximate table.
  const custom = $derived(app.refs.some((r) => ["aog", "mpo", "rpo", "fws"].includes(r.type)));
</script>

<div class="tab-body">
  <ShareCard title="Household income" spec={SPECS.income} note="Dollars of each period, not adjusted for inflation." />
  <TrendCard title="Median household income over time" id="median_income" />
  <ShareCard title="Educational attainment (adults 25 and over)" spec={SPECS.education} />
  <ShareCard title="Employment status (people 16 and over)" spec={SPECS.employment} />
  <TrendCard title="People below the poverty level over time" id="poverty" />
  {#if custom}
    <p class="caveat">The Census does not publish poverty, group quarters, school enrollment or disability for block groups. For the WFRC region, MPO, RPO and workshop areas these are split from census tracts, so they are the more approximate figures for the smaller areas.</p>
  {/if}
  <TrendCard title="Unemployment rate over time" id="unemployment" />
</div>
