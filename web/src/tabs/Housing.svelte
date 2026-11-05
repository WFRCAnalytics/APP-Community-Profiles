<script lang="ts">
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { SPECS, yearBuiltCategories } from "../lib/specs";

  async function builtSpec() {
    const categories = await yearBuiltCategories(app.db!, app.v);
    return { spec: { topic: "housing", den: ["B25034_001"], categories }, categories };
  }
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["housing_units", "vacant", "median_rent", "median_value", "rent_burden"]} />
  <div class="g" style="flex:1;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
    <ShareCard title="Units in structure" spec={SPECS.structure} />
    <ShareCard title="When homes were built" spec={builtSpec} note="Categories follow the Census definitions for this year." />
    <ShareCard title="Renters by share of income paid" spec={SPECS.rentBurden} />
    <ShareCard title="Occupied and vacant" spec={SPECS.occupancy} />
    <TrendCard title="Median gross rent over time" id="median_rent" />
    <TrendCard title="Median home value over time" id="median_value" />
    <TrendCard title="Renters paying 30 percent or more" id="rent_burden" />
    <TrendCard title="Vacant housing units over time" id="vacant" />
  </div>
</div>
