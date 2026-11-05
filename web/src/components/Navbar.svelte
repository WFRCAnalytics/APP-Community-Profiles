<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { theme } from "../lib/theme.svelte";
  import logoColor from "../assets/wfrc-color.png";
  import logoWhite from "../assets/wfrc-white.png";
  import Icon from "./Icon.svelte";

  const themeName = $derived(theme.pref === "system" ? "Auto" : theme.pref === "light" ? "Light" : "Dark");
  const themeIcon = $derived(theme.pref === "system" ? "monitor" : theme.pref === "light" ? "sun" : "moon");
</script>

<header class="nav">
  <img class="wfrc-logo" src={theme.resolved === "dark" ? logoWhite : logoColor} alt="Wasatch Front Regional Council" width="53" height="30" />
  <h1 class="brand">Community profiles</h1>
  <button class="field-btn" id="area-field" aria-haspopup="dialog" aria-expanded={app.picker === "area"} onclick={() => (app.picker = app.picker === "area" ? null : "area")}>
    <Icon name="search" size={15} />
    {#if app.selected}<span class="chip-area"><i class="dot sel"></i>{app.selected.label}</span>{/if}
    <span class="grow">Search or browse areas</span>
    <Icon name="chevron" size={15} />
  </button>
  <div class="spacer"></div>
  <button class="btn-ghost" onclick={() => (app.page = app.page === "methods" ? "" : "methods")}><Icon name="info" size={15} /><span>{app.page === "methods" ? "Back to the data" : "Methods"}</span></button>
  <button class="btn-ghost" onclick={() => theme.cycle()} aria-label="Theme: {themeName}" title="Theme: {themeName} (click to change)"><Icon name={themeIcon} size={15} /></button>
</header>
