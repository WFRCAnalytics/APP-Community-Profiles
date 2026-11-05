<script lang="ts">
  // The area being shown, the area it is compared with, and the year (with Play).
  import { onDestroy } from "svelte";
  import { app } from "../lib/app.svelte";
  import { geojson } from "../lib/data";
  import { TYPE_LABEL } from "../lib/indicators";
  import { silhouette } from "../lib/place";
  import Icon from "./Icon.svelte";

  const mark = $derived.by(async () => {
    const sel = app.selected, cmp = app.compare;
    if (!sel) return null;
    const [state, shapes, others] = await Promise.all([geojson("state"), geojson(sel.type), cmp ? geojson(cmp.type) : null]);
    const one = (fc: any, id: string) => fc?.features.find((f: any) => f.properties.id === id) ?? null;
    return silhouette({ state: state.features[0], shape: one(shapes, sel.id), other: cmp && cmp.type !== "state" ? one(others, cmp.id) : null, width: 34, height: 44 });
  });

  const first = $derived(app.years[0] ?? 2009);
  const last = $derived(app.years.at(-1) ?? 2024);
  let playing = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  function stop() { clearInterval(timer); playing = false; }
  function toggle() {
    if (playing) return stop();
    playing = true;
    if (app.v >= last) app.v = first;
    timer = setInterval(() => { if (app.v >= last) stop(); else app.v += 1; }, 900);
  }
  onDestroy(stop);
  const ticks = $derived([0, 1, 2, 3, 4, 5].map((i) => Math.round(first + ((last - first) * i) / 5)));
</script>

<div class="card ctx">
  {#await mark then m}
    {#if m}
      <svg class="mark" class:solo={!app.compare} viewBox="0 0 {m.width} {m.height}" aria-hidden="true" focusable="false">
        <path class="state" d={m.state} />
        {#if m.other}<path class="other" d={m.other} />{/if}
        {#if m.shape}<path class="shape" d={m.shape} />{/if}
        {#if m.ring}<circle class="ring" cx={m.ring.cx} cy={m.ring.cy} r="5" />{/if}
      </svg>
    {/if}
  {/await}
  <div>
    <h2 style="font:700 1.25rem/1.1 var(--f-display)">{app.selected?.label}</h2>
    <div class="sub">{app.selectedGeo ? TYPE_LABEL[app.selectedGeo.geo_type] : ""}{#if app.selectedGeo?.organization}{" · "}{app.selectedGeo.organization}{/if}</div>
  </div>
  {#if app.compare}
    <span class="cmp-pill"><i class="dot cmp"></i>Compared with <b>{app.compare.label}</b>
      <button onclick={() => (app.picker = "compare")} aria-label="Change the area to compare with"><Icon name="chevron" size={14} /></button>
      <button onclick={() => app.setCompare("")} aria-label="Stop comparing"><Icon name="x" size={14} /></button>
    </span>
  {:else}
    <button class="cmp-pill" onclick={() => (app.picker = "compare")}><Icon name="plus" size={14} />Compare with another area</button>
  {/if}
  <div style="flex:1"></div>
  <button class="play" onclick={toggle}><Icon name={playing ? "pause" : "play"} size={14} />{playing ? "Pause" : "Play"}</button>
  <div class="year">
    <div class="row"><label for="year">Year</label><output for="year">{app.v}</output></div>
    <input id="year" type="range" min={first} max={last} step="1" value={app.v} oninput={(e) => (app.v = +e.currentTarget.value)} />
    <div class="ticks">{#each ticks as t}<span>{t}</span>{/each}</div>
  </div>
</div>
