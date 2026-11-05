<script lang="ts">
  // Men and women: a two-segment bar per area with the counts, the shares and the number of men per 100 women.
  import { app } from "../lib/app.svelte";
  import { acsVariables } from "../lib/data";
  import { escapeHtml, fmtInt } from "../lib/format";
  import ChartCard from "./ChartCard.svelte";

  interface Row { label: string; role: "sel" | "cmp"; men: number; women: number }

  async function load(): Promise<Row[]> {
    const refs = app.refs;
    const map = await acsVariables(app.db!, "population", refs, app.v, ["B01001_002", "B01001_026"]);
    return refs.map((r, i): Row => ({ label: r.label, role: i === 0 ? "sel" : "cmp", men: map.get(`${r.id}|B01001_002`)?.estimate ?? 0, women: map.get(`${r.id}|B01001_026`)?.estimate ?? 0 })).filter((r) => r.men + r.women > 0);
  }
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
</script>

<ChartCard
  title="Men and women, {app.v}"
  note="Source: {app.acs}, all ages."
  {load}
  isEmpty={(d) => !d.length}
  draw={(d) => {
    const wrap = document.createElement("div");
    wrap.className = "sex";
    wrap.innerHTML = d.map((r) => {
      const t = r.men + r.women;
      return `<div class="sex-row"><div class="sex-head"><span><i class="dot ${r.role}"></i>${escapeHtml(r.label)}</span><span>${((r.men / r.women) * 100).toFixed(1)} men per 100 women</span></div>
        <div class="sex-bar"><div class="m" style="width:${(r.men / t) * 100}%">${pct(r.men / t)}</div><div class="f" style="width:${(r.women / t) * 100}%">${pct(r.women / t)}</div></div>
        <div class="sex-foot"><span>Men ${fmtInt(r.men)}</span><span>Women ${fmtInt(r.women)}</span></div></div>`;
    }).join("");
    return wrap;
  }}
  table={(d) => ({
    columns: [{ key: "area", label: "Area" }, { key: "men", label: "Men", align: "right" }, { key: "women", label: "Women", align: "right" }, { key: "ratio", label: "Men per 100 women", align: "right" }],
    rows: d.map((r) => ({ area: r.label, men: fmtInt(r.men), women: fmtInt(r.women), ratio: ((r.men / r.women) * 100).toFixed(1) })),
  })}
/>

<style>
  :global(.sex) { padding: 4px 2px; }
  :global(.sex-row) { margin-bottom: 14px; }
  :global(.sex-head) { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; font-size: 0.8rem; color: var(--muted); }
  :global(.sex-head span:first-child) { color: var(--text); font-weight: 600; display: flex; align-items: center; gap: 6px; }
  :global(.sex-bar) { display: flex; height: 30px; gap: 2px; border-radius: 8px; overflow: hidden; }
  :global(.sex-bar > div) { display: flex; align-items: center; padding: 0 10px; font-weight: 600; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
  :global(.sex-bar .m) { background: var(--male); color: var(--on-male); }
  :global(.sex-bar .f) { background: var(--female); color: #131a27; justify-content: flex-end; }
  :global(.sex-foot) { display: flex; justify-content: space-between; margin-top: 4px; font-size: 0.78rem; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
