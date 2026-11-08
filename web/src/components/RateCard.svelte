<script lang="ts">
  // A rate inside each group (people with a disability among each age group, say) for the selected and compared areas, with the
  // margin of error; the switch in the header shows each group's rate over the years instead.
  import { app } from "../lib/app.svelte";
  import { CATEGORY_COLORS, bars, lines, type LineSeries } from "../lib/charts";
  import { fmtPct, fmtPctTick } from "../lib/format";
  import { RATES, rates, ratesOverTime } from "../lib/specs";
  import { shareTable, trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ViewSwitch from "./ViewSwitch.svelte";

  let { title, spec, note, style = "", history = true }: { title: string; spec: keyof typeof RATES; note?: string; style?: string; history?: boolean } = $props();
  let when = $state<"snapshot" | "trend">("snapshot");
  // svelte-ignore state_referenced_locally
  const trend = $derived(history && when === "trend");
  const pct0 = fmtPctTick;
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  type Data = { kind: "now"; rows: Awaited<ReturnType<typeof rates>>; order: string[]; series: string[] } | { kind: "time"; lines: LineSeries[] };
  async function load(): Promise<Data> {
    const refs = app.refs, db = app.db!, s = RATES[spec];
    if (trend) return { kind: "time", lines: (await ratesOverTime(db, s, refs[0], app.years)).map((l, i) => ({ ...l, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })) };
    return { kind: "now", rows: await rates(db, s, refs, app.v), order: s.rates.map((r) => r.label), series: refs.map((r) => r.label) };
  }
</script>

<ChartCard
  title={trend ? `${title} over time` : title}
  {style}
  note={trend ? "Rate in each group in every ACS 5-year period, for the selected area. Source: American Community Survey." : `${note ? `${note} ` : ""}Source: ${app.acs}.`}
  {load}
  isEmpty={(d) => (d.kind === "now" ? !d.rows.length : d.lines.every((l) => l.points.length < 2))}
  draw={(d, width, height, pal) => d.kind === "time"
    ? lines({ series: d.lines, pal, format: pct1, tickFormat: pct0, zero: true, width, height, highlight: app.v, tipX: (x) => `${x - 4}–${x}` })
    : bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height })}
  table={(d) => (d.kind === "time" ? trendTable(d.lines, pct1, (x) => `${x - 4}–${x}`) : shareTable(d.rows, d.series, pct1))}
>
  {#snippet headerExtra()}{#if history}<ViewSwitch bind:value={when} />{/if}{/snippet}
</ChartCard>
