<script lang="ts">
  // The map workspace card: a full-height map with its controls and legend laid over it. One variable shades the map; a
  // second one makes it bivariate. Markers on the legend show where the selected and compared areas fall.
  import { onMount } from "svelte";
  import { app } from "../lib/app.svelte";
  import { BIVARIATE } from "../lib/classes";
  import { geojson, indicatorValues } from "../lib/data";
  import { FORMATS, fmtCompact, fmtPct, type FormatId } from "../lib/format";
  import { BY_ID, INDICATORS } from "../lib/indicators";
  import { MapController, type Legend } from "../lib/map";
  import { theme } from "../lib/theme.svelte";

  const FRONT: [[number, number], [number, number]] = [[-113.25, 39.55], [-110.85, 41.95]];
  const STATE: [[number, number], [number, number]] = [[-114.1, 36.95], [-108.95, 42.05]];

  let { compact = false }: { compact?: boolean } = $props();
  let el: HTMLDivElement | undefined = $state();
  let controller = $state.raw<MapController>();
  let legend = $state.raw<Legend | null>(null);
  let valuesX = $state.raw<Map<string, number | null>>(new Map());
  let valuesY = $state.raw<Map<string, number | null>>(new Map());
  let marks = $state.raw<{ sel: [number | null, number | null]; cmp: [number | null, number | null] }>({ sel: [null, null], cmp: [null, null] });
  let idX = $state("median_income");
  let idY = $state("");
  let layer = $state<"areas" | "tracts">("areas");
  let extent = $state<"front" | "state">("front");
  const indX = $derived(BY_ID[idX]);
  const indY = $derived(idY ? BY_ID[idY] : null);
  const mapInds = INDICATORS.filter((i) => i.map);
  const mode = $derived(theme.resolved);

  const tick = (v: number, f: FormatId, span: number) =>
    f === "money" ? (v >= 10000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v).toLocaleString("en-US")}`) : f === "pct" ? fmtPct(v, span < 0.1 ? 1 : 0) : f === "int" ? fmtCompact(v) : FORMATS[f](v);
  const fmtX = (v: number | null | undefined) => (v == null ? "no data" : FORMATS[indX.format](v));
  const shortName = (n: string) => n.replace(/ County$/, "");

  onMount(() => {
    if (!el) return;
    const c = new MapController(el, theme.resolved);
    c.onLegend = (l) => (legend = l);
    controller = c;
    return () => c.destroy();
  });
  $effect(() => { controller?.setMode(mode); });

  let token = 0;
  $effect(() => {
    const c = controller;
    if (!c || !app.ready || !app.selected) return;
    const x = indX, y = indY, tracts = layer === "tracts", sel = app.selected, cmp = app.compare, ext = extent;
    const type = tracts ? "tract" : sel.type, period = tracts ? app.latestVintage : app.v, db = app.db!;
    const mine = ++token;
    (async () => {
      const [vx, vy, vmx, vmy, shapes, selShapes, cmpShapes] = await Promise.all([
        indicatorValues(db, x, null, period, type), y ? indicatorValues(db, y, null, period, type) : null,
        indicatorValues(db, x, app.refs, period), y ? indicatorValues(db, y, app.refs, period) : null,
        geojson(type), geojson(sel.type), cmp ? geojson(cmp.type) : null,
      ]);
      if (mine !== token) return;
      const named = {
        ...shapes,
        features: shapes.features.map((f: any) => ({ ...f, properties: { ...f.properties, name: shortName(app.names.get(f.properties.id) ?? "") } })),
      };
      const pick = (fc: any, id: string, role: string) => {
        const f = fc?.features.find((q: any) => q.properties.id === id);
        return f ? [{ ...f, properties: { ...f.properties, role } }] : [];
      };
      const px = new Map([...vx].map(([id, v]) => [id, v.value])), py = vy ? new Map([...vy].map(([id, v]) => [id, v.value])) : undefined;
      valuesX = px;
      valuesY = py ?? new Map();
      marks = {
        sel: [vmx.get(sel.id)?.value ?? null, vmy?.get(sel.id)?.value ?? null],
        cmp: cmp ? [vmx.get(cmp.id)?.value ?? null, vmy?.get(cmp.id)?.value ?? null] : [null, null],
      };
      c.update({
        layer: tracts ? "tracts" : "areas",
        shapes: named,
        focus: { type: "FeatureCollection", features: [...pick(selShapes, sel.id, "sel"), ...(cmp && cmp.type !== "state" ? pick(cmpShapes, cmp.id, "cmp") : [])] },
        values: px, values2: py,
        names: tracts ? new Map([...vx.keys()].map((id) => [id, `Census tract ${id.slice(5)}`])) : app.names,
        format: FORMATS[x.format], label: y ? `${x.label} and ${y.label}` : x.label,
        bounds: ext === "front" ? FRONT : STATE,
        fitKey: `${ext}|${type}`,
        onSelect: tracts ? undefined : (id, shift) => (shift && id !== app.id ? (app.cmp = id) : app.select(id)),
      });
    })().catch((e) => console.error(e));
  });

  // Position of a value along the single-variable scale, in percent.
  function pos(v: number | null | undefined): number | null {
    if (v == null || !legend || legend.bi) return null;
    const e = legend.edges, n = legend.colors.length;
    if (n === 1) return 50;
    for (let i = 0; i < n; i++) if (v <= e[i + 1] || i === n - 1) return ((i + Math.min(1, Math.max(0, (v - e[i]) / (e[i + 1] - e[i] || 1)))) / n) * 100;
    return null;
  }
  // Which cell of the three-by-three legend a pair of values falls in.
  function cell(a: number | null, b: number | null): [number, number] | null {
    if (a == null || b == null || !legend?.bi) return null;
    const k = (v: number, cuts: number[]) => Math.min(2, cuts.filter((c) => v >= c).length);
    return [2 - k(b, legend.bi.cutsB), k(a, legend.bi.cutsA)];
  }
  const selCell = $derived(cell(marks.sel[0], marks.sel[1]));
  const cmpCell = $derived(cell(marks.cmp[0], marks.cmp[1]));
  const span = $derived(legend ? legend.edges[legend.edges.length - 1] - legend.edges[0] : 0);
</script>

<div class="mapcard">
  <div class="canvas" bind:this={el} role="application" aria-label="Map of {app.typeInfo.plural}, shaded by {indX.label}{indY ? ` and ${indY.label}` : ''}. Use the search to pick an area with the keyboard."></div>

  {#if !compact}
  <div class="top">
    <div class="pill wide"><span>Colour by</span>
      <select bind:value={idX} aria-label="Colour the map by">{#each mapInds as i}<option value={i.id}>{i.label}</option>{/each}</select></div>
    <div class="row2">
      <div class="pill wide"><span>and</span>
        <select bind:value={idY} aria-label="Add a second variable for a bivariate map">
          <option value="">add a second variable</option>
          {#each mapInds.filter((i) => i.id !== idX) as i}<option value={i.id}>{i.label}</option>{/each}
        </select></div>
      <div class="pill seg" role="group" aria-label="Map layer">
        <button aria-pressed={layer === "areas"} onclick={() => (layer = "areas")}>{app.typeInfo.plural.replace(/^./, (c) => c.toUpperCase())}</button>
        <button aria-pressed={layer === "tracts"} onclick={() => (layer = "tracts")}>Tracts</button>
      </div>
    </div>
  </div>
  <button class="pill btn zoomer" onclick={() => (extent = extent === "front" ? "state" : "front")}>{extent === "front" ? "Show all of Utah" : "Zoom to Wasatch Front"}</button>
  {/if}

  {#if legend && !compact}
    <div class="maplegend" aria-live="polite">
      {#if legend.bi}
        <div class="bi">
          <div class="grid">
            {#each legend.bi.rows as row, r}{#each row as colour, c}
              <i style="background:{colour}" class:sel={selCell?.[0] === r && selCell?.[1] === c} class:cmp={cmpCell?.[0] === r && cmpCell?.[1] === c}></i>
            {/each}{/each}
          </div>
          <span class="ax y">{indY?.label} →</span>
          <span class="ax x">{indX.label} →</span>
        </div>
      {:else}
        <div class="title">{legend.title}{layer === "tracts" ? ", latest period" : ""}</div>
        <div class="scale">
          {#if pos(marks.sel[0]) != null}<span class="mk sel" style="left:{pos(marks.sel[0])}%"></span>{/if}
          {#if pos(marks.cmp[0]) != null}<span class="mk cmp" style="left:{pos(marks.cmp[0])}%"></span>{/if}
          <div class="bar">{#each legend.colors as c}<i style="background:{c}"></i>{/each}</div>
          <div class="ends"><span>{tick(legend.edges[0], indX.format, span)}</span><span>{tick(legend.edges[legend.edges.length - 1], indX.format, span)}</span></div>
        </div>
      {/if}
      {#if layer === "areas" && app.selected}
        <div class="read">
          <div><i class="dot sel"></i><span>{app.selected.label}</span><b>{fmtX(marks.sel[0])}</b></div>
          {#if app.compare}<div><i class="dot cmp"></i><span>{app.compare.label}</span><b>{fmtX(marks.cmp[0])}</b></div>{/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mapcard { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; background: var(--raised); }
  .canvas { position: absolute; inset: 0; }
  .top { position: absolute; left: 10px; width: min(430px, calc(100% - 20px)); top: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 3; }
  .row2 { display: flex; gap: 6px; align-items: center; }
  .wide { flex: 1; min-width: 0; }
  .wide select { flex: 1; min-width: 0; max-width: none; }
  .zoomer { position: absolute; right: 10px; bottom: 76px; z-index: 3; }
  .pill { display: flex; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 99px; box-shadow: var(--shadow); overflow: hidden; }
  .pill span { font-size: 0.72rem; color: var(--muted); padding-left: 12px; white-space: nowrap; }
  .pill select { border: 0; background: transparent; padding: 7px 22px 7px 6px; font-size: 0.78rem; font-weight: 600; color: var(--text); cursor: pointer; text-overflow: ellipsis; }
  .pill select option { background: var(--surface); color: var(--text); }
  .btn { padding: 7px 12px; font-size: 0.78rem; font-weight: 600; color: var(--text); cursor: pointer; }
  .seg button { border: 0; background: transparent; padding: 7px 12px; font-size: 0.78rem; font-weight: 600; color: var(--muted); cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); }
  .maplegend { position: absolute; left: 10px; bottom: 28px; width: 214px; z-index: 3; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); padding: 10px 12px; font-size: 0.75rem; color: var(--muted); }
  .title { font-weight: 600; color: var(--text); font-size: 0.78rem; margin-bottom: 6px; line-height: 1.25; }
  .scale { position: relative; padding-top: 9px; }
  .bar { display: flex; gap: 2px; }
  .bar i { flex: 1; height: 9px; border-radius: 3px; border: 1px solid var(--border); }
  .ends { display: flex; justify-content: space-between; margin-top: 3px; font-size: 0.68rem; font-variant-numeric: tabular-nums; }
  .mk { position: absolute; top: 0; width: 0; height: 0; translate: -5px 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid; }
  .mk.sel { border-top-color: var(--sel); }
  .mk.cmp { border-top-color: var(--cmp); }
  .read { margin-top: 8px; display: grid; gap: 2px; }
  .read div { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .read span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .read b { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; padding-left: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .dot.sel { background: var(--sel); }
  .dot.cmp { background: var(--cmp); }
  .bi { position: relative; padding: 0 0 16px 16px; display: inline-block; }
  .grid { display: grid; grid-template-columns: repeat(3, 26px); grid-template-rows: repeat(3, 26px); gap: 2px; }
  .grid i { border-radius: 3px; }
  .grid i.sel { outline: 2px solid var(--sel); outline-offset: 1px; }
  .grid i.cmp { outline: 2px dashed var(--cmp); outline-offset: 1px; }
  .ax { position: absolute; font-size: 0.66rem; white-space: nowrap; }
  .ax.x { left: 16px; bottom: 0; }
  .ax.y { left: 0; bottom: 16px; transform-origin: left bottom; transform: rotate(-90deg) translateX(0); }
</style>
