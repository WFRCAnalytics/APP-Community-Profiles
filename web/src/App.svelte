<script lang="ts">
  import { onMount } from "svelte";
  import { site } from "./lib/site";
  import AreaPicker from "./components/AreaPicker.svelte";
  import ContextBar from "./components/ContextBar.svelte";
  import Footer from "./components/Footer.svelte";
  import Methods from "./components/Methods.svelte";
  import Navbar from "./components/Navbar.svelte";
  import RailNav from "./components/RailNav.svelte";
  import Splash from "./components/Splash.svelte";
  import { app } from "./lib/app.svelte";
  import { autoStartTour } from "./lib/tour";
  import Commute from "./tabs/Commute.svelte";
  import Education from "./tabs/Education.svelte";
  import Households from "./tabs/Households.svelte";
  import Housing from "./tabs/Housing.svelte";
  import Income from "./tabs/Income.svelte";
  import Indicators from "./tabs/Indicators.svelte";
  import Jobs from "./tabs/Jobs.svelte";
  import Overview from "./tabs/Overview.svelte";
  import People from "./tabs/People.svelte";

  onMount(() => { app.init(); });

  // Keep the address bar in step with the chosen area, comparison, year and tab.
  $effect(() => {
    if (!app.ready) return;
    app.type; app.id; app.cmp; app.v; app.tab; app.sub; app.page;
    app.writeHash();
  });
  // The tour offers itself on the homepage (the overview, with no documentation page open) once the data has loaded.
  $effect(() => { if (app.ready) return autoStartTour(); });
  $effect(() => { document.title = app.selected ? `${app.selected.label} · ${site.title}` : site.title; });
</script>

<a class="skip" href="#screen">Skip to the profile</a>
<div class="app">
  <Navbar />
  {#if app.error}
    <div class="splash"><p class="error" role="alert">The data could not be loaded: {app.error}</p></div>
  {:else if !app.ready}
    <div class="splash"><Splash /></div>
  {:else}
    <div class="body">
      <RailNav />
      <main class="work">
        <ContextBar />
        <div class="screen" id="screen" role="tabpanel" aria-labelledby="tab-{app.tab}">
          {#if app.tab === "overview"}<Overview />
          {:else if app.tab === "people"}<People />
          {:else if app.tab === "households"}<Households />
          {:else if app.tab === "housing"}<Housing />
          {:else if app.tab === "income"}<Income />
          {:else if app.tab === "education"}<Education />
          {:else if app.tab === "jobs"}<Jobs />
          {:else if app.tab === "commute"}<Commute />
          {:else}<Indicators />{/if}
        </div>
        <Footer />
      </main>
      <AreaPicker />
      {#if app.page === "methods"}<Methods />{/if}
    </div>
  {/if}
</div>
