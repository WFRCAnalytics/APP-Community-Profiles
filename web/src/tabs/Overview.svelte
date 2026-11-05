<script lang="ts">
  import MapCard from "../components/MapCard.svelte";
  import SeriesCard from "../components/SeriesCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import Icon from "../components/Icon.svelte";
  import { app } from "../lib/app.svelte";
  import { BY_ID } from "../lib/indicators";

  let mapVar = $state("median_income");
  let plural = $state("counties");
  let full = $state(false);
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["pop", "households", "median_age", "median_income", "median_rent", "median_value"]} />
  <div class="g" style="flex:1;grid-template-columns:minmax(0,2fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <section class="pn" class:full style="grid-row:1 / span 2" aria-label="Area map">
      <div class="pn-head"><h3>{BY_ID[mapVar].label} across {plural}</h3>
        <button class="sq" onclick={() => (full = !full)} aria-label={full ? "Exit full screen" : "Expand the map to full screen"} title={full ? "Exit full screen" : "Full screen"}><Icon name={full ? "minimize" : "maximize"} size={14} /></button>
      </div>
      <div class="pn-body"><div style="position:absolute;inset:0;border-radius:10px;overflow:hidden"><MapCard bind:idX={mapVar} bind:plural /></div></div>
      <p class="src">Source: {app.acs}. Pick one or two variables, or switch to tracts. Census redrew tracts in 2020, so before then a tract that was split or merged has no value. How to read it is in the documentation.</p>
    </section>
    <SeriesCard kind="pop" title="Population over time" />
    <TrendCard title="Median household income over time" id="median_income" />
  </div>
</div>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && full) full = false; }} />

<style>
  .sq { border: 0; background: transparent; color: var(--muted); padding: 4px; border-radius: 6px; display: inline-flex; cursor: pointer; }
  .sq:hover { color: var(--text); }
  .pn.full { position: fixed; inset: 0; z-index: 50; border-radius: 0; padding: 14px 18px; }
</style>
