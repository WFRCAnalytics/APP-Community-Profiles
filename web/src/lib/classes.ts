// Choropleth classes and colours (pure, so they are unit tested; the map itself needs a browser).
// One neutral slate hue, light to dark. Blue and brick mean "selected" and "compared" everywhere, so data never uses them.
export const RAMPS = {
  light: ["#EDF5F2", "#BFE0D6", "#82C3BE", "#3F97A6", "#1E5F85"],
  dark: ["#17343B", "#21545A", "#2F7F7F", "#5CAFA0", "#B5E3CF"],
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


// Three-by-three bivariate palette (rows: second variable low to high, columns: first variable low to high).
export const BIVARIATE = {
  light: [["#E8E8E8", "#B5C0DA", "#6C83B5"], ["#B8D6BE", "#90B2B3", "#567994"], ["#73AE80", "#5A9178", "#2A5A5B"]],
  dark: [["#2A3441", "#3E5683", "#5C86C7"], ["#3F5A4A", "#4F7A86", "#5E9AB0"], ["#4F8A5E", "#5BA08A", "#6FC2B4"]],
} as const;

export function biColour(a: number | null | undefined, b: number | null | undefined, cutsA: number[], cutsB: number[], mode: Mode): string {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return NO_DATA[mode];
  return BIVARIATE[mode][Math.min(2, classOf(b, cutsB))][Math.min(2, classOf(a, cutsA))];
}
