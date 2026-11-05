import { describe, expect, it } from "vitest";
import { fmtInt, fmtMoney, fmtPct, methodOf, toCsv } from "./format";
import { shareMoe, sumOf, summarize, type AcsRow } from "./data";
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
    expect(toCsv([{ a: 'x,"y"', b: null }], ["a", "b"])).toBe('a,b\n"x,""y""",');
  });
});

describe("data helpers", () => {
  const row = (estimate: number, moe: number | null, method: string): AcsRow => ({ geo_id: "g", variable: "", estimate, moe, method, flag: null });
  it("sums estimates, adds margins in quadrature and keeps the weakest method", () => {
    const map = new Map([["g|a", row(10, 3, "direct")], ["g|b", row(20, 4, "allocated")]]);
    const s = sumOf(map, "g", ["a", "b"]);
    expect(s).toMatchObject({ value: 30, moe: 5, rank: 2, any: true });
  });
  it("drops the margin when any term has none", () => {
    const map = new Map([["g|a", row(10, null, "direct")], ["g|b", row(20, 4, "direct")]]);
    expect(sumOf(map, "g", ["a", "b"]).moe).toBeNull();
  });
  it("computes the Census proportion margin of error", () => {
    expect(shareMoe(50, 100, 10, 0)).toBeCloseTo(0.1);
    expect(shareMoe(null, 100, 10, 0)).toBeNull();
  });
  it("summarises a share indicator, subtracting `minus` from the denominator", () => {
    const v = summarize(BY_ID.rent_burden, { num: 30, num_moe: 4, den: 110, den_moe: 5, minus_: 10, minus_moe: 0, rank: 1, flag: null });
    expect(v.value).toBeCloseTo(0.3);
    expect(v.method).toBe("aggregated");
  });
});
