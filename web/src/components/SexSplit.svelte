<script lang="ts">
  // Men and women: a donut by default (outer ring the selected area, inner ring the compared one), with the counts in the hover
  // and the number of men per 100 women underneath. A switch changes it to bars or a 100% bar; all three keep the pyramid's blue and pink.
  import { app } from "../lib/app.svelte";
  import { bars, donut, lines, stacked100, type BarRow, type LineSeries } from "../lib/charts";
  import { acsVariables } from "../lib/data";
  import { escapeHtml, fmtInt, fmtPct } from "../lib/format";
  import { SPECS, distributionOverTime } from "../lib/specs";
  import { trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ModeToggle from "./ModeToggle.svelte";
  import ViewSwitch from "./ViewSwitch.svelte";

  interface Area { label: string; men: number; women: number }
  let mode = $state("donut");
  let when = $state<"snapshot" | "trend">("snapshot");
  type Data = { kind: "now"; areas: Area[] } | { kind: "time"; lines: LineSeries[] };
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);
  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);

  async function load(): Promise<Data> {
    const refs = app.refs;
    if (when === "trend") {
      const ref = refs[0];
      const raw = await distributionOverTime(app.db!, SPECS.sex, ref, app.years);
      return { kind: "time", lines: raw.map((l, i) => ({ ...l, color: i === 0 ? sexColors.male : sexColors.female })) };
    }
    const map = await acsVariables(app.db!, "population", refs, app.v, ["B01001_002", "B01001_026"]);
    return { kind: "now", areas: refs.map((r): Area => ({ label: r.label, men: map.get(`${r.id}|B01001_002`)?.estimate ?? 0, women: map.get(`${r.id}|B01001_026`)?.estimate ?? 0 })).filter((r) => r.men + r.women > 0) };
  }
  const sexColors = { male: "", female: "" };
  const toRows = (areas: Area[]): BarRow[] => areas.flatMap((a) => {
    const t = a.men + a.women;
    return [
      { category: "Men", series: a.label, value: a.men / t, note: `${fmtInt(a.men)} people` },
      { category: "Women", series: a.label, value: a.women / t, note: `${fmtInt(a.women)} people` },
    ];
  });
</script>

<ChartCard
  title={when === "trend" ? "Men and women over time" : `Men and women, ${app.v}`}
  note="Source: {app.acs}{when === 'trend' ? ', each period shown by the year it ends' : ', all ages'}."
  {load}
  isEmpty={(d) => (d.kind === "now" ? !d.areas.length : d.lines.every((l) => l.points.length < 2))}
  draw={(d, width, height, pal) => {
    if (d.kind === "time") {
      sexColors.male = pal.male; sexColors.female = pal.female;
      return lines({ series: d.lines.map((l, i) => ({ ...l, color: i === 0 ? pal.male : pal.female })), pal, format: pct1, tickFormat: pct1, width, height, highlight: app.v, tipX: (x) => `${x - 4}–${x}` });
    }
    const a = d.areas;
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;";
    const foot = document.createElement("div");
    foot.style.cssText = "flex:none;display:grid;gap:2px;font-size:12px;color:var(--muted);padding-top:6px;";
    foot.innerHTML = a.map((x, i) => `<div style="display:flex;justify-content:space-between;gap:8px"><span style="display:flex;align-items:center;gap:6px"><i class="dot ${i === 0 ? "sel" : "cmp"}"></i>${escapeHtml(x.label)}</span><b style="color:var(--text);font-variant-numeric:tabular-nums">${((x.men / x.women) * 100).toFixed(1)} men per 100 women</b></div>`).join("");
    const rows = toRows(a), order = ["Men", "Women"], series = a.map((x) => x.label);
    const holder = document.createElement("div");
    holder.style.cssText = "flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:center;";
    const inner = Math.max(120, height - foot.childElementCount * 20 - 14);
    const sex = [pal.male, pal.female];
    holder.append(mode === "donut"
      ? donut({ rows, order, seriesOrder: series, pal, format: pct1, width, height: inner, colors: sex })
      : mode === "stack"
      ? stacked100({ rows, order, seriesOrder: series, pal, format: pct1, width, height: inner, colors: sex })
      : bars({ rows, order, seriesOrder: series, pal, format: pct1, tickFormat: pct0, labels: series.length === 1, width, height: inner, colorBy: "category", colors: sex }));
    wrap.append(holder, foot);
    return wrap;
  }}
  table={(d) => d.kind === "time" ? trendTable(d.lines, pct1, (x) => `${x - 4}–${x}`) : ({
    columns: [{ key: "area", label: "Area" }, { key: "men", label: "Men", align: "right" }, { key: "women", label: "Women", align: "right" }, { key: "ratio", label: "Men per 100 women", align: "right" }],
    rows: d.areas.map((r) => ({ area: r.label, men: fmtInt(r.men), women: fmtInt(r.women), ratio: ((r.men / r.women) * 100).toFixed(1) })),
  })}
>
  {#snippet headerExtra()}
    {#if when === "snapshot"}<ModeToggle bind:value={mode} options={[{ id: "donut", label: "Donut" }, { id: "bars", label: "Bars" }, { id: "stack", label: "100%" }]} />{/if}
    <ViewSwitch bind:value={when} />
  {/snippet}
</ChartCard>
