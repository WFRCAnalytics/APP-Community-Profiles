<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { GEO_TYPES, type GeoType } from "../lib/indicators";

  const choices = $derived(app.geos.filter((g) => g.geo_type === app.type));
  const label = (g: { geo_name: string; kind: string | null; geo_type: string }) => g.geo_name + (g.kind && g.kind !== "city" ? ` (${g.kind})` : "");
  // Benchmarks first, then the areas of the same kind, never the selected area itself.
  const compareChoices = $derived.by(() => {
    const first = ["49", "aog-wfrc"].map((id) => app.byId.get(id)).filter((g) => !!g);
    const all = [...first, ...choices].filter((g, i, xs) => g.geo_id !== app.id && xs.findIndex((x) => x.geo_id === g.geo_id) === i);
    return all.map((g) => ({ id: g.geo_id, label: g.geo_type === "state" ? "Utah (state)" : g.geo_id === "aog-wfrc" ? "WFRC region (AOG)" : label(g) }));
  });
</script>

<div class="toolbar" role="group" aria-label="Choose areas and period">
  <div class="field sel">
    <label for="f-type">Kind of area</label>
    <select id="f-type" value={app.type} onchange={(e) => app.setType(e.currentTarget.value as GeoType)}>
      {#each GEO_TYPES as t}<option value={t.id}>{t.label}</option>{/each}
    </select>
  </div>
  <div class="field sel">
    <label for="f-area">Area</label>
    <select id="f-area" value={app.id} onchange={(e) => app.select(e.currentTarget.value)}>
      {#each choices as g}<option value={g.geo_id}>{label(g)}</option>{/each}
    </select>
  </div>
  <div class="field cmp">
    <label for="f-cmp">Compare with</label>
    <select id="f-cmp" value={app.cmp} onchange={(e) => (app.cmp = e.currentTarget.value)}>
      <option value="">None</option>
      {#each compareChoices as c}<option value={c.id}>{c.label}</option>{/each}
    </select>
  </div>
  <div class="field">
    <label for="f-period">ACS 5-year period</label>
    <select id="f-period" value={app.v} onchange={(e) => (app.v = +e.currentTarget.value)}>
      {#each app.periods as v}<option value={v}>{v - 4}–{v}</option>{/each}
    </select>
  </div>
</div>
