// The shape of the chosen area, drawn from its real boundary and placed inside an outline of Utah.
// Small places (a town) would vanish at this scale, so they also get a ring marker.
import { geoMercator, geoPath } from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// state, shape, other: GeoJSON features (other = the area being compared, optional).
export function placeMark({ state, shape, other = null, width = 104, height = 120 }) {
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "pf-mark", "aria-hidden": "true", focusable: "false" });
  const projection = geoMercator().fitExtent([[4, 4], [width - 4, height - 4]], state);
  const path = geoPath(projection);
  svg.append(el("path", { d: path(state), class: "pf-mark-state" }));
  if (other) svg.append(el("path", { d: path(other), class: "pf-mark-other" }));
  if (shape) {
    svg.append(el("path", { d: path(shape), class: "pf-mark-shape" }));
    if (path.area(shape) < 90) {                      // too small to see: add a ring around its centre
      const [cx, cy] = path.centroid(shape);
      svg.append(el("circle", { cx, cy, r: 7, class: "pf-mark-ring" }));
    }
  }
  return svg;
}
