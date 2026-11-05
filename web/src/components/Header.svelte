<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { TYPE_LABEL } from "../lib/indicators";
  import { theme } from "../lib/theme.svelte";

  let query = $state("");
  let open = $state(false);
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: typeof app.geos = [], contains: typeof app.geos = [];
    for (const g of app.geos) {
      const n = g.geo_name.toLowerCase();
      if (n.startsWith(q)) starts.push(g); else if (n.includes(q)) contains.push(g);
    }
    return [...starts, ...contains].slice(0, 9);
  });

  function choose(id: string) {
    app.select(id);
    query = "";
    open = false;
    input?.blur();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(matches.length - 1, active + 1); open = true; }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === "Enter" && matches[active]) { e.preventDefault(); choose(matches[active].geo_id); }
    else if (e.key === "Escape") { open = false; query = ""; }
  }
  $effect(() => { query; active = 0; });

  const shortLabel = $derived(theme.pref === "system" ? "Auto" : theme.pref === "light" ? "Light" : "Dark");
  const themeLabel = $derived({ system: "System theme", light: "Light theme", dark: "Dark theme" }[theme.pref]);
</script>

<header class="header">
  <h1 class="brand">
    <a href="./" onclick={(e) => { e.preventDefault(); app.page = ""; }}><span class="long">Community profiles</span><span class="short">Profiles</span></a>
    <small>Wasatch Front facts and figures</small>
  </h1>
  <div class="search" role="search">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6" /><path d="M10.5 10.5 14 14" stroke-linecap="round" /></svg>
    <input
      bind:this={input} bind:value={query} {onkeydown}
      onfocus={() => (open = true)} onblur={() => setTimeout(() => (open = false), 120)}
      type="search" placeholder="Find an area" aria-label="Find a city, county or planning area"
      role="combobox" aria-expanded={open && !!query} aria-controls="search-list" aria-autocomplete="list" autocomplete="off"
      aria-activedescendant={matches[active] ? `opt-${matches[active].geo_id}` : undefined}
    />
    {#if open && query.trim()}
      <ul id="search-list" role="listbox" aria-label="Matching areas">
        {#each matches as g, i (g.geo_id)}
          <li id="opt-{g.geo_id}" role="option" aria-selected={i === active} onmousedown={(e) => { e.preventDefault(); choose(g.geo_id); }}>
            <span>{g.geo_name}</span><small>{TYPE_LABEL[g.geo_type]?.split(" (")[0]}</small>
          </li>
        {:else}
          <li class="none" role="option" aria-selected="false">No area matches “{query}”.</li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="spacer"></div>
  <a class="header-link" href="#page=methods" onclick={(e) => { e.preventDefault(); app.page = app.page === "methods" ? "" : "methods"; }}>{app.page === "methods" ? "Back to the map" : "Methods"}</a>
  <button class="icon-btn" onclick={() => theme.cycle()} aria-label="Theme: {shortLabel}" title="{themeLabel} (click to change)">
    {#if theme.pref === "dark"}
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" /></svg>
    {:else if theme.pref === "light"}
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke-linecap="round" /></svg>
    {:else}
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11Z" fill="currentColor" /></svg>
    {/if}
    <span>{theme.pref === "system" ? "Auto" : theme.pref === "light" ? "Light" : "Dark"}</span>
  </button>
  <a class="header-link wfrc" href="https://wfrc.utah.gov" rel="noopener">WFRC</a>
</header>
