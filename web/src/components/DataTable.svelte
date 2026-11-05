<script lang="ts" module>
  export interface Column { key: string; label: string; align?: "right" }
  export type Row = Record<string, string | number | null | undefined>;
</script>

<script lang="ts">
  let { columns, rows, groupKey = null, caption }: { columns: Column[]; rows: Row[]; groupKey?: string | null; caption?: string } = $props();

  // Insert a heading row whenever the group changes.
  const grouped = $derived(rows.map((r, i) => ({ r, head: groupKey && r[groupKey] !== rows[i - 1]?.[groupKey] ? String(r[groupKey]) : null })));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-scroll" tabindex="0" role="region" aria-label={caption ?? "Data table"}>
  <table class="data-table">
    {#if caption}<caption class="sr-only">{caption}</caption>{/if}
    <thead>
      <tr>{#each columns as c}<th scope="col" class:num={c.align === "right"}>{c.label}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each grouped as { r, head }}
        {#if head}<tr class="group"><th colspan={columns.length} scope="colgroup">{head}</th></tr>{/if}
        <tr>{#each columns as c}<td class:num={c.align === "right"}>{r[c.key] ?? ""}</td>{/each}</tr>
      {/each}
    </tbody>
  </table>
</div>
