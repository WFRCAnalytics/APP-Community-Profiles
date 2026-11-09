// Lays the report out as a PDF with react-pdf. Every page is positioned in points from the geometry below, so the same data can
// be set in portrait or landscape; the grid is 2 columns by 3 rows in portrait and 3 by 2 in landscape (the dashboard's own
// three-column layout).
import { Document, Image, Link, Page, Path, Rect, Svg, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { geoMercator, geoPath } from "d3-geo";
import qrcode from "qrcode-generator";
import type { ReactElement } from "react";
import logoColor from "../assets/wfrc-color.png";
import logoWhite from "../assets/wfrc-white.png";
import { TYPE_LABEL } from "../lib/indicators";
import type { GridPage, Page as ReportPage, ReportModel, TablePage } from "./build";
import { BarChart, ColumnChart, DonutChart, LineChart, Pyramid, Sparkline, StackedChart } from "./charts";
import { ChoroplethMap, FlowDiagram, FlowRouteMap } from "./maps";
import { placePanels } from "./layout";
import type { Orientation, Panel, PanelData, Tile } from "./model";
import { C, F, METHOD_STYLE } from "./theme";

const SIZE: Record<Orientation, { W: number; H: number }> = { portrait: { W: 612, H: 792 }, landscape: { W: 792, H: 612 } };
const M = 36, TOP = 46, BOTTOM = 40, GAP = 10, TILE_H = 52;

const body = (size: number, extra: object = {}) => ({ fontFamily: F.body, fontSize: size, color: C.ink, ...extra });
const display = (size: number, extra: object = {}) => ({ fontFamily: F.display, fontSize: size, color: C.navy, fontWeight: 700 as const, ...extra });

// ---- running furniture --------------------------------------------------------------------------------------------

function Furniture({ m, section }: { m: ReportModel; section: string }): ReactElement {
  const { cmp, sel } = m.ctx;
  return (
    <>
      <View style={{ position: "absolute", left: M, right: M, top: 18, height: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 0.75, borderBottomColor: C.border, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Image src={logoColor} style={{ width: 22, height: 12.5 }} />
          <Text style={body(6.6, { color: C.muted, fontWeight: 600 })}>{sel.label}{cmp ? ` compared with ${cmp.label}` : ""} · Community profile</Text>
        </View>
        <Text style={body(6.6, { color: C.muted, fontWeight: 600 })}>{section}</Text>
      </View>
      <View style={{ position: "absolute", left: M, right: M, bottom: 18, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: C.border, paddingTop: 4 }}>
        <Text style={body(6.2, { color: C.muted })}>Wasatch Front Regional Council · {m.generated}</Text>
        <Text style={body(6.2, { color: C.muted })} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

function Heading({ m, kicker, title, w }: { m: ReportModel; kicker: string; title: string; w: number }): ReactElement {
  const { sel, cmp } = m.ctx;
  return (
    <View style={{ position: "absolute", left: M, top: TOP, width: w, height: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={body(6.6, { color: C.sel, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" })}>{kicker}</Text>
        <Text style={display(19, { lineHeight: 1.1, marginTop: 1 })}>{title}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 9, paddingBottom: 3 }}>
        {[sel, ...(cmp ? [cmp] : [])].map((a, i) => (
          <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            {cmp && <View style={{ width: 6.5, height: 6.5, borderRadius: 1.5, backgroundColor: i ? C.cmp : C.sel }} />}
            <Text style={body(6.6, { color: C.muted, fontWeight: 500 })}>{a.label}</Text>
          </View>
        ))}
        <Text style={body(6.6, { color: C.muted })}>{m.ctx.v - 4}–{m.ctx.v}</Text>
      </View>
    </View>
  );
}

// ---- tiles --------------------------------------------------------------------------------------------------------

function MethodChip({ method }: { method: Tile["method"] }): ReactElement | null {
  if (!method) return null;
  const s = METHOD_STYLE[method];
  return <Text style={body(5.2, { fontWeight: 700, color: s.ink, backgroundColor: s.bg, paddingHorizontal: 2.5, paddingVertical: 0.8, borderRadius: 2 })}>{s.letter}</Text>;
}

export function TileView({ t, w, h }: { t: Tile; w: number; h: number }): ReactElement {
  return (
    <View style={{ width: w, height: h, borderWidth: 0.75, borderColor: C.border, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: C.white }}>
      <Text style={body(5.4, { color: C.muted, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", lineHeight: 1.15, height: 12.5, maxLines: 2, textOverflow: "ellipsis" })}>{t.label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
        <Text style={display(Math.max(9, Math.min(14.5, (w - 18) / (t.value.length * 0.58 + 2.2))), { lineHeight: 1.15 })}>{t.value}</Text>
        <MethodChip method={t.method} />
      </View>
      <Text style={body(5.6, { color: C.muted, maxLines: 1, textOverflow: "ellipsis" })}>{t.meta}</Text>
      {t.compare && <Text style={body(6, { color: C.cmp, fontWeight: 600, maxLines: 1, textOverflow: "ellipsis" })}>{t.compare.label.split(" ")[0]} {t.compare.value}</Text>}
      {t.spark.length > 1 && <View style={{ position: "absolute", right: 6, bottom: 5 }}><Sparkline points={t.spark} w={Math.min(36, w * 0.28)} h={13} /></View>}
    </View>
  );
}

function Tiles({ tiles, w, top }: { tiles: Tile[]; w: number; top: number }): ReactElement | null {
  if (!tiles.length) return null;
  const tw = (w - 8 * (tiles.length - 1)) / tiles.length;
  return (
    <View style={{ position: "absolute", left: M, top, width: w, height: TILE_H, flexDirection: "row", gap: 8 }}>
      {tiles.map((t) => <TileView key={t.label} t={t} w={tw} h={TILE_H} />)}
    </View>
  );
}

// ---- panels -------------------------------------------------------------------------------------------------------

function Chart({ data, w, h }: { data: PanelData; w: number; h: number }): ReactElement | null {
  switch (data.kind) {
    case "bars": return <BarChart rows={data.rows} order={data.order} series={data.series} w={w} h={h} fmt={data.fmt} />;
    case "columns": return <ColumnChart rows={data.rows} order={data.order} series={data.series} w={w} h={h} fmt={data.fmt} />;
    case "donut": return <DonutChart rows={data.rows} order={data.order} series={data.series} w={w} h={h} fmt={data.fmt} />;
    case "stacked": return <StackedChart rows={data.rows} order={data.order} series={data.series} w={w} h={h} fmt={data.fmt} />;
    case "line": return <LineChart series={data.series} w={w} h={h} fmt={data.fmt} tick={data.tick} highlight={data.highlight} zero={data.zero} />;
    case "pyramid": return <Pyramid rows={data.rows} other={data.other} ages={data.ages} w={w} h={h} otherLabel={data.otherLabel} />;
    case "map": return <ChoroplethMap w={w} h={h - 9} uid={data.uid} tracts={data.tracts} values={data.values} cuts={data.cuts} area={data.area} tick={data.tick} context={data.context} names={data.names} />;
    case "flow": return <FlowRouteMap w={w} h={h - (data.outside ? 16 : 0)} uid={data.uid || "flow"} frame={data.frame} context={data.context} shapes={data.shapes} focusId={data.focusId} places={data.places} flows={data.flows} names={(id) => data.names.get(id) ?? id} fmt={data.fmt} />;
    case "flowsum": return <FlowDiagram w={w} h={h} out={data.out} inn={data.inn} outTitle={data.outTitle} innTitle={data.innTitle} fmt={data.fmt} />;
    default: return null;
  }
}

const noteLines = (note: string | undefined, w: number) => (note ? Math.min(4, Math.ceil((note.length * 5.4 * 0.5) / w)) : 0);

export function PanelView({ panel, w, h }: { panel: Panel; w: number; h: number }): ReactElement {
  const inner = w - 16;
  const lines = noteLines(panel.note, inner);
  const noteH = lines ? lines * 7.2 + 3 : 0;
  const d = panel.data;
  const extra = d.kind === "map" ? d.summary : d.kind === "flow" || d.kind === "flowsum" ? d.outside : "";
  const chartH = h - 16 - 15 - noteH - (extra ? 9 : 0);
  return (
    <View style={{ width: w, height: h, borderWidth: 0.75, borderColor: C.border, borderRadius: 4, padding: 8, backgroundColor: C.white }}>
      <Text style={display(8.4, { fontWeight: 600, height: 15 })}>{panel.title.length * 4.5 > inner ? `${panel.title.slice(0, Math.floor(inner / 4.5) - 1)}…` : panel.title}</Text>
      {d.kind === "empty" ? (
        <View style={{ height: chartH, alignItems: "center", justifyContent: "center" }}><Text style={body(7, { color: C.muted })}>{d.text}</Text></View>
      ) : (
        <Chart data={d} w={inner} h={chartH} />
      )}
      {extra ? <Text style={body(5.6, { color: C.muted, marginTop: 1 })}>{extra.length * 2.8 > inner * (d.kind === "flow" ? 2 : 1) ? `${extra.slice(0, Math.floor((inner * (d.kind === "flow" ? 2 : 1)) / 2.8) - 1)}…` : extra}</Text> : null}
      {panel.note ? <Text style={body(5.4, { color: C.muted, lineHeight: 1.3, position: "absolute", left: 8, right: 8, bottom: 6 })}>{panel.note}</Text> : null}
    </View>
  );
}

function GridPageView({ p, m, index }: { p: GridPage; m: ReportModel; index: number }): ReactElement {
  const o = m.orientation, { W, H } = SIZE[o];
  const bw = W - 2 * M;
  const cols = o === "portrait" ? 2 : 3, rows = o === "portrait" ? 3 : 2;
  const tilesTop = TOP + 40;
  const gridTop = p.tiles.length ? tilesTop + TILE_H + 10 : tilesTop;
  const gridH = H - BOTTOM - gridTop;
  const cw = (bw - GAP * (cols - 1)) / cols, ch = (gridH - GAP * (rows - 1)) / rows;
  const dropped: string[] = [];
  const placed = placePanels(p.panels, o, dropped);
  if (dropped.length) console.warn(`report: no room on "${p.title}" for ${dropped.join(", ")}`);
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white }} bookmark={p.id === "overview" || m.pages[index - 1]?.section !== p.section ? p.section : undefined}>
      <Furniture m={m} section={p.section} />
      <Heading m={m} kicker={p.kicker} title={p.title} w={bw} />
      <Tiles tiles={p.tiles} w={bw} top={tilesTop} />
      {placed.map(({ panel, row, col, cs, rs }) => (
        <View key={panel.title} style={{ position: "absolute", left: M + col * (cw + GAP), top: gridTop + row * (ch + GAP) }}>
          <PanelView panel={panel} w={cw * cs + GAP * (cs - 1)} h={ch * rs + GAP * (rs - 1)} />
        </View>
      ))}
    </Page>
  );
}

// ---- cover --------------------------------------------------------------------------------------------------------

export function Locator({ locator, w, h }: { locator: ReportModel["locator"]; w: number; h: number }): ReactElement | null {
  const { state, area, cmp } = locator;
  if (!state) return null;
  const projection = geoMercator().fitExtent([[2, 2], [w - 2, h - 2]], state as any);
  const path = geoPath(projection);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={path(state as any) ?? ""} fill="#ffffff" fillOpacity={0.14} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={0.8} />
      {cmp && <Path d={path(cmp as any) ?? ""} fill="#ef9a77" stroke="#ffffff" strokeWidth={0.8} />}
      {area && <Path d={path(area as any) ?? ""} fill="#f8b93e" stroke="#ffffff" strokeWidth={0.8} />}
    </Svg>
  );
}

function Toc({ m, w }: { m: ReportModel; w: number }): ReactElement {
  return (
    <View style={{ width: w }}>
      <Text style={body(7, { color: C.sel, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 })}>In this report</Text>
      {m.toc.map((t) => (
        <View key={t.label} style={{ flexDirection: "row", alignItems: "flex-end", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
          <Text style={body(8.4, { fontWeight: 500 })}>{t.label}</Text>
          <View style={{ flexGrow: 1, height: 1, marginHorizontal: 5, marginBottom: 2.5, borderBottomWidth: 0.75, borderBottomColor: C.faint, borderBottomStyle: "dotted" }} />
          <Text style={body(8, { color: C.muted })}>{t.page}</Text>
        </View>
      ))}
    </View>
  );
}

function Cover({ m }: { m: ReportModel }): ReactElement {
  const { W, H } = SIZE[m.orientation];
  const { sel, cmp } = m.ctx;
  const portrait = m.orientation === "portrait";
  const type = TYPE_LABEL[sel.type] ?? sel.type;
  const name = (
    <View>
      <Text style={body(8, { color: "#ffffff", fontWeight: 600, letterSpacing: 1.6, textTransform: "uppercase", opacity: 0.8 })}>Community profile</Text>
      <Text style={display(sel.label.length > 22 ? (portrait ? 28 : 24) : portrait ? 36 : 30, { color: "#ffffff", lineHeight: 1.05, marginTop: 6 })}>{sel.label}</Text>
      <Text style={body(9, { color: "#ffffff", marginTop: 8, lineHeight: 1.5, opacity: 0.92 })}>
        {type} · {m.ctx.v - 4}–{m.ctx.v} American Community Survey{cmp ? `\nCompared with ${cmp.label}` : ""}
      </Text>
    </View>
  );
  const tiles = m.coverTiles;
  const tcols = portrait ? 3 : 2;
  const area = portrait ? W - 2 * M : W - 290 - 2 * 36;
  const tw = (area - 8 * (tcols - 1)) / tcols;
  const link = (
    <Text style={body(7, { color: C.muted, lineHeight: 1.5 })}>
      Generated {m.generated}. See the full, live profile at <Link src={m.ctx.url} style={{ color: C.sel }}>{m.ctx.url.replace(/^https?:\/\//, "").split("#")[0]}</Link>.
    </Text>
  );
  const tileGrid = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, width: area }}>
      {tiles.map((t) => <TileView key={t.label} t={t} w={tw} h={56} />)}
    </View>
  );
  if (portrait) {
    return (
      <Page size={[W, H]} style={{ backgroundColor: C.white }}>
        <View style={{ position: "absolute", left: 0, top: 0, width: W, height: 262, backgroundColor: C.navy }} />
        <Image src={logoWhite} style={{ position: "absolute", left: M, top: 30, width: 55, height: 31 }} />
        <View style={{ position: "absolute", left: M, top: 100, width: W - 2 * M - 150 }}>{name}</View>
        <View style={{ position: "absolute", right: 40, top: 40 }}><Locator locator={m.locator} w={116} h={160} /></View>
        <View style={{ position: "absolute", left: M, top: 292 }}>{tileGrid}</View>
        <View style={{ position: "absolute", left: M, top: 292 + Math.ceil(tiles.length / tcols) * 64 + 24 }}><Toc m={m} w={W - 2 * M} /></View>
        <View style={{ position: "absolute", left: M, right: M, bottom: 26 }}>{link}</View>
      </Page>
    );
  }
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white }}>
      <View style={{ position: "absolute", left: 0, top: 0, width: 290, height: H, backgroundColor: C.navy }} />
      <Image src={logoWhite} style={{ position: "absolute", left: 32, top: 30, width: 55, height: 31 }} />
      <View style={{ position: "absolute", left: 32, top: 150, width: 230 }}>{name}</View>
      <View style={{ position: "absolute", left: 32, bottom: 30 }}><Locator locator={m.locator} w={92} h={130} /></View>
      <View style={{ position: "absolute", left: 326, top: 40 }}>{tileGrid}</View>
      <View style={{ position: "absolute", left: 326, top: 40 + Math.ceil(tiles.length / tcols) * 64 + 24 }}><Toc m={m} w={area} /></View>
      <View style={{ position: "absolute", left: 326, right: M, bottom: 26 }}>{link}</View>
    </Page>
  );
}

// ---- indicator table ----------------------------------------------------------------------------------------------

function TableView({ p, m }: { p: TablePage; m: ReportModel }): ReactElement {
  const { W, H } = SIZE[m.orientation];
  const cmp = m.ctx.cmp;
  const cell = (w: number, align: "left" | "right" = "right") => ({ width: w, textAlign: align as "left" | "right", paddingHorizontal: 4 });
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white }} bookmark={p.part === 1 ? p.section : undefined}>
      <Furniture m={m} section={p.section} />
      <Heading m={m} kicker="Appendix" title={`Indicators${p.parts > 1 ? ` (${p.part} of ${p.parts})` : ""}`} w={W - 2 * M} />
      <View style={{ position: "absolute", left: M, top: TOP + 40, width: W - 2 * M }}>
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.navy, paddingBottom: 3, height: 15, alignItems: "flex-end" }}>
          <Text style={body(5.8, { color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", flexGrow: 1 })}>Indicator</Text>
          <Text style={{ ...body(5.8, { color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }), ...cell(cmp ? 80 : 110) }}>{m.ctx.sel.label.slice(0, 22)}</Text>
          <Text style={{ ...body(5.8, { color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }), ...cell(70) }}>Margin of error</Text>
          <Text style={{ ...body(5.8, { color: C.muted, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }), ...cell(40) }}>Method</Text>
          {cmp && <Text style={{ ...body(5.8, { color: C.cmp, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }), ...cell(80) }}>{cmp.label.slice(0, 22)}</Text>}
        </View>
        {p.rows.map((r, i) =>
          !("label" in r) ? (
            <View key={`g${i}`} wrap={false} style={{ height: 15, backgroundColor: C.panel, justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={body(6.4, { color: C.navy, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" })}>{r.group}</Text>
            </View>
          ) : (
            <View key={r.label} wrap={false} style={{ height: 15, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <Text style={body(7, { flexGrow: 1, paddingLeft: 4 })}>{r.label.length > 62 ? `${r.label.slice(0, 61)}…` : r.label}</Text>
              <Text style={{ ...body(7, { fontWeight: 600 }), ...cell(cmp ? 80 : 110) }}>{r.value}</Text>
              <Text style={{ ...body(7, { color: C.muted }), ...cell(70) }}>{r.moe}</Text>
              <View style={{ ...cell(40), alignItems: "flex-end" }}><MethodChip method={r.method} /></View>
              {cmp && <Text style={{ ...body(7, { color: C.cmp, fontWeight: 600 }), ...cell(80) }}>{r.compare}</Text>}
            </View>
          ),
        )}
        <Text style={body(6, { color: C.muted, marginTop: 6 })}>P published by the Census Bureau for this area · A exact aggregate of whole blocks or block groups · E WFRC estimate. Margins of error are 90%.</Text>
      </View>
    </Page>
  );
}

// ---- methods and closing ------------------------------------------------------------------------------------------

export function Qr({ url, size }: { url: string; size: number }): ReactElement {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount(), quiet = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n + 2 * quiet} ${n + 2 * quiet}`}>
      <Rect x={0} y={0} width={n + 2 * quiet} height={n + 2 * quiet} fill="#ffffff" />
      <Path d={d} fill={C.ink} />
    </Svg>
  );
}

function About({ m, p }: { m: ReportModel; p: ReportPage }): ReactElement {
  const { W, H } = SIZE[m.orientation];
  const bw = W - 2 * M;
  const wide = m.orientation === "landscape";
  const url = m.ctx.url;
  const top = TOP + 44;
  const leftW = wide ? 250 : bw;
  const q = wide ? 150 : 120;
  const textW = wide ? bw - leftW - 24 : bw;
  const colW = (textW - 20) / 2;
  const h = (s: string) => <Text style={display(9, { marginBottom: 4, marginTop: 9 })}>{s}</Text>;
  const t = (s: string) => <Text style={body(wide ? 7.4 : 8, { lineHeight: 1.42, marginBottom: 4 })}>{s}</Text>;
  const way = (k: keyof typeof METHOD_STYLE, label: string, text: string) => (
    <View key={label} style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
      <View style={{ width: 12, alignItems: "center", paddingTop: 1 }}><MethodChip method={k as Tile["method"]} /></View>
      <Text style={body(7.4, { lineHeight: 1.42, flex: 1 })}><Text style={{ fontWeight: 700 }}>{label}. </Text>{text}</Text>
    </View>
  );
  const explore = (
    <View style={{ width: leftW, flexDirection: wide ? "column" : "row", gap: wide ? 10 : 16, alignItems: wide ? "flex-start" : "center" }}>
      <View style={{ alignItems: "center" }}>
        <Link src={url}><View style={{ padding: 5, borderWidth: 0.75, borderColor: C.border, borderRadius: 6 }}><Qr url={url} size={q} /></View></Link>
        <Text style={body(6.4, { color: C.muted, marginTop: 4 })}>Scan to open this view</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={display(wide ? 13 : 14, { lineHeight: 1.22, marginBottom: 6 })}>See the full, live profile to explore more data and maps.</Text>
        <Text style={body(7.6, { lineHeight: 1.45, marginBottom: 5 })}>Every indicator for any city, county or planning area, a year slider with trends back to 2009, maps of any variable by area or tract, an interactive commute flow map, table views and CSV downloads, and a second area to compare against.</Text>
        <Link src={url} style={body(7, { color: C.sel, lineHeight: 1.4 })}>{url}</Link>
        <Text style={body(6.4, { color: C.muted, marginTop: 4 })}>The link opens this report{"’"}s area{m.ctx.cmp ? ", comparison" : ""} and year.</Text>
      </View>
    </View>
  );
  const methods = (
    <View style={{ width: textW, flexDirection: "row", gap: 20 }}>
      <View style={{ width: colW }}>
        {h("How each number was made")}
        {way("direct", "Published", "The Census Bureau publishes this value for exactly this area.")}
        {way("aggregated", "Aggregate", "An exact sum of whole Census blocks or block groups inside the area.")}
        {way("allocated", "Estimate", "A WFRC estimate, split from block groups only partly inside the area, using Census block counts. A median is interpolated from allocated brackets.")}
        {h("Margins of error")}
        {t("Every American Community Survey figure carries a 90 percent margin of error. A figure is marked use with caution when its margin is more than 30 percent of the estimate. Small areas and short trends move more from year to year than they appear to.")}
        {h("Maps")}
        {t(`Tract maps show the Census tracts that make up the area, in five groups of equal count, on the same breaks for every area in the report. A tract that crosses the boundary is drawn whole. Census redrew tracts in 2020, so the maps use the ${m.mapYear - 4}–${m.mapYear} tracts. A commute flow map is framed to the routes that carry about 75 percent of the jobs between the area and areas of its own kind and draws the busiest of them.`)}
      </View>
      <View style={{ width: colW }}>
        {h("Sources and vintages")}
        {t(`American Community Survey 5-year estimates, ${m.ctx.v - 4}–${m.ctx.v}.`)}
        {t("Census Population Estimates Program, annual estimates for the state, counties, cities and the WFRC planning areas that are whole counties.")}
        {t(`LEHD LODES8 jobs and commute flows, ${m.ctx.lodes}. Block counts carry noise, so small areas are rough.`)}
        {t(`Bureau of Labor Statistics QCEW, private-sector employment and pay by industry, ${m.ctx.qcew}.`)}
        {h("About this PDF")}
        {t("Built in your browser from the same data as the live profile. The text is selectable and the charts are vector graphics. The PDF has bookmarks and a document language but no accessibility tags; the table view and CSV download in the live profile are the accessible form of every chart.")}
        {t("Full definitions and the allocation method are in the Documentation page of the live profile.")}
      </View>
    </View>
  );
  return (
    <Page size={[W, H]} style={{ backgroundColor: C.white }} bookmark={p.section}>
      <Furniture m={m} section={p.section} />
      <Heading m={m} kicker="Methods and next steps" title="Methods, sources and the full profile" w={bw} />
      <View style={{ position: "absolute", left: M, top, width: bw, flexDirection: wide ? "row" : "column", gap: wide ? 24 : 6 }}>
        {explore}
        {methods}
      </View>
    </Page>
  );
}

// ---- document -----------------------------------------------------------------------------------------------------

export function ReportDocument({ m }: { m: ReportModel }): ReactElement<DocumentProps> {
  const { sel, cmp } = m.ctx;
  return (
    <Document title={`${sel.label}${cmp ? ` and ${cmp.label}` : ""}: community profile`} author="Wasatch Front Regional Council" subject="Community profile" creator="WFRC Community Profiles" language="en-US">
      <Cover m={m} />
      {m.pages.map((p, i) =>
        p.type === "grid" ? <GridPageView key={p.id} p={p} m={m} index={i} /> :
        p.type === "table" ? <TableView key={p.id} p={p} m={m} /> :
        <About key={p.id} p={p} m={m} />,
      )}
    </Document>
  );
}

