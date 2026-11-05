// The map: MapLibre GL over the OpenFreeMap basemap (Positron in light mode, Dark in dark mode) with a choropleth of one
// indicator. If the basemap cannot be fetched the polygons still draw on a plain background.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// The worker is served as a file of its own, so it loads the same in dev, preview and the built site.
maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

const STYLES = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
import { COMPARED, NO_DATA, RAMPS, SELECTED, colourFor, quantileBreaks, type Mode } from "./classes";
export { COMPARED, SELECTED, RAMPS, colourFor, quantileBreaks };
export type { Mode };

const BLANK = (mode: Mode) => ({
  version: 8 as const,
  sources: {},
  layers: [{ id: "bg", type: "background" as const, paint: { "background-color": mode === "dark" ? "#0A1F2E" : "#EEF2F5" } }],
});

export interface Legend {
  title: string;
  items: { color: string; text: string }[];
}

export interface MapView {
  layer: "areas" | "tracts";
  shapes: GeoJSON.FeatureCollection; // the polygons being coloured
  focus: GeoJSON.FeatureCollection; // the selected (role "sel") and compared (role "cmp") areas
  values: Map<string, number | null>;
  names: Map<string, string>;
  format: (v: number | null | undefined) => string;
  label: string;
  fitKey: string; // refit the map when this changes
  onSelect?: (id: string, shift: boolean) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export class MapController {
  map: maplibregl.Map;
  mode: Mode;
  view: MapView | null = null;
  onLegend: (l: Legend | null) => void = () => {};
  private fitted = "";
  private popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "map-popup" });
  private styleToken = 0;
  private handlersBound = false;

  constructor(container: HTMLElement, mode: Mode) {
    this.mode = mode;
    this.map = new maplibregl.Map({
      container, style: BLANK(mode) as any, center: [-111.9, 40.7], zoom: 8, attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
    add({ id: "areas-fill", type: "fill", source: "areas", paint: { "fill-color": NO_DATA[mode], "fill-opacity": 0.82 } });
    add({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": line, "line-width": 0.8, "line-opacity": 0.9 } });
    add({ id: "tracts-fill", type: "fill", source: "tracts", paint: { "fill-color": NO_DATA[mode], "fill-opacity": 0.82 } });
    add({ id: "tracts-line", type: "line", source: "tracts", paint: { "line-color": line, "line-width": 0.4, "line-opacity": 0.8 } });
    // Selected: a surface-coloured casing under a blue line. Compared: a dashed brick line.
    add({ id: "focus-casing", type: "line", source: "focus", paint: { "line-color": line, "line-width": 6, "line-opacity": 0.9 }, layout: { "line-join": "round" } });
    add({ id: "focus-cmp", type: "line", source: "focus", filter: ["==", ["get", "role"], "cmp"], paint: { "line-color": COMPARED[mode], "line-width": 3, "line-dasharray": [2, 1.2] }, layout: { "line-join": "round" } });
    add({ id: "focus-sel", type: "line", source: "focus", filter: ["==", ["get", "role"], "sel"], paint: { "line-color": SELECTED[mode], "line-width": 3.2 }, layout: { "line-join": "round" } });
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
        const v = this.view.values.get(id);
        const box = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = this.view.names.get(id) ?? id;
        const small = document.createElement("div");
        small.textContent = `${this.view.label}: ${v == null ? "no data" : this.view.format(v)}`;
        box.append(strong, small);
        this.popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      });
      map.on("mouseleave", `${layer}-fill`, () => { this.popup.remove(); map.getCanvas().style.cursor = ""; });
      map.on("click", `${layer}-fill`, (e) => {
        if (layer === "areas" && this.view?.onSelect && e.features?.[0]) this.view.onSelect(String(e.features[0].properties.id), e.originalEvent.shiftKey);
      });
    }
  }

  update(view: MapView) {
    this.view = view;
    this.render();
  }

  private render() {
    const view = this.view, map = this.map;
    if (!view || !map.getSource("areas")) return;
    const mode = this.mode;
    const areas = view.layer === "areas";
    const cuts = quantileBreaks([...view.values.values()]);
    (map.getSource("areas") as maplibregl.GeoJSONSource).setData(areas ? view.shapes : EMPTY);
    (map.getSource("tracts") as maplibregl.GeoJSONSource).setData(areas ? EMPTY : view.shapes);
    (map.getSource("focus") as maplibregl.GeoJSONSource).setData(view.focus);
    const ids = view.shapes.features.map((f) => String(f.properties?.id));
    if (ids.length) {
      map.setPaintProperty(areas ? "areas-fill" : "tracts-fill", "fill-color",
        ["match", ["get", "id"], ...ids.flatMap((id) => [id, colourFor(view.values.get(id), cuts, mode)]), NO_DATA[mode]] as any);
    }
    if (view.fitKey !== this.fitted && view.focus.features.length) {
      this.fitted = view.fitKey;
      const bounds = new maplibregl.LngLatBounds();
      const extend = (c: any) => (typeof c[0] === "number" ? bounds.extend(c) : c.forEach(extend));
      view.focus.features.forEach((f) => extend((f.geometry as any).coordinates));
      map.resize();
      map.fitBounds(bounds, { padding: 56, duration: 500, maxZoom: 12 });
    }
    this.onLegend(this.legend(cuts, view));
  }

  private legend(cuts: number[], view: MapView): Legend | null {
    const values = [...view.values.values()].filter((v): v is number => v != null && Number.isFinite(v));
    if (!values.length) return null;
    if (Math.min(...values) === Math.max(...values)) return { title: view.label, items: [{ color: RAMPS[this.mode][2], text: view.format(values[0]) }] };
    const edges = [Math.min(...values), ...cuts, Math.max(...values)];
    const ramp = RAMPS[this.mode];
    const classes = cuts.length + 1;
    return {
      title: view.label,
      items: Array.from({ length: classes }, (_, i) => ({
        color: ramp[Math.round((i / Math.max(1, classes - 1)) * (ramp.length - 1))],
        text: `${view.format(edges[i])} – ${view.format(edges[i + 1])}`,
      })),
    };
  }

  destroy() {
    this.map.remove();
  }
}
