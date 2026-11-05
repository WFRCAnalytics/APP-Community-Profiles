<script lang="ts">
  import LodesCard from "../components/LodesCard.svelte";
  import QcewCard from "../components/QcewCard.svelte";
  import SeriesCard from "../components/SeriesCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { SPECS } from "../lib/specs";

  const SUBS = [{ id: "jobs", label: "Workforce" }, { id: "industries", label: "Industries" }];
  let sub = $state("jobs");
</script>

<div class="tab">
  <Tiles ids={["unemployment", "labor_force"]} jobs />
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "jobs"}
    <div class="g c3r2">
      <SeriesCard kind="jobs" title="Jobs over time" />
      <SeriesCard kind="workers" title="Workers who live here over time" />
      <ShareCard title="Employment status (16 and over)" spec={SPECS.employment} note="Published from 2011." />
      <LodesCard id="a" initial="age" />
      <LodesCard id="b" initial="earnings" pick={false} />
      <TrendCard title="Unemployment rate" id="unemployment" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <LodesCard id="c" initial="industry" pick={false} style="grid-row:1 / span 2" />
      <QcewCard variable="employment" />
      <QcewCard variable="avg_annual_pay" />
      <LodesCard id="d" initial="firm_size" pick={false} />
      <LodesCard id="e" initial="education" pick={false} />
    </div>
  {/if}
</div>
