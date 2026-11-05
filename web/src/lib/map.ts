// The map: MapLibre GL over the OpenFreeMap basemap (Positron in light mode, Dark in dark mode) with a choropleth of one
// indicator. If the basemap cannot be fetched the polygons still draw on a plain background.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// The worker is served as a file of its own, so it loads the same in dev, preview and the built site.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

export const STYLES = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
import { makeTooltip } from "./charts";
import type { Method } from "./format";
import { BIVARIATE, COMPARED, NO_DATA, RAMPS, SELECTED, biColour, colourFor, quantileBreaks, type Mode } from "./classes";
export { BIVARIATE, COMPARED, SELECTED, RAMPS, colourFor, quantileBreaks };
export type { Mode };

export const BLANK = (mode: Mode) => ({
  version: 8 as const,
  sources: {},
  layers: [{ id: "bg", type: "background" as const, paint: { "background-color": mode === "dark" ? "#0A1F2E" : "#EEF2F5" } }],
});

export interface Legend {
  title: string;
  items: { color: string; text: string }[];
  edges: number[]; // class boundaries, min first and max last
  colors: string[]; // one colour per class
  bi?: { cutsA: number[]; cutsB: number[]; rows: string[][] }; // set for a bivariate map
}

export interface MapView {
  layer: "areas" | "tracts";
  shapes: GeoJSON.FeatureCollection; // the polygons being coloured
  focus: GeoJSON.FeatureCollection; // the selected (role "sel") and compared (role "cmp") areas
  values: Map<string, number | null>;
  values2?: Map<string, number | null>; // a second variable draws a bivariate map
  history?: Map<string, { x: number; y: number }[]>; // each area's value in every period, for the trend line in the hover tooltip
  details?: Map<string, { moe: number | null; method: Method }>; // margin of error and method of each area's value, for the hover tooltip
  period?: number; // the period the map shows, ringed on that trend line
  bounds?: [[number, number], [number, number]]; // fit here instead of to the selected areas
  names: Map<string, string>;
  format: (v: number | null | undefined) => string;
  label: string;
  fitKey: string; // refit the map when this changes
  onSelect?: (id: string, shift: boolean) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Bounds of every coordinate in a feature collection, or null when it has none.
export function boundsOf(fc: GeoJSON.FeatureCollection): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  const extend = (c: any) => (typeof c[0] === "number" ? bounds.extend(c) : c.forEach(extend));
  fc.features.forEach((f) => extend((f.geometry as any).coordinates));
  return bounds.isEmpty() ? null : bounds;
}

const ICON = (paths: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// Zoom, compass and a zoom-to-selected button at the top right of every map. The compass needle tilts with the map; clicking it
// resets the view as well as north and tilt, so there is one control for getting back.
export function addViewControls(map: maplibregl.Map, reset: () => void, selected: () => void) {
  const nav = new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true });
  map.addControl(nav, "top-right");
  const compass = (nav as any)._container?.querySelector(".maplibregl-ctrl-compass") as HTMLButtonElement | null;
  if (compass) {
    compass.title = "Reset the view, north and tilt";
    compass.setAttribute("aria-label", "Reset the view, north and tilt");
    compass.addEventListener("click", (e) => { e.stopImmediatePropagation(); reset(); }, true);
  }
  map.addControl(new ZoomToControl(selected), "top-right");
}

// A map control button, drawn like the zoom and compass buttons, that zooms to the selected area.
export class ZoomToControl implements maplibregl.IControl {
  private el?: HTMLDivElement;
  constructor(private onClick: () => void) {}
  onAdd() {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl maplibregl-ctrl-group ctrl-reset";
    const b = document.createElement("button");
    b.type = "button";
    b.title = "Zoom to the selected area";
    b.setAttribute("aria-label", "Zoom to the selected area");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/></svg>';
    b.addEventListener("click", this.onClick);
    el.append(b);
    this.el = el;
    return el;
  }
  onRemove() {
    this.el?.remove();
  }
}

export class MapController {
  map: maplibregl.Map;
  mode: Mode;
  view: MapView | null = null;
  onLegend: (l: Legend | null) => void = () => {};
  private fitted = "";
  private lastFit: { bounds: maplibregl.LngLatBounds; padding: number } | null = null;
  private tooltip: ReturnType<typeof makeTooltip>;
  private styleToken = 0;
  private handlersBound = false;

  constructor(container: HTMLElement, mode: Mode) {
    this.mode = mode;
    this.map = new maplibregl.Map({
      container, style: BLANK(mode) as any, center: [-111.9, 40.7], zoom: 8, attributionControl: { compact: true },
    });
    this.tooltip = makeTooltip(this.map.getContainer());
    this.map.getContainer().append(this.tooltip.tip);
    addViewControls(this.map, () => this.resetView(), () => this.zoomToSelected());
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-left");
    this.map.on("error", (e) => console.warn("map:", e.error?.message ?? e));
    new ResizeObserver(() => this.map.resize()).observe(container);
    this.loadStyle(mode);
  }

