// Colours and fonts for the PDF report. The PDF is drawn by react-pdf and cannot read CSS variables, so the app's light tokens
// (app.css) are written out as literal hex. The report is always light, whatever theme the reader is using. Fonts are the
// app's own faces as static .woff files bundled with the build, so a report renders the same offline.
import { Font } from "@react-pdf/renderer";
import brRegular from "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff?url";
import brSemibold from "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff?url";
import brBold from "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff?url";
import isRegular from "@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff?url";
import isItalic from "@fontsource/instrument-sans/files/instrument-sans-latin-400-italic.woff?url";
import isMedium from "@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff?url";
import isSemibold from "@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff?url";
import isBold from "@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff?url";

export const C = {
  ink: "#131a27",
  muted: "#566074",
  faint: "#8a93a5",
  border: "#dde1e9",
  grid: "#e3e7ee",
  panel: "#f1f3f8",
  navy: "#1b2a47",
  sel: "#0072b2",
  cmp: "#bd4b00",
  male: "#0072b2",
  female: "#cc79a7",
  white: "#ffffff",
  noData: "#dce0e3",
  amberBg: "#fff0d3",
  amberLine: "#efce86",
  amberInk: "#85560a",
} as const;

// Categories in a share chart (the app's CATEGORY_COLORS) and the neutral teal ramp of the maps.
export const CATS = ["#009E73", "#E69F00", "#56B4E9", "#CC79A7", "#8E6BB8", "#7A8497", "#B07A4B", "#4C7A6B", "#C9B21E", "#D1495B", "#3D5A80", "#98C1D9"];
export const RAMP = ["#EDF5F2", "#BFE0D6", "#82C3BE", "#3F97A6", "#1E5F85"];
export const FLOW_RAMP = ["#5AAAB2", "#2F86A0", "#1E5F85", "#102F52"];

export const F = { display: "Bricolage", body: "Instrument" } as const;

export const METHOD_STYLE: Record<string, { bg: string; ink: string; letter: string }> = {
  direct: { bg: "#e0f1e7", ink: "#1d6b43", letter: "P" },
  aggregated: { bg: "#e0ecf8", ink: "#1b5a92", letter: "A" },
  allocated: { bg: "#fbefd0", ink: "#85560a", letter: "E" },
  derived: { bg: "#fbefd0", ink: "#85560a", letter: "E" },
};

let registered = false;
export function registerFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({ family: F.display, fonts: [{ src: brRegular, fontWeight: 400 }, { src: brSemibold, fontWeight: 600 }, { src: brBold, fontWeight: 700 }] });
  Font.register({
    family: F.body,
    fonts: [
      { src: isRegular, fontWeight: 400 }, { src: isItalic, fontWeight: 400, fontStyle: "italic" },
      { src: isMedium, fontWeight: 500 }, { src: isSemibold, fontWeight: 600 }, { src: isBold, fontWeight: 700 },
    ],
  });
  // Never split an area or category name across lines mid-word.
  Font.registerHyphenationCallback((word) => [word]);
}
