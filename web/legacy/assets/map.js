// The dashboard map: MapLibre GL over an open basemap, with a choropleth of one indicator.
//
// One map is created once and updated as the reader changes the area, layer or indicator. If the basemap
// cannot be fetched the polygons still draw on a plain background.

const VERSION = "4.7.1";
const BASE = `https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist`;
const STYLE = "https://tiles.openfreemap.org/styles/positron";
// Light to dark, one hue (the brand blue), five classes.
const RAMP = ["#E3EEF6", "#A9CCE3", "#6AA6CC", "#2F78AB", "#00395B"];
const NO_DATA = "#D5D9DD";
const OUTLINE = "#16232C";

let loading;
// MapLibre as an ES module: Quarto pages carry RequireJS, which would swallow the UMD build, and hiding
// `define` while it loads would break Observable's own module loader.
function loadMapLibre() {
  loading ??= import(`https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/+esm`).then((mod) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = `${BASE}/maplibre-gl.css`;
    document.head.append(css);
    return mod.default ?? mod;
  });
  return loading;
}

const BLANK = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#EEF2F5" } }] };

async function basemapStyle() {
  try {
    const r = await fetch(STYLE);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch { return BLANK; }
}

export function quantileBreaks(values, classes = 5) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const cuts = [];
  for (let i = 1; i < classes; i++) cuts.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))]);
  return [...new Set(cuts)];   // equal cut points collapse into fewer classes
}

const classIndex = (value, cuts) => cuts.filter((c) => value >= c).length;

export function colourFor(value, cuts) {
  if (value == null || !Number.isFinite(value)) return NO_DATA;
  return RAMP[Math.min(RAMP.length - 1, Math.round((classIndex(value, cuts) / Math.max(1, cuts.length)) * (RAMP.length - 1)))];
}

export async function createMap() {
  const maplibregl = await loadMapLibre();
  const el = document.createElement("div");
  el.className = "pf-map";
  const holder = document.createElement("div");
  holder.className = "pf-map-canvas";
  const legendEl = document.createElement("div");
  legendEl.className = "pf-map-legend";
  el.append(holder, legendEl);

  const map = new maplibregl.Map({ container: holder, style: await basemapStyle(), center: [-111.9, 40.7], zoom: 8,
                                   attributionControl: { compact: true }, cooperativeGestures: true });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  // The map is built before its element is in the page, so it must follow the container's real size.
  let fitted = null;
  new ResizeObserver(() => { map.resize(); if (fitted) map.fitBounds(fitted, { padding: 48, duration: 0, maxZoom: 12 }); }).observe(el);
  map.on("error", (e) => console.error("map:", e.error?.message ?? e));
  el._map = map;   // handle for debugging in the browser console
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  const ready = new Promise((resolve) => map.on("load", resolve));
  const empty = { type: "FeatureCollection", features: [] };
  let state = { names: new Map(), format: String, label: "", onSelect: null, layer: "areas" };

  ready.then(() => {
    const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    for (const id of ["areas", "tracts", "selected"]) map.addSource(id, { type: "geojson", data: empty, promoteId: "id" });
    const fill = (id, source, opacity) => map.addLayer({
      id, type: "fill", source, paint: { "fill-color": NO_DATA, "fill-opacity": opacity },
    }, firstSymbol);
    const line = (id, source, color, width, opacity = 1) => map.addLayer({
      id, type: "line", source, paint: { "line-color": color, "line-width": width, "line-opacity": opacity },
    }, firstSymbol);
    fill("areas-fill", "areas", 0.78);
    line("areas-line", "areas", "#FFFFFF", 0.8, 0.9);
    fill("tracts-fill", "tracts", 0.78);
    line("tracts-line", "tracts", "#FFFFFF", 0.4, 0.8);
    line("selected-line", "selected", OUTLINE, 2.6);
    for (const layer of ["areas", "tracts"]) {
      map.on("mousemove", `${layer}-fill`, (e) => {
        const f = e.features?.[0];
        if (!f || state.layer !== layer) return;
        map.getCanvas().style.cursor = layer === "areas" && state.onSelect ? "pointer" : "";
        const id = f.properties.id;
        const v = state.values?.get(id);
        popup.setLngLat(e.lngLat)
          .setHTML("")
          .addTo(map);
        const box = popup.getElement().querySelector(".maplibregl-popup-content");
        const strong = document.createElement("strong");
        strong.textContent = state.names.get(id) ?? id;
        const small = document.createElement("div");
        small.textContent = `${state.label}: ${v == null ? "no data" : state.format(v)}`;
        box.replaceChildren(strong, small);
      });
      map.on("mouseleave", `${layer}-fill`, () => { popup.remove(); map.getCanvas().style.cursor = ""; });
      map.on("click", `${layer}-fill`, (e) => {
        if (layer === "areas" && state.onSelect && e.features?.[0]) state.onSelect(e.features[0].properties.id);
      });
    }
  });

  // Draw one layer. geojson: {areas, tracts, selected}; values: Map(id -> number) for the shown layer.
  async function update({ layer, areas, tracts, selected, values, names, format, label, onSelect }) {
    await ready;
    state = { names, format, label, onSelect, layer, values };
    const showAreas = layer === "areas";
    const cuts = quantileBreaks([...values.values()]);
    const expression = (ids) => ["match", ["get", "id"], ...ids.flatMap((id) => [id, colourFor(values.get(id), cuts)]), NO_DATA];
    map.getSource("areas").setData(showAreas ? areas : empty);
    map.getSource("tracts").setData(showAreas ? empty : tracts);
    map.getSource("selected").setData(selected ?? empty);
    const shown = (showAreas ? areas : tracts).features.map((f) => f.properties.id);
    if (shown.length) map.setPaintProperty(showAreas ? "areas-fill" : "tracts-fill", "fill-color", expression(shown));
    if (selected?.features?.length) {
      const bounds = new maplibregl.LngLatBounds();
      const extend = (c) => (typeof c[0] === "number" ? bounds.extend(c) : c.forEach(extend));
      selected.features.forEach((f) => extend(f.geometry.coordinates));
      fitted = bounds;
      map.resize();
      map.fitBounds(bounds, { padding: 48, duration: 500, maxZoom: 12 });
    }
    renderLegend(cuts, values, format, label);
  }

  function renderLegend(cuts, values, format, label) {
    legendEl.replaceChildren();
    const title = document.createElement("div");
    title.className = "pf-map-legend-title";
    title.textContent = label;
    legendEl.append(title);
    const edges = [Math.min(...values.values()), ...cuts, Math.max(...values.values())];
    if (!values.size) { title.textContent = `${label}: no data`; return; }
    const classes = cuts.length + 1;
    for (let i = 0; i < classes; i++) {
      const row = document.createElement("div");
      row.className = "pf-map-legend-row";
      const swatch = document.createElement("span");
      swatch.className = "pf-map-swatch";
      swatch.style.background = RAMP[Math.round((i / Math.max(1, classes - 1)) * (RAMP.length - 1))];
      row.append(swatch, document.createTextNode(`${format(edges[i])} – ${format(edges[i + 1])}`));
      legendEl.append(row);
    }
  }

  return { el, update, map };
}