  private async loadStyle(mode: Mode) {
    const token = ++this.styleToken;
    let style: any = BLANK(mode);
    try {
      const r = await fetch(STYLES[mode]);
      if (r.ok) style = await r.json();
    } catch { /* offline: plain background */ }
    if (token !== this.styleToken) return;
    this.shapeKey = "";
    this.map.setStyle(style, { diff: false });
    const ready = () => {
      if (token !== this.styleToken) return;
      this.install();
      this.render();
    };
    if (this.map.isStyleLoaded()) ready(); else this.map.once("style.load", ready);
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.loadStyle(mode);
  }

  // Sources and layers are added above the basemap fills but below its labels.
  private install() {
    const map = this.map;
    if (map.getSource("areas")) return;
    const mode = this.mode;
    // Data goes above the basemap's roads and water but below its labels: the first label layer after the last non-label one.
    const layers = map.getStyle().layers;
    const lastShape = layers.reduce((n, l, i) => (l.type === "symbol" ? n : i), -1);
    const before = layers.slice(lastShape + 1).find((l) => l.type === "symbol")?.id;
    for (const id of ["areas", "tracts", "focus"]) map.addSource(id, { type: "geojson", data: EMPTY, promoteId: "id" });
    if (mode === "dark") {
      // A scrim over the dark basemap keeps its roads and labels quiet so the data reads first.
      map.addLayer({ id: "scrim", type: "background", paint: { "background-color": "#0A1F2E", "background-opacity": 0.38 } }, before);
    }
    const add = (layer: maplibregl.LayerSpecification) => map.addLayer(layer, before);
    const line = mode === "dark" ? "#0A1F2E" : "#FFFFFF";
    add({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": NO_DATA[mode], "fill-opacity": 0.88, "fill-color-transition": { duration: 600, delay: 0 } } });
    add({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": line, "line-width": 0.8, "line-opacity": 0.9 } });
    add({ id: "tracts-fill", type: "fill", source: "tracts", paint: { "fill-color": NO_DATA[mode], "fill-opacity": 0.88, "fill-color-transition": { duration: 600, delay: 0 } } });
    add({ id: "tracts-line", type: "line", source: "tracts", paint: { "line-color": line, "line-width": 0.4, "line-opacity": 0.8 } });
    // Selected: a surface-coloured casing under a blue line. Compared: a dashed brick line.
    add({ id: "focus-casing", type: "line", source: "focus", paint: { "line-color": line, "line-width": 6, "line-opacity": 0.9 }, layout: { "line-join": "round" } });
    add({ id: "focus-cmp", type: "line", source: "focus", filter: ["==", ["get", "role"], "cmp"], paint: { "line-color": COMPARED[mode], "line-width": 3, "line-dasharray": [2, 1.2] }, layout: { "line-join": "round" } });
    add({ id: "focus-sel", type: "line", source: "focus", filter: ["==", ["get", "role"], "sel"], paint: { "line-color": SELECTED[mode], "line-width": 3.2 }, layout: { "line-join": "round" } });
    // County and place names sit above everything else.
    map.addLayer({
      id: "areas-label", type: "symbol", source: "areas",
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11.5, "text-max-width": 6, "text-allow-overlap": false },
      paint: { "text-color": mode === "dark" ? "#E8ECF3" : "#131A27", "text-halo-color": mode === "dark" ? "#0A1F2E" : "#FFFFFF", "text-halo-width": 1.6 },
    });
    this.bindHandlers();
  }

  // Layer events survive a style swap on the map object, so they are bound once.
  private bindHandlers() {
    if (this.handlersBound) return;
    this.handlersBound = true;
    const map = this.map;
    for (const layer of ["areas", "tracts"] as const) {
      map.on("mousemove", `${layer}-fill`, (e) => {
        const f = e.features?.[0];
        if (!f || !this.view || this.view.layer !== layer) return;
        map.getCanvas().style.cursor = layer === "areas" && this.view.onSelect ? "pointer" : "";
        const id = String(f.properties.id);
        const v = this.view.values.get(id), det = this.view.details?.get(id);
        const points = this.view.history?.get(id);
        const trend = points ? { points, at: this.view.period } : undefined;
        // Census tracts were redrawn in 2020, so a trend across that year joins two sets of boundaries.
        const foot = layer === "tracts" && points?.some((p) => p.x < 2020) && points.some((p) => p.x >= 2020) ? "Tract boundaries changed in 2020" : undefined;
        this.tooltip.showTip(e.originalEvent, { title: this.view.names.get(id) ?? id, rows: [{ value: v == null ? "No data" : this.view.format(v), color: "var(--accent)", sub: v == null ? undefined : this.view.label, moe: v == null || det?.moe == null ? undefined : `±${this.view.format(det.moe)}`, method: v == null ? undefined : det?.method }], trend, foot });
      });
      map.on("mouseleave", `${layer}-fill`, () => { this.tooltip.hideTip(); map.getCanvas().style.cursor = ""; });
      map.on("click", `${layer}-fill`, (e) => {
        if (layer === "areas" && this.view?.onSelect && e.features?.[0]) this.view.onSelect(String(e.features[0].properties.id), e.originalEvent.shiftKey);
      });
    }
  }

  update(view: MapView) {
    this.view = view;
    this.render();
  }

  private shapeKey = "";
  private render() {
    const view = this.view, map = this.map;
    if (!view || !map.getSource("areas")) return;
    const mode = this.mode;
    const areas = view.layer === "areas";
    const bi = !!view.values2;
    const cuts = quantileBreaks([...view.values.values()], bi ? 3 : 5);
    const cuts2 = bi ? quantileBreaks([...view.values2!.values()], 3) : [];
    const ids = view.shapes.features.map((f) => String(f.properties?.id));
    // The shapes only change with the layer, the extent or the selection; a new year only changes the colours, which fade.
    const key = `${view.layer}|${ids.length}|${ids[0]}|${ids.at(-1)}|${view.focus.features.map((f) => `${f.properties?.id}${f.properties?.role}`).join()}`;
    if (key !== this.shapeKey) {
      this.shapeKey = key;
      (map.getSource("areas") as maplibregl.GeoJSONSource).setData(areas ? view.shapes : EMPTY);
      (map.getSource("tracts") as maplibregl.GeoJSONSource).setData(areas ? EMPTY : view.shapes);
      (map.getSource("focus") as maplibregl.GeoJSONSource).setData(view.focus);
    }
    if (ids.length) {
      map.setPaintProperty(areas ? "areas-fill" : "tracts-fill", "fill-color",
        ["match", ["get", "id"], ...ids.flatMap((id) => [id, bi ? biColour(view.values.get(id), view.values2!.get(id), cuts, cuts2, mode) : colourFor(view.values.get(id), cuts, mode)]), NO_DATA[mode]] as any);
    }
    if (view.fitKey !== this.fitted && (view.bounds || view.focus.features.length)) {
      this.fitted = view.fitKey;
      const bounds = new maplibregl.LngLatBounds();
      const extend = (c: any) => (typeof c[0] === "number" ? bounds.extend(c) : c.forEach(extend));
      if (view.bounds) bounds.extend(view.bounds[0]).extend(view.bounds[1]);
      else view.focus.features.forEach((f) => extend((f.geometry as any).coordinates));
      map.resize();
      this.lastFit = { bounds, padding: view.bounds ? 12 : 56 };
      map.fitBounds(bounds, { padding: view.bounds ? 12 : 56, duration: 500, maxZoom: 12 });
    }
    map.setLayoutProperty("areas-label", "visibility", areas ? "visible" : "none");
    this.onLegend(this.legend(cuts, view, cuts2));
  }

  private legend(cuts: number[], view: MapView, cuts2: number[] = []): Legend | null {
    const values = [...view.values.values()].filter((v): v is number => v != null && Number.isFinite(v));
    if (!values.length) return null;
    const lo = Math.min(...values), hi = Math.max(...values);
    const ramp = RAMPS[this.mode];
    const flat = lo === hi;
    const edges = flat ? [lo, hi] : [lo, ...cuts, hi];
    const classes = flat ? 1 : cuts.length + 1;
    const colors = Array.from({ length: classes }, (_, i) => ramp[Math.round((i / Math.max(1, classes - 1)) * (ramp.length - 1))]);
    const bi = view.values2 ? { cutsA: cuts, cutsB: cuts2, rows: [...BIVARIATE[this.mode]].reverse().map((r) => [...r]) } : undefined;
    return { title: view.label, bi, edges, colors, items: colors.map((color, i) => ({ color, text: `${view.format(edges[i])} – ${view.format(edges[i + 1])}` })) };
  }

  // Back to the extent the map was last fitted to, facing north.
  resetView() {
    if (!this.lastFit) return;
    this.map.fitBounds(this.lastFit.bounds, { padding: this.lastFit.padding, duration: 500, maxZoom: 12, bearing: 0, pitch: 0 });
  }

  // Close on the selected areas (not the compared ones), whatever extent the map was fitted to.
  zoomToSelected() {
    const focus = this.view?.focus;
    if (!focus) return;
    const sel = { ...focus, features: focus.features.filter((f) => f.properties?.role === "sel") };
    const bounds = boundsOf(sel.features.length ? sel : focus);
    if (bounds) this.map.fitBounds(bounds, { padding: 56, duration: 500, maxZoom: 12, bearing: 0, pitch: 0 });
  }

  destroy() {
    this.map.remove();
  }
}
