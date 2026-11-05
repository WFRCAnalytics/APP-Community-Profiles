<script lang="ts">
  import RateCard from "../components/RateCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { SPECS, yearBuiltCategories } from "../lib/specs";

  const SUBS = [{ id: "stock", label: "Homes" }, { id: "prices", label: "Rents and values" }, { id: "burden", label: "Cost burden" }];
  let sub = $state("stock");

  async function builtSpec() {
    const categories = await yearBuiltCategories(app.db!, app.v);
    return { spec: { topic: "housing", den: ["B25034_001"], categories }, categories };
  }
</script>

<div class="tab">
  {#if sub === "stock"}
    <Tiles ids={["housing_units", "vacant", "single_family", "multifamily", "crowded"]} />
  {:else if sub === "prices"}
    <Tiles ids={["median_rent", "median_value", "median_income"]} />
  {:else}
    <Tiles ids={["rent_burden", "owner_burden", "renters"]} />
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "stock"}
    <div class="g c3r2">
      <ShareCard title="Units in structure" spec={SPECS.structure} />
      <ShareCard title="When homes were built" spec={builtSpec} note="Categories follow the Census definitions for this year." />
      <ShareCard title="Occupied and vacant" spec={SPECS.occupancy} />
      <ShareCard title="Why homes are vacant" spec={SPECS.vacancyStatus} note="Vacant units only." />
      <ShareCard title="People per room" spec={SPECS.crowding} note="Occupied homes; more than 1.0 is usually called crowded." />
      <TrendCard title="Housing units" id="housing_units" />
    </div>
  {:else if sub === "prices"}
    <div class="g c3r2">
      <ShareCard title="Monthly gross rent" spec={SPECS.rentBands} note="Renter households paying cash rent." />
      <ShareCard title="Home value" spec={SPECS.valueBands} note="Owner-occupied homes, as the owner estimates it." />
      <TrendCard title="Median household income" id="median_income" />
      <TrendCard title="Median gross rent" id="median_rent" />
      <TrendCard title="Median home value" id="median_value" />
      <TrendCard title="Renters paying 30 percent or more" id="rent_burden" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <RateCard title="Households paying 30 percent or more of income" spec="costBurden" note="Share of households in each group." style="grid-row:1 / span 2" />
      <ShareCard title="Renters by share of income paid" spec={SPECS.rentBurden} />
      <ShareCard title="Owners by share of income paid" spec={SPECS.ownerBurden} note="Owner costs include the mortgage, taxes, insurance and utilities." />
      <TrendCard title="Renters paying 30 percent or more" id="rent_burden" />
      <TrendCard title="Owners paying 30 percent or more" id="owner_burden" />
    </div>
  {/if}
</div>
