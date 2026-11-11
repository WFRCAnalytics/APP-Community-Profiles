<script lang="ts">
  // The topic strip under a tab's key figures. The chosen topic lives in the address (`sub`), so a view can be shared; an unknown
  // or empty value falls back to the first.
  import { app } from "../lib/app.svelte";

  let { items, active = $bindable() }: { items: { id: string; label: string; icon?: string }[]; active?: string } = $props();
  const current = $derived(items.some((i) => i.id === app.sub) ? app.sub : items[0].id);
  $effect(() => { active = current; });

  function key(e: KeyboardEvent) {
    const i = items.findIndex((t) => t.id === current);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    app.sub = items[(next + items.length) % items.length].id;
    document.getElementById(`sub-${app.sub}`)?.focus();
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="subtabs" data-tour="subtabs" role="tablist" aria-label="Topics" tabindex="-1" onkeydown={key}>
  {#each items as t}
    <button role="tab" id="sub-{t.id}" aria-selected={current === t.id} tabindex={current === t.id ? 0 : -1} onclick={() => (app.sub = t.id)}>{t.label}</button>
  {/each}
</div>

<style>
  .subtabs { width: fit-content; max-width: 100%; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex: none; padding: 1px; }
  button { border: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: 0.78rem; font-weight: 500; line-height: 1; padding: 6px 11px; border-radius: 7px; white-space: nowrap; cursor: pointer; transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
  button:hover { color: var(--text); background: var(--surface-2); }
  button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
