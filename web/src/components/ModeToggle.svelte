<script lang="ts">
  // A small two-way switch in a panel header, for charts that can be drawn more than one way (donut or bars).
  let { value = $bindable(), options, label = "Chart type" }: { value: string; options: { id: string; label: string }[]; label?: string } = $props();
</script>

<div class="mode" role="group" aria-label={label}>
  {#each options as o}<button aria-pressed={value === o.id} onclick={() => (value = o.id)}>{o.label}</button>{/each}
</div>

<style>
  .mode { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .mode button { border: 0; background: transparent; color: var(--muted); font-size: 0.72rem; padding: 2px 8px; }
  .mode button[aria-pressed="true"] { background: var(--surface-2); color: var(--text); font-weight: 600; }
  .mode button:hover { color: var(--text); }
</style>
