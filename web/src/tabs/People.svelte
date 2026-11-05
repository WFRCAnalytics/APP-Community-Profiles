<script lang="ts">
  import PyramidCard from "../components/PyramidCard.svelte";
  import SexSplit from "../components/SexSplit.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { SPECS } from "../lib/specs";
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["pop", "median_age", "hispanic", "age65"]} />
  <div class="g" style="flex:1;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <PyramidCard style="grid-row:1 / span 2" />
    <SexSplit />
    <ShareCard title="Race" spec={SPECS.race} sort />
    <ShareCard title="Age groups" spec={SPECS.ageBands} />
    <ShareCard title="Hispanic or Latino origin" spec={SPECS.ethnicity} />
  </div>
</div>
