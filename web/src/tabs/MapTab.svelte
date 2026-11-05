<script lang="ts">
  import MapCard from "../components/MapCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import { app } from "../lib/app.svelte";
</script>

<div class="g" style="grid-template-columns:minmax(0,1fr) 340px">
  <div class="card" style="position:relative;overflow:hidden"><MapCard /></div>
  <div style="display:flex;flex-direction:column;gap:12px;min-height:0">
    <Tiles ids={["pop", "median_income", "median_age", "renters"]} cols={2} />
    <div class="card prose-note" style="padding:12px 14px;flex:1;overflow:auto">
      <h3 style="font-size:0.95rem;margin-bottom:6px">Reading the map</h3>
      <p>Click an area to open its profile. Shift-click to compare it with the one you have open.</p>
      <p style="color:var(--muted)">Areas are shaded in five equal-sized groups. With a second variable, each area falls in one of nine groups, three by three, and the selected area&rsquo;s group is outlined in the legend.</p>
      <p style="color:var(--muted)">The map shows {app.v}: {app.acs}. Switch to tracts for the latest year only.</p>
    </div>
  </div>
</div>
