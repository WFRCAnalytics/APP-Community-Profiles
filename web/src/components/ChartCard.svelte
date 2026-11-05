<script lang="ts" generics="T">
  // A card with a title, a chart, a note and an accessible table view of the same numbers. `load` runs again whenever the
  // app state it reads changes (area, comparison, period); the card is as tall as its content.
  import type { Snippet } from "svelte";
  import Chart from "./Chart.svelte";
  import DataTable, { type Column, type Row } from "./DataTable.svelte";
  import type { Palette } from "../lib/theme.svelte";
  import { slug, toCsv } from "../lib/format";

  interface Props {
    title: string;
    note?: string;
    load: () => Promise<T>;
    draw: (data: T, width: number, pal: Palette) => Element;
    table?: (data: T) => { columns: Column[]; rows: Row[]; groupKey?: string };
    isEmpty?: (data: T) => boolean;
    emptyText?: string;
    controls?: Snippet;
  }
  let { title, note, load, draw, table, isEmpty = (d) => d == null || (Array.isArray(d) && d.length === 0), emptyText = "Not published for this area or period.", controls }: Props = $props();

  const promise = $derived(load());
  let view = $state<"chart" | "table">("chart");

  function download(t: { columns: Column[]; rows: Row[] }) {
    const csv = toCsv(t.rows, t.columns.map((c) => c.key));
    const head = t.columns.map((c) => c.label).join(",");
    const url = URL.createObjectURL(new Blob([[head, ...csv.split("\n").slice(1)].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="card" aria-label={title}>
  <div class="card-head">
    <h3>{title}</h3>
    {#await promise then data}
      {#if table && !isEmpty(data)}
        <div class="card-actions">
          <button class="mini-btn" aria-pressed={view === "table"} onclick={() => (view = view === "table" ? "chart" : "table")}>{view === "table" ? "Show chart" : "Table"}</button>
          {#if view === "table"}<button class="mini-btn" onclick={() => download(table(data))}>CSV</button>{/if}
        </div>
      {/if}
    {/await}
  </div>
  {#if controls}{@render controls()}{/if}
  {#await promise}
    <div class="loading" aria-busy="true"></div>
  {:then data}
    {#if isEmpty(data)}
      <div class="empty">{emptyText}</div>
    {:else if view === "table" && table}
      {@const t = table(data)}
      <DataTable columns={t.columns} rows={t.rows} groupKey={t.groupKey ?? null} caption={title} />
    {:else}
      <Chart label={title} draw={(w, pal) => draw(data, w, pal)} />
    {/if}
    {#if note && !isEmpty(data)}<p class="note">{note}</p>{/if}
  {:catch e}
    <div class="empty error" role="alert">Could not load this chart: {e instanceof Error ? e.message : e}</div>
  {/await}
</section>
