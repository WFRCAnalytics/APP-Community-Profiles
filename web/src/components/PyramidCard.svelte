<script lang="ts">
  // The population pyramid for the chosen year: men blue on the left, women pink on the right; a compared area is a dashed outline.
  import { app } from "../lib/app.svelte";
  import { pyramid } from "../lib/charts";
  import { fmtPct, fmtPctTick } from "../lib/format";
  import { AGES, pyramidRows } from "../lib/specs";
  import ChartCard from "./ChartCard.svelte";

  let { style = "" }: { style?: string } = $props();
  const pct0 = fmtPctTick;
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  async function load() {
    const sel = app.selected!, cmp = app.compare, v = app.v, db = app.db!;
    const [rows, other] = await Promise.all([pyramidRows(db, sel, v), cmp ? pyramidRows(db, cmp, v) : null]);
    return { rows, other, sel: sel.label, cmp: cmp?.label };
  }
</script>

<ChartCard
  title="Age and sex, {app.v}"
  {style}
  note="Share of the population in each 5-year age group. Source: {app.acs}."
  {load}
  isEmpty={(d) => !d.rows.length}
  draw={(d, width, height, pal) => pyramid({ rows: d.rows, compare: d.other, ages: AGES, pal, format: pct1, tickFormat: pct0, label: d.sel, compareLabel: d.cmp, width, height })}
  table={(d) => ({
    columns: [{ key: "age", label: "Age" }, { key: "male", label: "Men", align: "right" }, { key: "female", label: "Women", align: "right" }],
    rows: AGES.map((age) => ({ age, male: pct1(d.rows.find((r) => r.age === age && r.sex === "Male")?.value), female: pct1(d.rows.find((r) => r.age === age && r.sex === "Female")?.value) })),
  })}
/>
