// Blend two chart data objects of the same shape: numbers move toward the new value, everything else (labels, order) takes the
// new one. Where the shapes differ (a different number of rows or lines) that part simply switches, so a chart never shows a
// half-way mixture of two different things.
export function lerp<T>(a: T, b: T, t: number): T {
  if (typeof a === "number" && typeof b === "number") return (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * t : b) as T;
  if (Array.isArray(a) && Array.isArray(b)) return (a.length === b.length ? b.map((x, i) => lerp(a[i], x, t)) : b) as T;
  if (a && b && typeof a === "object" && typeof b === "object" && Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return b;
    return Object.fromEntries(kb.map((k) => [k, lerp((a as any)[k], (b as any)[k], t)])) as T;
  }
  return b;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
