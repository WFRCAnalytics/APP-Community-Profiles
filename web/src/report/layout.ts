// Where each panel goes in a page's grid (pure, so it is unit tested). The grid is 2 columns by 3 rows in portrait and 3 by 2 in
// landscape, the dashboard's own three-column layout.
import type { Orientation, Panel } from "./model";

export interface Placed { panel: Panel; col: number; row: number; cs: number; rs: number }

/** Row-major packing: each panel goes in the first free cell where its span fits. Panels that do not fit are named in `dropped`
 * rather than lost silently. */
export function placePanels(panels: Panel[], o: Orientation, dropped: string[] = []): Placed[] {
  const cols = o === "portrait" ? 2 : 3, rows = o === "portrait" ? 3 : 2;
  const used = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const out: Placed[] = [];
  for (const panel of panels) {
    const [cs0, rs0] = panel.span?.[o] ?? [1, 1];
    const cs = Math.min(cs0, cols), rs = Math.min(rs0, rows);
    let spot: [number, number] | null = null;
    search: for (let r = 0; r + rs <= rows; r++) for (let c = 0; c + cs <= cols; c++) {
      let free = true;
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) if (used[r + i][c + j]) free = false;
      if (free) { spot = [r, c]; break search; }
    }
    if (!spot) { dropped.push(panel.title); continue; }
    for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) used[spot[0] + i][spot[1] + j] = true;
    out.push({ panel, row: spot[0], col: spot[1], cs, rs });
  }
  return out;
}

