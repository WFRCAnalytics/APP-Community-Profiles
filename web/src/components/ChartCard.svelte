<script lang="ts" generics="T">
  // A panel with a title, a chart that fills it, a source line and an accessible table view of the same numbers. `load` runs
  // again whenever the app state it reads changes (area, comparison, year).
  import type { Snippet } from "svelte";
  import Chart from "./Chart.svelte";
  import DataTable, { type Column, type Row } from "./DataTable.svelte";
  import type { Palette } from "../lib/theme.svelte";
  import { slug, toCsv } from "../lib/format";

  interface Props {
    title: string;
    note?: string;
    load: () => Promise<T>;
    draw: (data: T, width: number, height: number, pal: Palette) => Element;
    table?: (data: T) => { columns: Column[]; rows: Row[]; groupKey?: string };
    isEmpty?: (data: T) => boolean;
    emptyText?: string;
    controls?: Snippet;
    style?: string;
  }
  let { title, note, load, draw, table, isEmpty = (d) => d == null || (Array.isArray(d) && d.length === 0), emptyText = "Not published for this area or year.", controls, style = "" }: Props = $props();

  const promise = $derived(load());
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
    {#await promise then data}
      {#if table && !isEmpty(data)}
        <div class="pn-actions">
          <button class="mini-btn" aria-pressed={view === "table"} onclick={() => (view = view === "table" ? "chart" : "table")}>{view === "table" ? "Chart" : "Table"}</button>
          {#if view === "table"}<button class="mini-btn" onclick={() => download(table(data))}>CSV</button>{/if}
        </div>
      {/if}
    {/await}
  </div>
  {#if controls}{@render controls()}{/if}
  {#await promise}
    <div class="pn-body"><div class="loading" aria-busy="true"></div></div>
  {:then data}
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
  {:catch e}
    <div class="pn-body"><div class="empty error" role="alert">Could not load this chart: {e instanceof Error ? e.message : e}</div></div>
  {/await}
</section>
