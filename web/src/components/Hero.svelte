<script lang="ts">
  // The chosen area: its silhouette inside Utah, its name, and a row of key figures.
  import { app } from "../lib/app.svelte";
  import { geojson, indicatorValues, lodesValues } from "../lib/data";
  import { FORMATS, fmtInt } from "../lib/format";
  import { BY_ID, TYPE_LABEL } from "../lib/indicators";
  import { silhouette } from "../lib/place";
  import Tile from "./Tile.svelte";

  const IDS = ["pop", "households", "median_income", "median_age", "median_value"];

  const mark = $derived.by(async () => {
    const sel = app.selected, cmp = app.compare;
    if (!sel) return null;
    const [state, shapes, others] = await Promise.all([geojson("state"), geojson(sel.type), cmp ? geojson(cmp.type) : null]);
    const one = (fc: any, id: string) => fc?.features.find((f: any) => f.properties.id === id) ?? null;
    return silhouette({ state: state.features[0], shape: one(shapes, sel.id), other: cmp && cmp.type !== "state" ? one(others, cmp.id) : null });
  });

  const figures = $derived.by(async () => {
    const refs = app.refs, v = app.v, year = app.lodesLatest, db = app.db!, sel = app.selected, cmp = app.compare;
    if (!sel) return [];
    const [maps, jobs] = await Promise.all([Promise.all(IDS.map((id) => indicatorValues(db, BY_ID[id], refs, v))), lodesValues(db, "wac", refs, year)]);
    const period = `${v - 4}–${v}`;
    const out = IDS.map((id, i) => {
      const ind = BY_ID[id], fmt = FORMATS[ind.format];
      const a = maps[i].get(sel.id), b = cmp ? maps[i].get(cmp.id) : null;
      return {
        label: ind.label,
        value: a?.value == null ? "–" : fmt(a.value) + (a.flag === "+" ? "+" : ""),
        meta: a?.moe != null ? `±${fmt(a.moe)}` : period,
        method: a?.value == null ? null : a.method,
        compare: cmp ? { label: cmp.label, value: b?.value == null ? "–" : fmt(b.value) } : null,
      };
    });
    out.push({
      label: "Jobs located here", value: fmtInt(jobs.get(`${sel.id}|C000`)), meta: `${year} LODES`, method: "aggregated",
      compare: cmp ? { label: cmp.label, value: fmtInt(jobs.get(`${cmp.id}|C000`)) } : null,
    });
    return out;
  });
</script>

<div class="hero">
  {#await mark then m}
    {#if m}
      <svg class="mark" viewBox="0 0 {m.width} {m.height}" aria-hidden="true" focusable="false">
        <path class="state" d={m.state} />
        {#if m.other}<path class="other" d={m.other} />{/if}
        {#if m.shape}<path class="shape" d={m.shape} />{/if}
        {#if m.ring}<circle class="ring" cx={m.ring.cx} cy={m.ring.cy} r="7" />{/if}
      </svg>
    {/if}
  {/await}
  <div>
    <h2 id="area-name">{app.selectedGeo?.geo_name}{#if app.selectedGeo?.kind && app.selectedGeo.kind !== "city"} ({app.selectedGeo.kind}){/if}</h2>
    <p>
      {TYPE_LABEL[app.type]}{#if app.selectedGeo?.organization}{" · "}{app.selectedGeo.organization}{/if}
      {#if app.compare}<br /><span class="vs"><i class="dot sel"></i>{app.selected?.label} <span aria-hidden="true">vs</span><span class="sr-only">compared with</span> <i class="dot cmp"></i>{app.compare.label}</span>{/if}
    </p>
  </div>
</div>

<div class="tiles" aria-label="Key figures">
  {#await figures}
    {#each Array(6) as _}<div class="tile"><div class="loading" style="height:72px"></div></div>{/each}
  {:then tiles}
    {#each tiles as t (t.label)}
      <Tile label={t.label} value={t.value} meta={t.meta} method={t.method} compare={t.compare} />
    {/each}
  {:catch e}
    <p class="error" role="alert">Could not load the key figures: {e instanceof Error ? e.message : e}</p>
  {/await}
</div>
