<script lang="ts">
  // Men and women: a donut by default (outer ring the selected area, inner ring the compared one), with the counts in the hover
  // and the number of men per 100 women underneath. A switch changes it to a 100% bar, which keeps the pyramid's colours.
  import { app } from "../lib/app.svelte";
  import { donut, stacked100, type BarRow } from "../lib/charts";
  import { acsVariables } from "../lib/data";
  import { escapeHtml, fmtInt, fmtPct } from "../lib/format";
  import ChartCard from "./ChartCard.svelte";
  import ModeToggle from "./ModeToggle.svelte";

  interface Area { label: string; men: number; women: number }
  let mode = $state("donut");
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  async function load(): Promise<Area[]> {
    const refs = app.refs;
    const map = await acsVariables(app.db!, "population", refs, app.v, ["B01001_002", "B01001_026"]);
    return refs.map((r): Area => ({ label: r.label, men: map.get(`${r.id}|B01001_002`)?.estimate ?? 0, women: map.get(`${r.id}|B01001_026`)?.estimate ?? 0 })).filter((r) => r.men + r.women > 0);
  }
  const toRows = (areas: Area[]): BarRow[] => areas.flatMap((a) => {
    const t = a.men + a.women;
    return [
      { category: "Men", series: a.label, value: a.men / t, note: `${fmtInt(a.men)} people` },
      { category: "Women", series: a.label, value: a.women / t, note: `${fmtInt(a.women)} people` },
    ];
  });
</script>

<ChartCard
  title="Men and women, {app.v}"
  note="Source: {app.acs}, all ages."
  {load}
  isEmpty={(d) => !d.length}
  draw={(d, width, height, pal) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;";
    const foot = document.createElement("div");
    foot.style.cssText = "flex:none;display:grid;gap:2px;font-size:12px;color:var(--muted);padding-top:6px;";
    foot.innerHTML = d.map((a, i) => `<div style="display:flex;justify-content:space-between;gap:8px"><span style="display:flex;align-items:center;gap:6px"><i class="dot ${i === 0 ? "sel" : "cmp"}"></i>${escapeHtml(a.label)}</span><b style="color:var(--text);font-variant-numeric:tabular-nums">${((a.men / a.women) * 100).toFixed(1)} men per 100 women</b></div>`).join("");
    const rows = toRows(d), order = ["Men", "Women"], series = d.map((a) => a.label);
    const holder = document.createElement("div");
    holder.style.cssText = "flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:center;";
    const inner = Math.max(120, height - foot.childElementCount * 20 - 14);
    holder.append(mode === "donut"
      ? donut({ rows, order, seriesOrder: series, pal, format: pct1, width, height: inner, colors: [pal.male, pal.female] })
      : stacked100({ rows, order, seriesOrder: series, pal, format: pct1, width, height: inner, colors: [pal.male, pal.female] }));
    wrap.append(holder, foot);
    return wrap;
  }}
  table={(d) => ({
    columns: [{ key: "area", label: "Area" }, { key: "men", label: "Men", align: "right" }, { key: "women", label: "Women", align: "right" }, { key: "ratio", label: "Men per 100 women", align: "right" }],
    rows: d.map((r) => ({ area: r.label, men: fmtInt(r.men), women: fmtInt(r.women), ratio: ((r.men / r.women) * 100).toFixed(1) })),
  })}
>
  {#snippet headerExtra()}<ModeToggle bind:value={mode} options={[{ id: "donut", label: "Donut" }, { id: "stack", label: "100% bar" }]} />{/snippet}
</ChartCard>
