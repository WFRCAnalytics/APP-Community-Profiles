<script lang="ts">
  import { TABS, app } from "../lib/app.svelte";
  import Housing from "../tabs/Housing.svelte";
  import Income from "../tabs/Income.svelte";
  import Indicators from "../tabs/Indicators.svelte";
  import Jobs from "../tabs/Jobs.svelte";
  import Overview from "../tabs/Overview.svelte";
  import Population from "../tabs/Population.svelte";
  import Hero from "./Hero.svelte";
  import Toolbar from "./Toolbar.svelte";

  let { onGrip }: { onGrip: (e: PointerEvent) => void } = $props();
  let scroller: HTMLDivElement | undefined = $state();

  function key(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === app.tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    app.tab = TABS[(next + TABS.length) % TABS.length].id;
    document.getElementById(`tab-${app.tab}`)?.focus();
  }
</script>

<aside class="panel" aria-label="Profile of {app.selected?.label}">
  <button class="sheet-grip" aria-label="Resize the panel" onpointerdown={onGrip}></button>
  <div class="panel-scroll" bind:this={scroller}>
    <Toolbar />
    <Hero />
    <div class="tabs" role="tablist" aria-label="Profile sections" tabindex="-1" onkeydown={key}>
      {#each TABS as t}
        <button role="tab" id="tab-{t.id}" aria-selected={app.tab === t.id} aria-controls="tabpanel" tabindex={app.tab === t.id ? 0 : -1} onclick={() => { app.tab = t.id; }}>{t.label}</button>
      {/each}
    </div>
    <div id="tabpanel" role="tabpanel" aria-labelledby="tab-{app.tab}">
      {#if app.tab === "overview"}<Overview />
      {:else if app.tab === "population"}<Population />
      {:else if app.tab === "housing"}<Housing />
      {:else if app.tab === "income"}<Income />
      {:else if app.tab === "jobs"}<Jobs />
      {:else}<Indicators />{/if}
    </div>
  </div>
</aside>
