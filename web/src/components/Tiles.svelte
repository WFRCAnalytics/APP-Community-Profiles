<script lang="ts">
  // A row (or grid) of key figures for the selected area and the compared one, for the chosen year.
  import { app } from "../lib/app.svelte";
  import { indicatorValues, lodesValues } from "../lib/data";
  import { FORMATS, fmtInt, type Method } from "../lib/format";
  import { BY_ID } from "../lib/indicators";
  import Tile from "./Tile.svelte";

  let { ids, jobs = false, cols, style = "" }: { ids: string[]; jobs?: boolean; cols?: number; style?: string } = $props();

  interface T { label: string; value: string; meta: string; method: Method | null; compare: { label: string; value: string } | null }

  const tiles = $derived.by(async (): Promise<T[]> => {
    const refs = app.refs, v = app.v, db = app.db!, sel = app.selected, cmp = app.compare, year = Math.min(v, app.lodesLatest);
    if (!sel) return [];
    const [maps, wac] = await Promise.all([Promise.all(ids.map((id) => indicatorValues(db, BY_ID[id], refs, v))), jobs ? lodesValues(db, "wac", refs, year) : null]);
    const out = ids.map((id, i): T => {
      const ind = BY_ID[id], f = FORMATS[ind.format];
      const a = maps[i].get(sel.id), b = cmp ? maps[i].get(cmp.id) : null;
      return {
        label: ind.label, value: a?.value == null ? "–" : f(a.value) + (a.flag === "+" ? "+" : ""),
        meta: a?.moe != null ? `±${f(a.moe)}` : String(v), method: a?.value == null ? null : a.method,
        compare: cmp ? { label: cmp.label, value: b?.value == null ? "–" : f(b.value) } : null,
      };
    });
    if (wac) out.push({
      label: "Jobs located here", value: fmtInt(wac.get(`${sel.id}|C000`)), meta: `LODES8 ${year}`, method: "aggregated",
      compare: cmp ? { label: cmp.label, value: fmtInt(wac.get(`${cmp.id}|C000`)) } : null,
    });
    return out;
  });
  const n = $derived(ids.length + (jobs ? 1 : 0));
</script>

<div class="tiles" style="grid-template-columns:repeat({cols ?? n},minmax(0,1fr));{style}" aria-label="Key figures">
  {#await tiles}
    {#each Array(n) as _}<div class="tile"><div class="loading" style="height:72px"></div></div>{/each}
  {:then list}
    {#each list as t (t.label)}<Tile label={t.label} value={t.value} meta={t.meta} method={t.method} compare={t.compare} />{/each}
  {:catch e}
    <p class="error" role="alert">Could not load the key figures: {e instanceof Error ? e.message : e}</p>
  {/await}
</div>
