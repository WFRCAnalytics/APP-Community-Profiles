<script lang="ts">
  import { onMount } from "svelte";
  import { openDb, type Db } from "./lib/db";
  import { acsVintages, indicatorValues, registry, type Geography, type IndicatorValue } from "./lib/data";
  import { FORMATS, METHODS } from "./lib/format";
  import { BY_ID, GEO_TYPES } from "./lib/indicators";

  const TILES = ["pop", "households", "median_income", "median_age", "median_rent", "median_value"];

  let db = $state.raw<Db>();
  let areas = $state<Geography[]>([]);
  let vintage = $state(0);
  let type = $state("aog");
  let id = $state("");
  let values = $state<Record<string, IndicatorValue>>({});
  let error = $state("");

  const choices = $derived(areas.filter((a) => a.geo_type === type));
  const selected = $derived(areas.find((a) => a.geo_id === id));

  onMount(async () => {
    try {
      db = await openDb();
      areas = await registry(db);
      vintage = Math.max(...(await acsVintages(db)));
      id = areas.find((a) => a.geo_type === type)?.geo_id ?? "";
    } catch (e) {
      error = String(e);
    }
  });

  $effect(() => {
    if (!db || !id) return;
    const ref = { type, id };
    Promise.all(TILES.map((t) => indicatorValues(db!, BY_ID[t], [ref], vintage))).then((maps) => {
      values = Object.fromEntries(TILES.map((t, i) => [t, maps[i].get(id)!]).filter(([, v]) => v));
    });
  });

  function setType(next: string) {
    type = next;
    id = areas.find((a) => a.geo_type === next)?.geo_id ?? "";
  }
</script>

<main>
  <h1>WFRC Community Profiles</h1>
  {#if error}
    <p role="alert">{error}</p>
  {:else if !areas.length}
    <p>Loading…</p>
  {:else}
    <label>Type
      <select value={type} onchange={(e) => setType(e.currentTarget.value)}>
        {#each GEO_TYPES as t}<option value={t.id}>{t.label}</option>{/each}
      </select>
    </label>
    <label>Area
      <select bind:value={id}>
        {#each choices as a}<option value={a.geo_id}>{a.geo_name}</option>{/each}
      </select>
    </label>
    <h2>{selected?.geo_name} · ACS {vintage - 4}–{vintage}</h2>
    <dl>
      {#each TILES as t}
        {@const ind = BY_ID[t]}
        {@const v = values[t]}
        <div>
          <dt>{ind.label}</dt>
          <dd>{v ? FORMATS[ind.format](v.value) : "–"} {#if v}<small title={METHODS[v.method].note}>{METHODS[v.method].short}</small>{/if}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</main>
