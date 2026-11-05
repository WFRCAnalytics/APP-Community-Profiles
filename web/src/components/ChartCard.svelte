<script lang="ts" generics="T">
  // A panel with a title, a chart that fills it, a source line and an accessible table view of the same numbers. `load` runs
  // again whenever the app state it reads changes (area, comparison, year).
  import type { Snippet } from "svelte";
  import Chart from "./Chart.svelte";
  import DataTable, { type Column, type Row } from "./DataTable.svelte";
  import type { Palette } from "../lib/theme.svelte";
  import { slug, toCsv } from "../lib/format";
  import { easeInOut, lerp } from "../lib/tween";

  interface Props {
    title: string;
    note?: string;
    load: () => Promise<T>;
    draw: (data: T, width: number, height: number, pal: Palette) => Element;
    table?: (data: T) => { columns: Column[]; rows: Row[]; groupKey?: string };
    isEmpty?: (data: T) => boolean;
    emptyText?: string;
    controls?: Snippet;
    headerExtra?: Snippet;
    style?: string;
  }
  let { title, note, load, draw, table, isEmpty = (d) => d == null || (Array.isArray(d) && d.length === 0), emptyText = "Not published for this area or year.", controls, headerExtra, style = "" }: Props = $props();

  const promise = $derived(load());

  // What is on screen. A new year or area does not blank the panel: the old picture stays until the new data arrives, then the
  // numbers glide to it (bars grow, rings turn) instead of the chart being redrawn from nothing.
  let shown = $state.raw<{ data: T } | null>(null);
  let failed = $state.raw<string | null>(null);
  let frame = 0;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  $effect(() => {
    const p = promise;
    let live = true;
    p.then((next) => {
      if (!live) return;
      failed = null;
      cancelAnimationFrame(frame);
      const from = shown?.data;
      if (from === undefined || still || isEmpty(from) || isEmpty(next)) { shown = { data: next }; return; }
      const t0 = performance.now(), span = 520;
      let last = 0;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / span);
        if (t === 1) { shown = { data: next }; return; }
        if (now - last >= 40) { shown = { data: lerp(from, next, easeInOut(t)) }; last = now; }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }).catch((e) => { if (live) failed = e instanceof Error ? e.message : String(e); });
    return () => { live = false; };
  });
  let view = $state<"chart" | "table">("chart");

  function download(t: { columns: Column[]; rows: Row[] }) {
    const body = toCsv(t.rows, t.columns.map((c) => c.key)).split("\n").slice(1);
    const url = URL.createObjectURL(new Blob([[t.columns.map((c) => c.label).join(","), ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="pn" aria-label={title} {style}>
  <div class="pn-head">
    <h3>{title}</h3>
    {#if shown && table && !isEmpty(shown.data)}
      <div class="pn-actions">
        {#if headerExtra && view === "chart"}{@render headerExtra()}{/if}
        <button class="mini-btn" aria-pressed={view === "table"} onclick={() => (view = view === "table" ? "chart" : "table")}>{view === "table" ? "Chart" : "Table"}</button>
        {#if view === "table"}<button class="mini-btn" onclick={() => download(table(shown!.data))}>CSV</button>{/if}
      </div>
    {/if}
  </div>
  {#if controls}{@render controls()}{/if}
  {#if failed}
    <div class="pn-body"><div class="empty error" role="alert">Could not load this chart: {failed}</div></div>
  {:else if !shown}
    <div class="pn-body"><div class="loading" aria-busy="true"></div></div>
  {:else}
    {@const data = shown.data}
    <div class="pn-body">
      {#if isEmpty(data)}
        <div class="empty">{emptyText}</div>
      {:else if view === "table" && table}
        {@const t = table(data)}
        <DataTable columns={t.columns} rows={t.rows} groupKey={t.groupKey ?? null} caption={title} />
      {:else}
        <Chart label={title} draw={(w, h, pal) => draw(data, w, h, pal)} />
      {/if}
    </div>
    {#if note && !isEmpty(data)}<p class="src">{note}</p>{/if}
  {/if}
</section>
