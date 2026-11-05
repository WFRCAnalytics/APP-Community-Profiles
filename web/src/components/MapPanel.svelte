<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "../lib/app.svelte";
  import { geojson, indicatorValues } from "../lib/data";
  import { FORMATS } from "../lib/format";
  import { INDICATORS, BY_ID } from "../lib/indicators";
  import { COMPARED, MapController, SELECTED, type Legend } from "../lib/map";
  import { theme } from "../lib/theme.svelte";

  let el: HTMLDivElement | undefined = $state();
  let controller = $state.raw<MapController>();
  let legend = $state.raw<Legend | null>(null);
  let layer = $state<"areas" | "tracts">("areas");
  let indicatorId = $state("median_income");
  let failed = $state("");
  const indicator = $derived(BY_ID[indicatorId]);
  const mode = $derived(theme.resolved);

  onMount(() => {
    if (!el) return;
    try {
      const c = new MapController(el, theme.resolved);
      c.onLegend = (l) => (legend = l);
      controller = c;
      return () => c.destroy();
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
    }
  });

  $effect(() => { controller?.setMode(mode); });

  let token = 0;
  $effect(() => {
    const c = controller;
    if (!c || !app.ready || !app.selected) return;
    const ind = indicator, tracts = layer === "tracts", sel = app.selected, cmp = app.compare?.type === "state" ? undefined : app.compare;
    const type = tracts ? "tract" : sel.type, period = tracts ? app.latestVintage : app.v, db = app.db!;
    const mine = ++token;
    (async () => {
      const [values, shapes, selShapes, cmpShapes] = await Promise.all([
        indicatorValues(db, ind, null, period, type), geojson(type), geojson(sel.type), cmp ? geojson(cmp.type) : null,
      ]);
      if (mine !== token) return;
      const pick = (fc: any, id: string, role: string) => {
        const f = fc?.features.find((x: any) => x.properties.id === id);
        return f ? [{ ...f, properties: { ...f.properties, role } }] : [];
      };
      c.update({
        layer: tracts ? "tracts" : "areas",
        shapes,
        focus: { type: "FeatureCollection", features: [...pick(selShapes, sel.id, "sel"), ...(cmp ? pick(cmpShapes, cmp.id, "cmp") : [])] },
        values: new Map([...values].map(([id, v]) => [id, v.value])),
        names: tracts ? new Map([...values.keys()].map((id) => [id, `Census tract ${id.slice(5)}`])) : app.names,
        format: FORMATS[ind.format], label: ind.label,
        fitKey: `${sel.id}|${cmp?.id ?? ""}`,
        onSelect: tracts ? undefined : (id, shift) => (shift && id !== app.id ? (app.cmp = id) : app.select(id)),
      });
    })().catch((e) => console.error(e));
  });
</script>

<div class="map-wrap">
  <div class="map-canvas" bind:this={el} role="application" aria-label="Map of {app.typeInfo.plural}, coloured by {indicator.label}. Use the area picker for keyboard selection."></div>
  {#if failed}
    <div class="splash"><p class="error">The map could not start ({failed}). The charts and tables still work.</p></div>
  {/if}
  <div class="map-controls">
    <div class="pill-group" role="group" aria-label="Map layer">
      <button aria-pressed={layer === "areas"} onclick={() => (layer = "areas")}>{app.typeInfo.plural.replace(/^./, (c) => c.toUpperCase())}</button>
      <button aria-pressed={layer === "tracts"} onclick={() => (layer = "tracts")}>Census tracts</button>
    </div>
    <div class="map-select">
      <label for="map-ind">Colour by</label>
      <select id="map-ind" bind:value={indicatorId}>
        {#each INDICATORS.filter((i) => i.map) as i}<option value={i.id}>{i.label}</option>{/each}
      </select>
    </div>
  </div>
  {#if legend}
    <div class="map-legend" role="group" aria-label="Map legend">
      <div class="title">{legend.title}{layer === "tracts" ? ", latest period" : ""}</div>
      {#each legend.items as item}<div class="row"><span class="sw" style="background:{item.color}"></span>{item.text}</div>{/each}
      <hr />
      <div class="row"><span class="key-line" style="border-color:{SELECTED[mode]}"></span>Selected</div>
      {#if app.compare && app.compare.type !== "state"}<div class="row"><span class="key-line cmp" style="border-color:{COMPARED[mode]}"></span>Compared</div>{/if}
    </div>
  {/if}
  <p class="map-note">{layer === "tracts" ? "Tracts show the latest ACS period." : "Click an area to select it, Shift+click to compare."}</p>
</div>
