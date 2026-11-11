<script lang="ts">
  import { TABS, app } from "../lib/app.svelte";
  import Icon from "./Icon.svelte";

  function key(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === app.tab);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    app.go(TABS[(next + TABS.length) % TABS.length].id);
    document.getElementById(`tab-${app.tab}`)?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav class="rail" data-tour="rail" aria-label="Sections" onkeydown={key}>
  <div role="tablist" aria-orientation="vertical" style="display:contents">
    {#each TABS as t}
      <button class="tip" role="tab" id="tab-{t.id}" data-tip={t.label} aria-label={t.label} aria-selected={app.tab === t.id} aria-current={app.tab === t.id ? "page" : undefined} tabindex={app.tab === t.id ? 0 : -1} onclick={() => app.go(t.id)}>
        <Icon name={t.icon} size={20} />
      </button>
    {/each}
  </div>
</nav>
