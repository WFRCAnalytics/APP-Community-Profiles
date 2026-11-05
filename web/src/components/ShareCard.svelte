<script lang="ts">
  // A share-of-total chart for a distribution defined in specs.ts. A distribution of up to five categories is drawn as a donut
  // by default and a longer one as bars. A switch in the header changes it either way. A compared area is a second ring or a second bar.
  import { app } from "../lib/app.svelte";
  import { bars, donut, stacked100 } from "../lib/charts";
  import { fmtPct } from "../lib/format";
  import { distribution, sortByFirst, type Category, type Spec } from "../lib/specs";
  import { shareTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ModeToggle from "./ModeToggle.svelte";

  interface Props {
    title: string;
    spec: Spec | (() => Promise<{ spec: Spec; categories: Category[] }>);
    sort?: boolean;
    note?: string;
    style?: string;
    view?: "donut" | "bars";
  }
  let { title, spec, sort = false, note, style = "", view }: Props = $props();

  // A static spec knows its category count; a spec built from the data (year built) is long, so it starts as bars.
  // svelte-ignore state_referenced_locally
  const n = typeof spec === "function" ? 99 : spec.categories.length;
  // svelte-ignore state_referenced_locally
  const initial = view ?? (n >= 2 && n <= 5 && !sort ? "donut" : "bars");
  let mode = $state<string>(initial);

  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  async function load() {
    const refs = app.refs, v = app.v, db = app.db!;
    const resolved = typeof spec === "function" ? await spec() : { spec, categories: spec.categories };
    const rows = await distribution(db, resolved.spec, refs, v, resolved.categories);
    const order = sort ? sortByFirst(rows) : resolved.categories.map((c) => c.label);
    return { rows, order, series: refs.map((r) => r.label) };
  }
</script>

<ChartCard
  {title}
  {style}
  note="{note ? `${note} ` : ''}Source: {app.acs}."
  {load}
  isEmpty={(d) => !d.rows.length}
  draw={(d, width, height, pal) => mode === "donut"
    ? donut({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, width, height })
    : mode === "stack"
    ? stacked100({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, width, height })
    : bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height, colorBy: "category" })}
  table={(d) => shareTable(d.rows, d.series, pct1)}
>
  {#snippet headerExtra()}<ModeToggle bind:value={mode} options={[{ id: "donut", label: "Donut" }, { id: "bars", label: "Bars" }, { id: "stack", label: "100%" }]} />{/snippet}
</ChartCard>
