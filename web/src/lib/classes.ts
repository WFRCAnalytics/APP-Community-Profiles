// Choropleth classes and colours (pure, so they are unit tested; the map itself needs a browser).
// One neutral slate hue, light to dark. Blue and brick mean "selected" and "compared" everywhere, so data never uses them.
export const RAMPS = {
  light: ["#EEF1F3", "#CBD6DC", "#9FB3BF", "#6E8B9B", "#3F6075"],
  dark: ["#1B3345", "#2F5168", "#4F7A92", "#80A6BA", "#C2DAE6"],
} as const;
export const NO_DATA = { light: "#DCE0E3", dark: "#22384A" };
export const SELECTED = { light: "#0A6CA0", dark: "#5CC4E8" };
export const COMPARED = { light: "#C85327", dark: "#F0916B" };
export type Mode = "light" | "dark";


export function quantileBreaks(values: (number | null | undefined)[], classes = 5): number[] {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const cuts: number[] = [];
  for (let i = 1; i < classes; i++) cuts.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))]);
  return [...new Set(cuts)]; // equal cut points collapse into fewer classes
}

export const classOf = (value: number, cuts: number[]) => cuts.filter((c) => value >= c).length;

export function colourFor(value: number | null | undefined, cuts: number[], mode: Mode): string {
  if (value == null || !Number.isFinite(value)) return NO_DATA[mode];
  const ramp = RAMPS[mode];
  return ramp[Math.min(ramp.length - 1, Math.round((classOf(value, cuts) / Math.max(1, cuts.length)) * (ramp.length - 1)))];
}

