// The shape of the chosen area, drawn from its real boundary inside an outline of Utah. Small places (a town) would
// vanish at this scale, so they also get a ring marker.
import { geoMercator, geoPath } from "d3-geo";

export interface Silhouette {
  state: string;
  shape: string | null;
  other: string | null;
  ring: { cx: number; cy: number } | null;
  width: number;
  height: number;
}

export function silhouette({ state, shape = null, other = null, width = 104, height = 120 }: { state: any; shape?: any; other?: any; width?: number; height?: number }): Silhouette {
  const projection = geoMercator().fitExtent([[4, 4], [width - 4, height - 4]], state);
  const path = geoPath(projection);
  let ring: Silhouette["ring"] = null;
  if (shape && path.area(shape) < 90) {
    const [cx, cy] = path.centroid(shape);
    if (Number.isFinite(cx)) ring = { cx, cy };
  }
  return { state: path(state) ?? "", shape: shape ? path(shape) : null, other: other ? path(other) : null, ring, width, height };
}
