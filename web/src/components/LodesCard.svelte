<script lang="ts">
  // Jobs (workplace) by one LEHD LODES breakdown: industry, worker age, earnings, race, education, firm size and so on. The
  // switch in the header shows each category's share of jobs over the years (LODES has every year from 2002).
  import { app } from "../lib/app.svelte";
  import { CATEGORY_COLORS, bars, lines, type LineSeries } from "../lib/charts";
  import { lodesGroupSeries } from "../lib/data";
  import { fmtPct, fmtPctTick } from "../lib/format";
  import { SECTOR_BY_CNS, lodesBase, lodesDistribution, lodesGroups, sortByFirst } from "../lib/specs";
  import { shareTable, trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ViewSwitch from "./ViewSwitch.svelte";

  const GROUPS: [string, string][] = [["Industry", "industry"], ["Worker age", "age"], ["Monthly earnings", "earnings"], ["Education", "education"], ["Race", "race"], ["Ethnicity", "ethnicity"], ["Sex", "sex"]];
  let { initial = "industry", id, style = "", pick = true }: { initial?: string; id: string; style?: string; pick?: boolean } = $props();
  // svelte-ignore state_referenced_locally
  let group = $state(initial);
  let when = $state<"snapshot" | "trend">("snapshot");
  const lodes = $derived(Math.min(app.v, app.lodesLatest));
  const heading = $derived(GROUPS.find(([, k]) => k === group)?.[0] ?? "");
  const pct0 = fmtPctTick;
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  type Data = { kind: "now"; rows: Awaited<ReturnType<typeof lodesDistribution>>; order: string[]; series: string[] } | { kind: "time"; lines: LineSeries[] };
  async function load(): Promise<Data> {
    const refs = app.refs, db = app.db!;
    if (when === "trend") {
      const labels = (await lodesGroups(db)).filter((l) => l.source === "wac/rac" && l.group === group);
      const rows = await lodesGroupSeries(db, "wac", refs[0], labels.map((l) => l.variable));
      const byYear = new Map<number, Map<string, number>>();
      for (const r of rows) byYear.set(r.year, (byYear.get(r.year) ?? new Map()).set(r.variable, r.jobs));
      const series = labels.map((l): LineSeries => ({
        label: group === "industry" ? (SECTOR_BY_CNS[l.variable] ?? l.label) : l.label, color: "",
        points: [...byYear].flatMap(([year, m]) => {
          const base = m.get("C000") ? lodesBase(group, labels.map((x) => m.get(x.variable) ?? 0), m.get("C000")!) : null;
          return base ? [{ x: year, y: (m.get(l.variable) ?? 0) / base, note: `${Math.round(m.get(l.variable) ?? 0).toLocaleString("en-US")} jobs` }] : [];
        }),
      }));
      // A chart of twenty sectors is unreadable; keep the eight largest by the latest year.
      const top = series.sort((a, b) => (b.points.at(-1)?.y ?? 0) - (a.points.at(-1)?.y ?? 0)).slice(0, 8);
      return { kind: "time", lines: top.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })) };
    }
    const rows = await lodesDistribution(db, "wac", refs, lodes, group);
    return { kind: "now", rows, order: group === "industry" ? sortByFirst(rows) : [...new Set(rows.map((r) => r.category))], series: refs.map((r) => r.label) };
  }
</script>

<ChartCard
  title={when === "trend" ? `Jobs by ${heading.toLowerCase()} over time` : `Jobs by ${heading.toLowerCase()}, ${lodes}`}
  {style}
  note={when === "trend" ? `Share of jobs located here${group === "education" ? " held by workers 30 and older" : ""}, ${group === "industry" ? "the eight largest sectors" : "by category"}, for the selected area. Years LODES does not report for this breakdown are left out. Source: LEHD LODES8, ${app.lodesYears[0]} to ${app.lodesLatest}.` : `Share of jobs located here.${group === "education" ? " Education is reported only for workers 30 and older, so these are shares of those jobs." : ""}${["race", "ethnicity", "sex"].includes(group) ? " Published from 2009." : ""} Source: LEHD LODES8, ${lodes}.`}
  {load}
  isEmpty={(d) => (d.kind === "now" ? !d.rows.length : d.lines.every((l) => l.points.length < 2))}
  draw={(d, width, height, pal) => d.kind === "time"
    ? lines({ series: d.lines, pal, format: pct1, tickFormat: pct0, zero: true, width, height, highlight: Math.min(app.v, app.lodesLatest), tipX: String })
    : bars({ rows: d.rows, order: d.order, seriesOrder: d.series, pal, format: pct1, tickFormat: pct0, labels: d.series.length === 1, width, height })}
  table={(d) => (d.kind === "time" ? trendTable(d.lines, pct1, String) : shareTable(d.rows, d.series, pct1))}
>
  {#snippet controls()}
    {#if pick}<div class="controls"><div class="field"><label for="grp-{id}">Break down by</label><select id="grp-{id}" bind:value={group}>{#each GROUPS as [text, key]}<option value={key}>{text}</option>{/each}</select></div></div>{/if}
  {/snippet}
  {#snippet headerExtra()}<ViewSwitch bind:value={when} />{/snippet}
</ChartCard>
