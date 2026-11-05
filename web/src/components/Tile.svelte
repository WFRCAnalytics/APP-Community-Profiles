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
  }
  let { label, value, meta = "", method = null, compare = null, hint }: Props = $props();
</script>

<div class="tile" role="group" aria-label={label}>
  <div class="tile-label" title={hint ?? label}>{label}</div>
  <div class="tile-number">{value}</div>
  <div class="tile-meta">{#if meta}<span>{meta}</span>{/if}{#if method}<Chip {method} />{/if}</div>
  <div class="tile-compare">
    {#if compare}<i class="dot cmp"></i><span>{compare.label}</span> <b>{compare.value}</b>{/if}
  </div>
</div>
