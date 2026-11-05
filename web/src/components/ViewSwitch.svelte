<script lang="ts">
  // The two-icon switch in a panel header: the chosen year (bars) or the history (line). Only panels with a useful history show it.
  import Icon from "./Icon.svelte";
  let { value = $bindable() }: { value: "snapshot" | "trend" } = $props();
</script>

<div class="vs" role="group" aria-label="View">
  <button aria-pressed={value === "snapshot"} title="Snapshot: the chosen year" aria-label="Snapshot" onclick={() => (value = "snapshot")}><Icon name="chart-bars" size={14} /></button>
  <button aria-pressed={value === "trend"} title="Trend: every year" aria-label="Trend" onclick={() => (value = "trend")}><Icon name="chart-line" size={14} /></button>
</div>

<style>
  .vs { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  button { border: 0; background: transparent; color: var(--muted); padding: 3px 7px; display: grid; place-items: center; cursor: pointer; }
  button + button { border-left: 1px solid var(--border); }
  button:hover { color: var(--text); }
  button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
</style>
