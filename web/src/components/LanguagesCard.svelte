<script lang="ts">
  // The languages spoken at home other than English, as a share of everyone 5 and over.
  import { app } from "../lib/app.svelte";
  import { bars } from "../lib/charts";
  import { fmtPct } from "../lib/format";
  import { topLanguages } from "../lib/specs";
  import { shareTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";

  let { style = "" }: { style?: string } = $props();
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);
  const load = () => topLanguages(app.db!, app.refs, app.v, 12).then((r) => ({ ...r, series: app.refs.map((x) => x.label) }));
</script>

<ChartCard
  title="Languages spoken at home"
  {style}
  note="Share of people 5 and over, language groups other than English, largest first (by the selected area). Source: {app.acs}."
  {load}
  isEmpty={(d) => !d.rows.length}
  draw={(d, width, height, pal) => bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: (x) => fmtPct(x, 0), labels: d.series.length === 1, width, height })}
  table={(d) => shareTable(d.rows, d.series, pct1)}
/>
