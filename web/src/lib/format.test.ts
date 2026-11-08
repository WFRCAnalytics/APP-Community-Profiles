import { describe, expect, it } from "vitest";
import { fmtFlagged, fmtInt, lowReliability, fmtMoney, fmtOne, fmtPct, methodOf, toCsv } from "./format";
import { change } from "./tipcharts";
import { AGG_COLUMNS, ratioMoe, shareMoe, sumOf, summarize, type AcsRow } from "./data";
import { BY_ID } from "./indicators";

describe("format", () => {
  it("formats numbers and missing values", () => {
    expect(fmtInt(1234567.4)).toBe("1,234,567");
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtMoney(85000)).toBe("$85,000");
    expect(fmtInt(null)).toBe("–");
  });
  it("ranks methods and escapes CSV", () => {
    expect(["direct", "aggregated", "allocated", "allocated"]).toEqual([0, 1, 2, 9].map(methodOf));
    expect(toCsv([{ a: 'x,"y"', b: null }], ["a", "b"])).toBe('﻿a,b\n"x,""y""",');
  });
});

describe("data helpers", () => {
  const row = (estimate: number, moe: number | null, method: string): AcsRow => ({ geo_id: "g", variable: "", estimate, moe, method, flag: null });
  it("sums estimates, adds margins in quadrature and keeps the weakest method", () => {
    const map = new Map([["g|a", row(10, 3, "direct")], ["g|b", row(20, 4, "allocated")]]);
    const s = sumOf(map, "g", ["a", "b"]);
    expect(s).toMatchObject({ value: 30, moe: 5, rank: 2, any: true });
  });
  it("counts a controlled term (estimate, no margin) as zero, and has no margin only when no term has one", () => {
    const map = new Map([["g|a", row(10, null, "direct")], ["g|b", row(20, 4, "direct")]]);
    expect(sumOf(map, "g", ["a", "b"]).moe).toBe(4);
    expect(sumOf(map, "g", ["a"]).moe).toBeNull();
  });
  it("uses the same margin rule in the SQL aggregation", () => {
    const sql = AGG_COLUMNS(BY_ID.under18);
    expect(sql).toContain("count(moe) FILTER");
    expect(sql).toContain("coalesce(moe, 0)");
  });
  it("computes the Census proportion margin of error", () => {
    expect(shareMoe(50, 100, 10, 0)).toBeCloseTo(0.1);
    expect(shareMoe(null, 100, 10, 0)).toBeNull();
  });
  it("uses the ratio formula for averages, which the proportion formula understates", () => {
    // A numerator that is not a subset of the denominator: 100 over 50, margins 20 and 2.
    expect(ratioMoe(100, 50, 20, 2)).toBeCloseTo(Math.sqrt(20 ** 2 + 2 ** 2 * 2 ** 2) / 50);
    expect(ratioMoe(100, 50, 20, 2)).toBeGreaterThan(shareMoe(100, 50, 20, 2)!);
    const v = summarize(BY_ID.mean_travel, { num: 100, num_moe: 20, den: 50, den_moe: 2, minus_: 0, minus_moe: 0, rank: 0, flag: null });
    expect(v.moe).toBeCloseTo(ratioMoe(100, 50, 20, 2)!);
  });
  it("summarises a share indicator, subtracting `minus` from the denominator", () => {
    const v = summarize(BY_ID.rent_burden, { num: 30, num_moe: 4, den: 110, den_moe: 5, minus_: 10, minus_moe: 0, rank: 1, flag: null });
    expect(v.value).toBeCloseTo(0.3);
    expect(v.method).toBe("aggregated");
  });
});

describe("number display", () => {
  it("never prints a negative zero", () => {
    expect(fmtInt(-0.3)).toBe("0");
    expect(fmtOne(-0.04)).toBe("0.0");
    expect(fmtPct(-0.0004)).toBe("0.0%");
    expect(fmtInt(-1234.6)).toBe("-1,235");
  });
  it("shows a bounded median as the Census annotation, not the stand-in number", () => {
    expect(fmtFlagged(fmtMoney, 250001, "250,000+")).toBe("$250,000+");
    expect(fmtFlagged(fmtMoney, 9999, "10,000-")).toBe("$10,000 or less");
    expect(fmtFlagged(fmtMoney, 85000, "+")).toBe("$85,000+");
    expect(fmtFlagged(fmtMoney, 85000, null)).toBe("$85,000");
    expect(fmtFlagged(fmtMoney, null, "-")).toBe("–");
  });
  it("writes a BOM, quotes headers, and flags estimates whose margin is over 30% of the value", () => {
    expect(toCsv([{ a: 1 }], ["a"], ["Share, 2024"])).toBe('\uFEFF"Share, 2024"\n1');
    expect(lowReliability(0.02, 0.012)).toBe(true);
    expect(lowReliability(0.2, 0.012)).toBe(false);
    expect(lowReliability(0, 0.01)).toBe(false);
  });
  it("reports the change of a share in percentage points and of anything else in percent", () => {
    const pts = [{ x: 2019, y: 0.12 }, { x: 2024, y: 0.14 }];
    expect(change(pts, true)).toBe("+2.0 pts");
    expect(change(pts)).toBe("+17%");
    expect(change([{ x: 1, y: 0.1 }, { x: 2, y: 0.10004 }], true)).toBe("0.0 pts");
    expect(change([{ x: 1, y: 0 }, { x: 2, y: 0.1 }])).toBeNull();
    expect(change([{ x: 1, y: 0 }, { x: 2, y: 0.1 }], true)).toBe("+10.0 pts");
  });
});
