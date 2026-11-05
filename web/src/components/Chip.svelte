<script lang="ts">
  import { METHODS, type Method } from "../lib/format";
  let { method }: { method: Method } = $props();
  const m = $derived(METHODS[method]);
</script>

<!-- Tinted by method; the explanation shows on hover or keyboard focus, on the chip itself. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class="chip chip-{method}" tabindex="0" data-tip={m.note} aria-label="{m.label}. {m.note}" role="note">{m.short}</span>
