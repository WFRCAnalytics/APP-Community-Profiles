<script lang="ts">
  import MapCard from "../components/MapCard.svelte";
  import PyramidCard from "../components/PyramidCard.svelte";
  import SeriesCard from "../components/SeriesCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["pop", "households", "median_age", "median_income", "median_rent", "median_value"]} />
  <div class="g" style="flex:1;grid-template-columns:minmax(0,0.92fr) minmax(0,1fr) minmax(0,1.05fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <section class="pn" style="grid-row:1 / span 2" aria-label="Where it is">
      <div class="pn-head"><h3>Median household income by county</h3></div>
      <div class="pn-body"><div style="position:absolute;inset:0;border-radius:10px;overflow:hidden"><MapCard compact /></div></div>
      <p class="src">Source: {app.acs}. Open the Map tab to colour it by any variable.</p>
    </section>
    <SeriesCard kind="pop" title="Population over time" />
    <PyramidCard style="grid-row:1 / span 2;grid-column:3" />
    <TrendCard title="Median household income over time" id="median_income" style="grid-row:2;grid-column:2" />
  </div>
</div>
