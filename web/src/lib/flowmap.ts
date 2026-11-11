// The commute flow map: lines from one area to the areas where its workers live and work, drawn with Flowmap.gl over a MapLibre
// basemap. It has a map of its own (the choropleth controller in map.ts is built around shaded polygons). deck.gl and Flowmap.gl
// are large, so they are fetched only when this map is first opened.
import * as maplibregl from "maplibre-gl";
import { makeTooltip, type TipData } from "./charts";
import { FLOW_RAMPS, HIGHLIGHT, SELECTED, type Mode } from "./classes";
import type { MapFlow } from "./flows";
import { flowViewFrame } from "../report/geo";
import { BLANK, STYLES, addViewControls, boundsOf } from "./map";

export interface FlowPlace { id: string; name: string; lon: number; lat: number }
export interface FlowTotals { incoming: number; outgoing: number; within: number }
export type FlowTip =
  | { kind: "flow"; origin: string; dest: string; count: number }
  | { kind: "place"; id: string; name: string; totals: FlowTotals };

export interface FlowView {
  places: FlowPlace[];
  flows: MapFlow[];
  selId: string;
  shapes: GeoJSON.FeatureCollection;   // outlines of every area of the type
  focus: GeoJSON.FeatureCollection;    // the selected area
  rest: GeoJSON.FeatureCollection;     // the state outside every area of the type, drawn dashed
  fitKey: string;                      // refit the map when this changes
  animate: boolean;                    // moving dashes along the routes instead of solid lines
  tip: (t: FlowTip) => TipData | string;
  onSelect: (id: string) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export class FlowMapController {
  map: maplibregl.Map;
  mode: Mode;
  private view: FlowView | null = null;
  private overlay: any = null;
  private FlowmapLayer: any = null;
  private tooltip: ReturnType<typeof makeTooltip>;
  private styleToken = 0;
  private fitted = "";
  private bounds: maplibregl.LngLatBounds | null = null;
  private gone = false;
  private touched = false;                 // the reader has panned or zoomed since the view was last framed

  constructor(container: HTMLElement, mode: Mode) {
    this.mode = mode;
    this.map = new maplibregl.Map({ container, style: BLANK(mode) as any, center: [-111.9, 40.7], zoom: 7, attributionControl: { compact: true } });
    addViewControls(this.map, () => this.fit(true), () => this.zoomToSelected());
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-left");
    this.map.on("error", (e) => console.warn("flow map:", e.error?.message ?? e));
    // The panel is laid out after the map is made (figures, legend), so the frame fitted at first is stale once the box settles:
    // refit on resize until the reader takes the map over.
    new ResizeObserver(() => { this.map.resize(); if (!this.touched && this.bounds) this.fit(false); }).observe(container);
    this.map.on("movestart", (e) => { if ((e as any).originalEvent) this.touched = true; });
    this.tooltip = makeTooltip(this.map.getContainer());
    this.map.getContainer().append(this.tooltip.tip);
    Promise.all([import("@deck.gl/mapbox"), import("@flowmap.gl/layers")]).then(([m, f]) => {
      if (this.gone) return;
      this.FlowmapLayer = f.FlowmapLayer;
      // Not interleaved: deck.gl draws on its own canvas above the basemap, which keeps it independent of the MapLibre version.
      this.overlay = new m.MapboxOverlay({ interleaved: false, layers: [], getCursor: ({ isHovering }: { isHovering: boolean }) => (isHovering ? "pointer" : "grab") });
      this.map.addControl(this.overlay);
      this.render();
    }).catch((e) => console.error("flow map libraries:", e));
    this.loadStyle(mode);
  }

  private async loadStyle(mode: Mode) {
    const token = ++this.styleToken;
    let style: any = BLANK(mode);
    try {
      const r = await fetch(STYLES[mode]);
      if (r.ok) style = await r.json();
    } catch { /* offline: plain background */ }
    if (token !== this.styleToken || this.gone) return;
    this.map.setStyle(style, { diff: false });
    const ready = () => { if (token === this.styleToken && !this.gone) { this.install(); this.render(); } };
    if (this.map.isStyleLoaded()) ready(); else this.map.once("style.load", ready);
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.loadStyle(mode);
    this.render();
  }

  // The area outlines and the selected area go above the basemap's roads and water but below its labels.
  private install() {
    const map = this.map;
    if (map.getSource("flow-areas")) return;
    const layers = map.getStyle().layers;
    const lastShape = layers.reduce((n, l, i) => (l.type === "symbol" ? n : i), -1);
    const before = layers.slice(lastShape + 1).find((l) => l.type === "symbol")?.id;
    for (const id of ["flow-rest", "flow-areas", "flow-focus"]) map.addSource(id, { type: "geojson", data: EMPTY });
    const dark = this.mode === "dark";
    if (dark) map.addLayer({ id: "flow-scrim", type: "background", paint: { "background-color": "#0A1F2E", "background-opacity": 0.38 } }, before);
    map.addLayer({ id: "flow-rest-fill", type: "fill", source: "flow-rest", paint: { "fill-color": dark ? "#5b7184" : "#aab7c4", "fill-opacity": dark ? 0.2 : 0.28 } }, before);
    map.addLayer({ id: "flow-rest-line", type: "line", source: "flow-rest", paint: { "line-color": dark ? "#9db2c4" : "#5d7188", "line-width": 1.6, "line-dasharray": [3, 2] } }, before);
    map.addLayer({ id: "flow-areas-line", type: "line", source: "flow-areas", paint: { "line-color": dark ? "#5b7184" : "#aab7c4", "line-width": 0.7, "line-opacity": 0.7 } }, before);
    map.addLayer({ id: "flow-focus-fill", type: "fill", source: "flow-focus", paint: { "fill-color": SELECTED[this.mode], "fill-opacity": dark ? 0.2 : 0.14 } }, before);
    map.addLayer({ id: "flow-focus-line", type: "line", source: "flow-focus", paint: { "line-color": SELECTED[this.mode], "line-width": 2.2 }, layout: { "line-join": "round" } }, before);
  }

  update(view: FlowView) {
    this.view = view;
    this.render();
  }

  private render() {
    const view = this.view;
    if (!view) return;
    const src = (id: string, data: GeoJSON.FeatureCollection) => (this.map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    src("flow-areas", view.shapes);
    src("flow-focus", view.focus);
    src("flow-rest", view.rest);
    if (this.overlay && this.FlowmapLayer) this.overlay.setProps({ layers: [this.layer(view)] });
    this.measure(view);
    if (view.fitKey !== this.fitted && this.bounds) { this.fitted = view.fitKey; this.fit(false); }
  }

  private layer(view: FlowView) {
    const dark = this.mode === "dark";
    return new this.FlowmapLayer({
      id: "flowmap",
      data: { locations: view.places, flows: view.flows },
      getLocationId: (p: FlowPlace) => p.id, getLocationName: (p: FlowPlace) => p.name, getLocationLon: (p: FlowPlace) => p.lon, getLocationLat: (p: FlowPlace) => p.lat,
      getFlowOriginId: (f: MapFlow) => f.origin, getFlowDestId: (f: MapFlow) => f.dest, getFlowMagnitude: (f: MapFlow) => f.count,
      colorScheme: [...FLOW_RAMPS[this.mode]], darkMode: dark,
      flowLinesRenderingMode: view.animate ? "animated-straight" : "straight", flowLineThicknessScale: 1.5,
      fadeEnabled: true, fadeAmount: 15, adaptiveScalesEnabled: true,
      locationTotalsEnabled: true, locationLabelsEnabled: false, clusteringEnabled: false,
      highlightColor: HIGHLIGHT[this.mode], maxTopFlowsDisplayNum: 5000, pickable: true,
      onHover: (info: any, event: any) => {
        // deck.gl passes MapLibre's event; the DOM event with the cursor position is inside it.
        const o = info?.object, e = (event?.srcEvent?.originalEvent ?? event?.srcEvent) as MouseEvent | undefined;
        if (!o || !e) { this.tooltip.hideTip(); return; }
        const t: FlowTip = o.type === "flow"
          ? { kind: "flow", origin: String(o.origin.id), dest: String(o.dest.id), count: o.count }
          : { kind: "place", id: String(o.id), name: o.name, totals: { incoming: o.totals.incomingCount, outgoing: o.totals.outgoingCount, within: o.totals.internalCount } };
        this.tooltip.showTip(e as PointerEvent, view.tip(t));
      },
      onClick: (info: any) => {
        const o = info?.object;
        if (o?.type === "location" && String(o.id) !== view.selId) view.onSelect(String(o.id));
      },
    });
  }

  // The view that frames the area and the routes that matter (see flowViewFrame), so one long thin route to another part of the state
  // does not shrink the area to a dot.
  private measure(view: FlowView) {
    const f = flowViewFrame(view.flows, view.places, view.selId, view.focus.features[0] ?? null);
    this.bounds = f ? new maplibregl.LngLatBounds([f.w, f.s], [f.e, f.n]) : null;
  }

  fit(animate: boolean) {
    this.touched = false;
    if (!this.bounds) return;
    const single = this.bounds.getSouthWest().distanceTo(this.bounds.getNorthEast()) < 1;
    if (single) this.map.easeTo({ center: this.bounds.getCenter(), zoom: 9, duration: animate ? 600 : 0 });
    else this.map.fitBounds(this.bounds, { padding: 40, maxZoom: 11, duration: animate ? 600 : 0, bearing: 0, pitch: 0 });
  }

  // Close on the selected area alone.
  zoomToSelected() {
    this.touched = true;
    const b = this.view && boundsOf(this.view.focus);
    if (b) this.map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 600, bearing: 0, pitch: 0 });
    else if (this.view) {
      const p = this.view.places.find((q) => q.id === this.view!.selId);
      if (p) this.map.easeTo({ center: [p.lon, p.lat], zoom: 9, duration: 600 });
    }
  }

  destroy() {
    this.gone = true;
    this.map.remove();
  }
}
