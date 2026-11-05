<script lang="ts">
  import MapCard from "../components/MapCard.svelte";
  import SeriesCard from "../components/SeriesCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { BY_ID } from "../lib/indicators";

  let mapVar = $state("median_income");
  let plural = $state("counties");
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["pop", "households", "median_age", "median_income", "median_rent", "median_value"]} />
  <div class="g" style="flex:1;grid-template-columns:minmax(0,2fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <section class="pn" style="grid-row:1 / span 2" aria-label="Area map">
      <div class="pn-head"><h3>{BY_ID[mapVar].label} across {plural}</h3></div>
      <div class="pn-body"><div style="position:absolute;inset:0;border-radius:10px;overflow:hidden"><MapCard simple bind:idX={mapVar} bind:plural /></div></div>
      <p class="src">Source: {app.acs}. Pick one or two variables; the Map tab adds tracts.</p>
    </section>
    <SeriesCard kind="pop" title="Population over time" />
    <TrendCard title="Median household income over time" id="median_income" />
  </div>
</div>
