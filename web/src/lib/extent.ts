// The frame the overview map opens on (pure, so it is unit tested). The selected and compared areas get room around them, never less
// than MIN_W by MIN_H degrees so a small city still shows its neighbours, and all of Utah when the area is very large.
export type Bounds = [[number, number], [number, number]];
export const MIN_W = 0.12, MIN_H = 0.09, ROOM = 1.6;

export function bboxOf(features: { geometry: any }[]) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  const walk = (c: any): void => {
    if (typeof c[0] === "number") { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else c.forEach(walk);
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return { w, e, s, n };
}

export function frameOf(features: { geometry: any }[], whole: Bounds): Bounds {
  if (!features.length) return whole;
  const b = bboxOf(features), sw = Math.max((b.e - b.w) * ROOM, MIN_W), sh = Math.max((b.n - b.s) * ROOM, MIN_H);
  if (sw >= whole[1][0] - whole[0][0] || sh >= whole[1][1] - whole[0][1]) return whole;
  const cx = (b.w + b.e) / 2, cy = (b.s + b.n) / 2;
  return [[cx - sw / 2, cy - sh / 2], [cx + sw / 2, cy + sh / 2]];
}
