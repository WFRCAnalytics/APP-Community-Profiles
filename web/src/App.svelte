<script lang="ts">
  import { onMount } from "svelte";
  import Header from "./components/Header.svelte";
  import MapPanel from "./components/MapPanel.svelte";
  import Methods from "./components/Methods.svelte";
  import Panel from "./components/Panel.svelte";
  import { app } from "./lib/app.svelte";

  const W_KEY = "wfrc-profiles-panel";
  const stored = () => { try { return Number(localStorage.getItem(W_KEY)) || 0; } catch { return 0; } };
  let panelW = $state(stored() || 560);
  let sheetH = $state(0); // px; 0 means the CSS default
  let dragging = $state(false);
  let main: HTMLElement | undefined = $state();

  onMount(() => { app.init(); });

  // Keep the address bar in step with the chosen area, comparison, period and tab.
  $effect(() => {
    if (!app.ready) return;
    app.type; app.id; app.cmp; app.v; app.tab; app.page;
    app.writeHash();
  });
  $effect(() => { document.title = app.selected ? `${app.selected.label} · WFRC Community Profiles` : "WFRC Community Profiles"; });

  const clampW = (w: number) => Math.round(Math.min(Math.max(w, 380), Math.min(940, window.innerWidth * 0.7)));

  function dragWidth(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    const move = (ev: PointerEvent) => { panelW = clampW(window.innerWidth - ev.clientX); };
    const up = () => {
      dragging = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem(W_KEY, String(panelW)); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function resizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") panelW = clampW(panelW + step);
    else if (e.key === "ArrowRight") panelW = clampW(panelW - step);
    else return;
    e.preventDefault();
  }

  // Bottom sheet on narrow screens: drag the grip, or tap it to step between three heights.
  function dragSheet(e: PointerEvent) {
    const host = main?.clientHeight ?? window.innerHeight;
    const start = e.clientY, from = sheetH || host * 0.46;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - start) > 4) moved = true;
      sheetH = Math.min(host * 0.92, Math.max(host * 0.16, from + (start - ev.clientY)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { const stops = [0.16, 0.46, 0.9].map((s) => s * host); sheetH = stops.find((s) => s > from + 20) ?? stops[0]; }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
</script>

<a class="skip" href="#tabpanel">Skip to the profile</a>
<div class="shell" style="--panel-w:{panelW}px;{sheetH ? `--sheet-h:${sheetH}px` : ''}">
  <Header />
  {#if app.error}
    <div class="splash"><p class="error" role="alert">The data could not be loaded: {app.error}</p></div>
  {:else if !app.ready}
    <div class="splash" role="status"><p>Loading the community profiles…</p></div>
  {:else}
    <main class="main" bind:this={main}>
      <MapPanel />
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="resizer" class:drag={dragging} role="separator" aria-orientation="vertical" aria-label="Resize the profile panel"
        aria-valuenow={panelW} aria-valuemin={380} aria-valuemax={940} tabindex="0" onpointerdown={dragWidth} onkeydown={resizeKey}
      ></div>
      <Panel onGrip={dragSheet} />
      {#if app.page === "methods"}<Methods />{/if}
    </main>
  {/if}
</div>
