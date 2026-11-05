<script lang="ts">
  import type { Method } from "../lib/format";
  import Chip from "./Chip.svelte";

  interface Props {
    label: string;
    value: string;
    meta?: string;
    method?: Method | null;
    compare?: { label: string; value: string } | null;
    hint?: string;
    spark?: { x: number; y: number }[];
  }
  const W = 64, H = 26;
  const path = $derived.by(() => {
    if (spark.length < 2) return null;
    const xs = spark.map((p) => p.x), ys = spark.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const px = (x: number) => 2 + ((x - x0) / (x1 - x0 || 1)) * (W - 4);
    const py = (y: number) => H - 3 - ((y - y0) / (y1 - y0 || 1)) * (H - 6);
    return { d: spark.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(""), cx: px(xs.at(-1)!), cy: py(ys.at(-1)!) };
  });
  let { label, value, meta = "", method = null, compare = null, hint, spark = [] }: Props = $props();
</script>

<div class="tile" role="group" aria-label={label}>
  <div class="tile-label" title={hint ?? label}>{label}</div>
  <div class="tile-row">
    <div class="tile-number">{value}</div>
    {#if path}
      <svg class="spark" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label="Trend {spark[0].x - 4} to {spark.at(-1)!.x}">
        <path d={path.d} fill="none" stroke="var(--sel)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx={path.cx} cy={path.cy} r="2.4" fill="var(--sel)" />
      </svg>
    {/if}
  </div>
  <div class="tile-meta">{#if meta}<span>{meta}</span>{/if}{#if method}<Chip {method} />{/if}</div>
  <div class="tile-compare">
    {#if compare}<i class="dot cmp"></i><span>{compare.label}</span> <b>{compare.value}</b>{/if}
  </div>
</div>
