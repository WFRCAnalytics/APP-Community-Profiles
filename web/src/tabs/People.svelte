<script lang="ts">
  import LanguagesCard from "../components/LanguagesCard.svelte";
  import PyramidCard from "../components/PyramidCard.svelte";
  import RateCard from "../components/RateCard.svelte";
  import SexSplit from "../components/SexSplit.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { SPECS } from "../lib/specs";

  const SUBS = [{ id: "age", label: "Age and sex" }, { id: "race", label: "Race, origin and moves" }, { id: "language", label: "Language and health" }];
  let sub = $state("age");
</script>

<div class="tab">
  {#if sub === "age"}
    <Tiles ids={["pop", "median_age", "under18", "age65", "female"]} />
  {:else if sub === "race"}
    <Tiles ids={["hispanic", "nh_white", "race_asian", "foreign_born", "movers"]} />
  {:else}
    <Tiles ids={["disability", "uninsured", "veterans", "lep", "spanish_home"]} />
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "age"}
    <div class="g" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <PyramidCard style="grid-row:1 / span 2" />
      <ShareCard title="Age groups" spec={SPECS.ageBands} />
      <SexSplit />
      <TrendCard title="Median age" id="median_age" />
      <ShareCard title="Marital status (15 and over)" spec={SPECS.marital} />
    </div>
  {:else if sub === "race"}
    <div class="g c3r2">
      <ShareCard title="Race" spec={SPECS.race} sort />
      <ShareCard title="Race and Hispanic origin" spec={SPECS.raceEthnicity} sort note="Hispanic or Latino people of any race are one group." />
      <ShareCard title="Hispanic or Latino origin" spec={SPECS.ethnicity} />
      <ShareCard title="Where people were born" spec={SPECS.nativity} />
      <ShareCard title="Where people lived a year ago" spec={SPECS.mobility} />
      <TrendCard title="Foreign-born residents" id="foreign_born" />
    </div>
  {:else}
    <div class="g c3r2">
      <LanguagesCard />
      <ShareCard title="Language spoken at home" spec={SPECS.language} note="People 5 and over." />
      <ShareCard title="English proficiency" spec={SPECS.english} note="People who speak a language other than English at home." />
      <RateCard title="Disability by age" spec="disabilityByAge" note="Share of each age group with a disability." />
      <RateCard title="No health insurance by age" spec="uninsuredByAge" note="Share of each age group without coverage. The Census moved the age breaks in 2017 (6 to 17 became 6 to 18, and so on), so the three groups they touch are left out of the trend before then." />
      <RateCard title="Veterans by age" spec="veteransByAge" note="Share of civilians 18 and over who served." />
    </div>
  {/if}
</div>
