// Choropleth classes and colours (pure, so they are unit tested; the map itself needs a browser).
// One yellow-to-green hue (ColorBrewer YlGn), light to dark and, in dark mode, dim to bright. The accent and brick mean "selected"
// and "compared" everywhere, so data never uses them and both outlines stay readable on every fill.
export const RAMPS = {
  light: ["#FFFFCC", "#C2E699", "#78C679", "#31A354", "#006837"],
  dark: ["#006837", "#31A354", "#78C679", "#C2E699", "#FFFFCC"],
} as const;
export const NO_DATA = { light: "#DCE0E3", dark: "#22384A" };
// The selected area is drawn in the interface accent (the same values as --accent in app.css; MapLibre cannot read CSS variables).
export const SELECTED = { light: "#1B2A47", dark: "#C9D6F2" };
export const COMPARED = { light: "#C85327", dark: "#F0916B" };
// Hover highlight on the flow map: amber, because the accent and brick already mean selected and compared.
export const HIGHLIGHT = { light: "#C98A00", dark: "#E6B53A" };
export type Mode = "light" | "dark";

// Flow lines, fewest jobs first, in the same green as the choropleth. Light mode drops the palest steps and ends on a deeper green,
// so thin lines read on a pale basemap; dark mode fades up to pale yellow, so the busiest routes glow.
export const FLOW_RAMPS = {
  light: [RAMPS.light[2], RAMPS.light[3], RAMPS.light[4], "#00441B"],
  dark: [RAMPS.dark[1], RAMPS.dark[2], RAMPS.dark[3], RAMPS.dark[4]],
} as const;


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
