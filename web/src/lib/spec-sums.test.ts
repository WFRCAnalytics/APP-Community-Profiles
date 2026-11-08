// Every chart spec and indicator is checked against Utah's real ACS values in every vintage: the categories of a distribution
// must add up to its total, no category may read a row the vintage does not have, and no share may exceed its base.
// The values come from state-fixture.json (regenerate with `uv run python web/scripts/state-fixture.py`).
import { describe, expect, it } from "vitest";
import fixture from "./state-fixture.json";
import { RATES, SPECS, rateLabel, specFor } from "./specs";
import { INDICATORS } from "./indicators";

const data = fixture as Record<string, Record<string, number>>;
const vintages = Object.keys(data).map(Number).sort((a, b) => a - b);
const sum = (v: number, codes: string[]) => codes.reduce((t, c) => t + (data[v][c] ?? 0), 0);
const missing = (v: number, codes: string[]) => codes.filter((c) => data[v][c] === undefined);
const table = (code: string) => code.slice(0, 6);
// A vintage "has" a table when its total row is published.
const has = (v: number, codes: string[]) => codes.length > 0 && missing(v, codes).length === 0;

describe("distribution specs against real data", () => {
  for (const [name, base] of Object.entries(SPECS)) {
    it(`${name}: categories add to the total in every vintage`, () => {
      let checked = 0;
      for (const v of vintages) {
        const spec = specFor(base, v);
        if (!spec) continue;
        const total = spec.den.map((c) => data[v][c]).filter((x) => x !== undefined);
        if (total.length !== spec.den.length) continue;      // the table is not published in this vintage
        // A category whose rows the vintage does not publish at all would read as zero. (A range such as "$750,000 or more" may
        // list rows a vintage lacks, because the sum still holds; the check below catches it when it does not.)
        for (const c of spec.categories) expect(c.vars.filter((x) => data[v][x] !== undefined), `${name} ${v} ${c.label}: no rows in the table`).not.toEqual([]);
        const den = sum(v, spec.den) - (spec.minus ? sum(v, spec.minus) : 0);
        const parts = spec.categories.reduce((t, c) => t + sum(v, c.vars) - (c.less ? sum(v, c.less) : 0), 0);
        expect(parts / den, `${name} ${v}`).toBeGreaterThan(0.995);
        expect(parts / den, `${name} ${v}`).toBeLessThan(1.005);
        for (const c of spec.categories) expect(sum(v, c.vars) - (c.less ? sum(v, c.less) : 0), `${name} ${v} ${c.label}`).toBeGreaterThanOrEqual(0);
        checked++;
      }
      expect(checked, `${name} was never checked`).toBeGreaterThan(0);
    });
  }
});

describe("rate specs against real data", () => {
  for (const [name, spec] of Object.entries(RATES)) {
    it(`${name}: a rate never exceeds its base`, () => {
      for (const v of vintages) {
        if (spec.since && v < spec.since) continue;
        for (const r of spec.rates) {
          if (!has(v, r.den) || !has(v, r.num)) continue;
          expect(sum(v, r.num) / sum(v, r.den), `${name} ${v} ${r.label}`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

describe("indicators against real data", () => {
  for (const ind of INDICATORS.filter((i) => i.type === "share" && i.format === "pct")) {
    it(`${ind.id}: a percentage between 0 and 100 in every vintage`, () => {
      for (const v of vintages) {
        if (ind.since && v < ind.since) continue;
        const den = ind.den ?? [];
        if (!has(v, den) || !has(v, ind.num)) continue;
        const base = sum(v, den) - sum(v, ind.minus ?? []);
        const value = sum(v, ind.num) / base;
        expect(value, `${ind.id} ${v}`).toBeGreaterThanOrEqual(0);
        expect(value, `${ind.id} ${v}`).toBeLessThanOrEqual(1);
      }
    });
  }

  it("an indicator that starts later than its table does not read rows from another layout", () => {
    // The first vintage in which each table is published, and whether the numerator rows exist in every later one.
    for (const ind of INDICATORS) {
      for (const v of vintages) {
        if (ind.since && v < ind.since) continue;
        const have = ind.num.filter((c) => data[v][c] !== undefined);
        if (have.length === 0) continue;                      // the table is not published in this vintage
        expect(missing(v, ind.num).map(table), `${ind.id} ${v} has partial rows`).toEqual([]);
      }
    }
  });
});

describe("age brackets that moved", () => {
  it("names the old bracket before 2017 and the new one from then on", () => {
    const s = RATES.uninsuredByAge;
    expect(rateLabel(s, "6 to 18", 2016)).toBe("6 to 17");
    expect(rateLabel(s, "6 to 18", 2017)).toBe("6 to 18");
    expect(rateLabel(s, "35 to 44", 2012)).toBe("35 to 44");
  });
});
