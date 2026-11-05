<script lang="ts">
  import ChartCard from "../components/ChartCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { pyramid } from "../lib/charts";
  import { fmtPct } from "../lib/format";
  import { AGES, SPECS, pyramidRows } from "../lib/specs";

  const pct0 = (d: number | null | undefined) => fmtPct(d, 0);
  const pct1 = (d: number | null | undefined) => fmtPct(d, 1);

  async function load() {
    const sel = app.selected!, cmp = app.compare, v = app.v, db = app.db!;
    const [rows, other] = await Promise.all([pyramidRows(db, sel, v), cmp ? pyramidRows(db, cmp, v) : null]);
    return { rows, other, sel: sel.label, cmp: cmp?.label };
  }
</script>

<div class="tab-body">
  <ChartCard
    title="Age and sex"
    note="Share of the population in each age group, {app.period} ACS. {app.compare ? 'Brick ticks mark the compared area.' : ''}"
    {load}
    isEmpty={(d) => !d.rows.length}
    draw={(d, width, pal) => pyramid({ rows: d.rows, compare: d.other, ages: AGES, pal, format: pct1, tickFormat: pct0, label: d.sel, compareLabel: d.cmp, width })}
    table={(d) => ({
      columns: [{ key: "age", label: "Age" }, { key: "male", label: "Male", align: "right" }, { key: "female", label: "Female", align: "right" }],
      rows: AGES.map((age) => ({
        age, male: pct1(d.rows.find((r) => r.age === age && r.sex === "Male")?.value), female: pct1(d.rows.find((r) => r.age === age && r.sex === "Female")?.value),
      })),
    })}
  />
  <ShareCard title="Age groups" spec={SPECS.ageBands} />
  <ShareCard title="Race" spec={SPECS.race} sort />
  <ShareCard title="Hispanic or Latino origin" spec={SPECS.ethnicity} />
  <TrendCard title="Median age over time" id="median_age" />
  <TrendCard title="Hispanic or Latino share over time" id="hispanic" />
</div>
