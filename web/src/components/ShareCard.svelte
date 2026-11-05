<script lang="ts">
  // A share-of-total bar chart for a distribution defined in specs.ts; a compared area draws as grouped bars.
  import { app } from "../lib/app.svelte";
  import { bars } from "../lib/charts";
  import { fmtPct } from "../lib/format";
  import { distribution, sortByFirst, type Category, type Spec } from "../lib/specs";
  import { shareTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";

  interface Props {
    title: string;
    spec: Spec | (() => Promise<{ spec: Spec; categories: Category[] }>);
    sort?: boolean;
    note?: string;
    style?: string;
  }
  let { title, spec, sort = false, note, style = "" }: Props = $props();

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
  draw={(d, width, height, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height })}
  table={(d) => shareTable(d.rows, d.series, pct1)}
/>
