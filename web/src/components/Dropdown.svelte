<script lang="ts">
  // A listbox styled like the area picker, for choices inside a panel (the native select list cannot be styled). Opens upward
  // when it sits low in a panel.
  let { value = $bindable(), options, label, up = true }: { value: string; options: { id: string; label: string }[]; label: string; up?: boolean } = $props();
  let open = $state(false);
  let active = $state(0);
  let root: HTMLDivElement | undefined = $state();
  const current = $derived(options.find((o) => o.id === value));

  function toggle() { open = !open; if (open) active = Math.max(0, options.findIndex((o) => o.id === value)); }
  function pick(id: string) { value = id; open = false; }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") { open = false; }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { toggle(); return; }
      active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
    } else if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); pick(options[active].id); }
  }
  $effect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (root && !root.contains(e.target as Node)) open = false; };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  });
  $effect(() => { if (open) root?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); });
</script>

<div class="dd" bind:this={root}>
  <button type="button" class="face" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onclick={toggle} onkeydown={key}>
    <span class="txt">{current?.label ?? "Choose"}</span>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  </button>
  {#if open}
    <ul class="list" class:down={!up} role="listbox" aria-label={label}>
      {#each options as o, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li role="option" data-i={i} aria-selected={o.id === value} class:act={i === active} onclick={() => pick(o.id)} onpointermove={() => (active = i)}>{o.label}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dd { position: relative; flex: 1; min-width: 0; }
  .face { width: 100%; display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: var(--r-ctl); padding: 4px 8px; font-size: 0.75rem; font-weight: 600; cursor: pointer; text-align: left; }
  .face:hover { border-color: var(--muted); }
  .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list { position: absolute; left: 0; right: -8px; bottom: calc(100% + 6px); z-index: 10; margin: 0; padding: 4px; list-style: none; max-height: 220px; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }
  .list.down { bottom: auto; top: calc(100% + 6px); }
  li { padding: 6px 9px; border-radius: 8px; font-size: 0.78rem; color: var(--text); cursor: pointer; }
  li.act { background: var(--surface-2); }
  li[aria-selected="true"] { font-weight: 700; color: var(--sel-text); }
</style>
