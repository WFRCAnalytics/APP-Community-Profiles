<script lang="ts">
  // A share-of-total chart for a distribution defined in specs.ts. A distribution of up to five categories is drawn as a donut
  // by default and a longer one as bars; a switch in the header changes it. Where the history says something (history is true),
  // a second switch turns the panel into one line per category over the years. A compared area is a second ring or a second bar.
  import { app } from "../lib/app.svelte";
  import { CATEGORY_COLORS, bars, donut, lines, stacked100, type LineSeries } from "../lib/charts";
  import { fmtPct, fmtPctTick } from "../lib/format";
  import { distribution, distributionOverTime, sortByFirst, type Category, type Spec } from "../lib/specs";
  import { shareTable, trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ModeToggle from "./ModeToggle.svelte";
  import ViewSwitch from "./ViewSwitch.svelte";

  interface Props {
    title: string;
    spec: Spec | (() => Promise<{ spec: Spec; categories: Category[] }>);
    sort?: boolean;
    note?: string;
    style?: string;
    view?: "donut" | "bars";
    history?: boolean; // false where a trend adds nothing
    basis?: { id: string; label: string; spec: Spec }[]; // the same chart on another basis, chosen by a switch in the header
  }
  let { title, spec, sort = false, note, style = "", view, history = true, basis }: Props = $props();
  // svelte-ignore state_referenced_locally
  let which = $state(basis?.[0]?.id ?? "");
  const current = $derived(basis ? basis.find((b) => b.id === which)?.spec ?? spec : spec);

  // A static spec knows its category count; a spec built from the data (year built) is long, so it starts as bars and has no history.
  // svelte-ignore state_referenced_locally
  const n = typeof spec === "function" ? 99 : spec.categories.length;
  // svelte-ignore state_referenced_locally
  const canTrend = history && typeof spec !== "function";
  // svelte-ignore state_referenced_locally
  const initial = view ?? (n >= 2 && n <= 5 && !sort ? "donut" : "bars");
  let mode = $state<string>(initial);
  let when = $state<"snapshot" | "trend">("snapshot");
  let scope = $state("all"); // "rest" leaves out the largest category so the smaller ones can be read
  const trend = $derived(canTrend && when === "trend");

  const pct0 = fmtPctTick;
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  type Data =
    | { kind: "now"; rows: Awaited<ReturnType<typeof distribution>>; order: string[]; series: string[] }
    | { kind: "time"; lines: LineSeries[] };

  async function load(): Promise<Data> {
    const refs = app.refs, v = app.v, db = app.db!;
    const spec = current;
    if (trend && typeof spec !== "function") {
      const raw = await distributionOverTime(db, spec, refs[0], app.years);
      const last = (s: LineSeries) => s.points.at(-1)?.y ?? 0;
      const sorted = sort ? [...raw].sort((a, b) => last(b) - last(a)) : raw;
      const ordered = scope === "rest" && sort ? sorted.slice(1) : sorted;
      return { kind: "time", lines: ordered.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })) };
    }
    const resolved = typeof spec === "function" ? await spec() : { spec, categories: spec.categories };
    const rows = await distribution(db, resolved.spec, refs, v, resolved.categories);
    const order = sort ? sortByFirst(rows) : resolved.categories.map((c) => c.label);
    return { kind: "now", rows, order, series: refs.map((r) => r.label) };
  }
</script>

<ChartCard
  title={trend ? `${title} over time` : title}
  {style}
  note={trend ? "Share of each category in every ACS 5-year period (each point is the estimate ending that year), for the selected area. Source: American Community Survey." : `${note ? `${note} ` : ""}Source: ${app.acs}.`}
  {load}
  isEmpty={(d) => (d.kind === "now" ? !d.rows.length : d.lines.every((l) => l.points.length < 2))}
  emptyText={trend ? "Not enough years are published for this area." : "Not published for this area or year."}
  draw={(d, width, height, pal) => d.kind === "time"
    ? lines({ series: d.lines, pal, format: pct1, tickFormat: pct0, zero: true, width, height, highlight: app.v, tipX: (x) => `${x - 4}–${x}` })
    : mode === "donut"
    ? donut({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, width, height })
    : mode === "stack"
    ? stacked100({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, width, height })
    : bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height, colorBy: "category" })}
  table={(d) => (d.kind === "time" ? trendTable(d.lines, pct1, (x) => `${x - 4}–${x}`) : shareTable(d.rows, d.series, pct1))}
>
  {#snippet headerExtra()}
    {#if basis}<ModeToggle label="Basis" bind:value={which} options={basis.map((b) => ({ id: b.id, label: b.label }))} />{/if}
    {#if trend}
      {#if sort}<ModeToggle label="Categories" bind:value={scope} options={[{ id: "all", label: "All" }, { id: "rest", label: "Smaller groups" }]} />{/if}
    {:else}
      <ModeToggle bind:value={mode} options={[...(n >= 2 && n <= 5 && !sort ? [{ id: "donut", label: "Donut" }] : []), { id: "bars", label: "Bars" }, { id: "stack", label: "100%" }]} />
    {/if}
    {#if canTrend}<ViewSwitch bind:value={when} />{/if}
  {/snippet}
</ChartCard>
