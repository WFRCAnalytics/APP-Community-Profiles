<script lang="ts">
  // A row (or grid) of key figures for the selected area and the compared one, for the chosen year.
  import { app } from "../lib/app.svelte";
  import { indicatorSeries, indicatorValues, lodesValues } from "../lib/data";
  import { FORMATS, fmtInt, type Method } from "../lib/format";
  import { BY_ID } from "../lib/indicators";
  import Tile from "./Tile.svelte";

  let { ids, jobs = false, cols, style = "" }: { ids: string[]; jobs?: boolean; cols?: number; style?: string } = $props();

  interface T { label: string; value: string; meta: string; spark?: { x: number; y: number }[]; method: Method | null; compare: { label: string; value: string } | null }

  const tiles = $derived.by(async (): Promise<T[]> => {
    const refs = app.refs, v = app.v, db = app.db!, sel = app.selected, cmp = app.compare, year = Math.min(v, app.lodesLatest);
    if (!sel) return [];
    const years = new Set(app.years);
    const [maps, wac, rac, hist] = await Promise.all([
      Promise.all(ids.map((id) => indicatorValues(db, BY_ID[id], refs, v))),
      jobs ? lodesValues(db, "wac", refs, year) : null,
      jobs ? lodesValues(db, "rac", refs, year) : null,
      Promise.all(ids.map((id) => indicatorSeries(db, BY_ID[id], [sel]).catch(() => []))),
    ]);
    const out = ids.map((id, i): T => {
      const ind = BY_ID[id], f = FORMATS[ind.format];
      const a = maps[i].get(sel.id), b = cmp ? maps[i].get(cmp.id) : null;
      return {
        label: ind.label, value: a?.value == null ? "–" : f(a.value) + (a.flag === "+" ? "+" : ""),
        meta: a?.moe != null ? `±${f(a.moe)}` : String(v), method: a?.value == null ? null : a.method,
        spark: hist[i].filter((p) => years.has(p.vintage) && p.vintage <= v).map((p) => ({ x: p.vintage, y: p.value! })),
        compare: cmp ? { label: cmp.label, value: b?.value == null ? "–" : f(b.value) } : null,
      };
    });
    if (wac) out.push({
      label: "Jobs located here", value: fmtInt(wac.get(`${sel.id}|C000`)), meta: `LODES8 ${year}`, method: "aggregated",
      compare: cmp ? { label: cmp.label, value: fmtInt(wac.get(`${cmp.id}|C000`)) } : null,
    });
    if (rac) {
      const w = (id: string) => rac.get(`${id}|C000`) ?? 0, j = (id: string) => wac?.get(`${id}|C000`) ?? 0;
      out.push({ label: "Workers who live here", value: fmtInt(w(sel.id)), meta: `LODES8 ${year}`, method: "aggregated", compare: cmp ? { label: cmp.label, value: fmtInt(w(cmp.id)) } : null });
      out.push({ label: "Jobs per resident worker", value: w(sel.id) ? (j(sel.id) / w(sel.id)).toFixed(2) : "–", meta: `LODES8 ${year}`, method: "derived", compare: cmp ? { label: cmp.label, value: w(cmp.id) ? (j(cmp.id) / w(cmp.id)).toFixed(2) : "–" } : null });
    }
    return out;
  });
  // Keep the figures on screen while the next year loads, so Play does not flash a skeleton on every step.
  let list = $state.raw<T[] | null>(null);
  let failed = $state("");
  $effect(() => {
    const p = tiles;
    let live = true;
    p.then((l) => { if (live) { list = l; failed = ""; } }).catch((e) => { if (live) failed = e instanceof Error ? e.message : String(e); });
    return () => { live = false; };
  });
  const n = $derived(ids.length + (jobs ? 3 : 0));
</script>

<div class="tiles" style="grid-template-columns:repeat({cols ?? n},minmax(0,1fr));{style}" aria-label="Key figures">
  {#if failed}
    <p class="error" role="alert">Could not load the key figures: {failed}</p>
  {:else if !list}
    {#each Array(n) as _}<div class="tile"><div class="loading" style="height:72px"></div></div>{/each}
  {:else}
    {#each list as t (t.label)}<Tile label={t.label} value={t.value} meta={t.meta} method={t.method} compare={t.compare} spark={t.spark} />{/each}
  {/if}
</div>
