import { describe, expect, it } from "vitest";
import { frameOf, MIN_H, MIN_W, type Bounds } from "./extent";

const UTAH: Bounds = [[-114.1, 36.95], [-108.95, 42.05]];
const box = (w: number, s: number, e: number, n: number) => ({ geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });

describe("frameOf", () => {
  it("gives a city room around it", () => {
    const [[w, s], [e, n]] = frameOf([box(-112, 40.7, -111.9, 40.8)], UTAH);
    expect(e - w).toBeCloseTo(0.16); expect(n - s).toBeCloseTo(0.16);
    expect(w).toBeLessThan(-112); expect(e).toBeGreaterThan(-111.9);
  });
  it("never frames tighter than the minimum, so a tiny town still shows its surroundings", () => {
    const [[w, s], [e, n]] = frameOf([box(-111.5, 40.5, -111.495, 40.504)], UTAH);
    expect(e - w).toBeCloseTo(MIN_W); expect(n - s).toBeCloseTo(MIN_H);
  });
  it("covers the selected and the compared area together", () => {
    const [[w], [e]] = frameOf([box(-112, 40.7, -111.9, 40.8), box(-111.5, 40.2, -111.4, 40.3)], UTAH);
    expect(w).toBeLessThan(-112); expect(e).toBeGreaterThan(-111.4);
  });
  it("shows all of Utah for a very large area or nothing at all", () => {
    expect(frameOf([box(-114, 37, -109, 42)], UTAH)).toEqual(UTAH);
    expect(frameOf([], UTAH)).toEqual(UTAH);
  });
});
