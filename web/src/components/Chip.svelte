<script lang="ts">
  import { METHODS, type Method } from "../lib/format";
  let { method }: { method: Method } = $props();
  const m = $derived(METHODS[method]);
</script>

<span class="chip chip-{method}" title="{m.label}. {m.note}" aria-label="{m.label}. {m.note}" role="note">{m.short}</span>
