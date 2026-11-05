// Data access: DuckDB-WASM reading the tracked parquet files over HTTP (range requests, so only the
// columns and row groups a query needs are fetched).
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
import { variablesOf } from "./indicators.js";
import { methodOf } from "./format.js";

const DATA = new URL("../data/", import.meta.url);
export const dataUrl = (path) => new URL(path, DATA).href;

export async function openDb() {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  // Read parquet by byte range where the server supports it (GitHub Pages does). Servers without range support,
  // such as `quarto preview`, fall back to fetching the whole file instead of failing.
  await db.open({ filesystem: { allowFullHTTPReads: true } });
  URL.revokeObjectURL(workerUrl);
  return { db, conn: await db.connect() };
}

const num = (x) => (typeof x === "bigint" ? Number(x) : x);

// Run SQL and return plain objects (BigInt turned into Number).
export async function sql(handle, text) {
  const result = await handle.conn.query(text);
  return result.toArray().map((row) => {
    const o = row.toJSON();
    for (const k of Object.keys(o)) o[k] = num(o[k]);
    return o;
  });
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const list = (xs) => xs.map(lit).join(", ");
const groupByType = (refs) => {
  const g = new Map();
  for (const r of refs) g.set(r.type, [...(g.get(r.type) ?? []), r.id]);
  return g;
};

// ---- lookups ---------------------------------------------------------------------------------------------

export async function registry(handle) {
  return sql(handle, `SELECT geo_id, geo_type, geo_name, kind, organization, notes
                      FROM read_parquet('${dataUrl("meta/geographies.parquet")}') ORDER BY geo_name`);
}

export async function acsVintages(handle) {
  const rows = await sql(handle, `SELECT DISTINCT vintage FROM read_parquet('${dataUrl("meta/variables.parquet")}') ORDER BY vintage`);
  return rows.map((r) => r.vintage);
}

export async function acsLabels(handle, vintage, table) {
  const rows = await sql(handle, `SELECT variable, label FROM read_parquet('${dataUrl("meta/variables.parquet")}')
                                  WHERE vintage = ${+vintage} AND "table" = ${lit(table)} ORDER BY variable`);
  return rows;
}

// ---- ACS -------------------------------------------------------------------------------------------------

// Raw ACS variables for some areas in one vintage: Map("id|variable") -> {estimate, moe, method, flag}.
export async function acsVariables(handle, topic, refs, vintage, variables) {
  const out = new Map();
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql(handle, `
      SELECT geo_id, variable, estimate::DOUBLE AS estimate, moe::DOUBLE AS moe, method, flag
      FROM read_parquet('${dataUrl(`acs/${topic}/${type}.parquet`)}')
      WHERE vintage = ${+vintage} AND geo_id IN (${list(ids)}) AND variable IN (${list(variables)})`);
    for (const r of rows) out.set(`${r.geo_id}|${r.variable}`, r);
  }));
  return out;
}

// The sum of some variables in a Map from acsVariables, with its margin of error.
export function sumOf(map, id, variables) {
  let total = null, sq = 0, rank = 0, any = false, moeNull = false;
  for (const variable of variables) {
    const r = map.get(`${id}|${variable}`);
    if (!r || r.estimate == null) continue;
    any = true;
    total = (total ?? 0) + r.estimate;
    if (r.moe == null) moeNull = true; else sq += r.moe ** 2;
    rank = Math.max(rank, r.method === "direct" ? 0 : r.method === "aggregated" ? 1 : 2);
  }
  return { value: total, moe: any && !moeNull ? Math.sqrt(sq) : null, rank, any };
}

// Margin of error of a proportion num/den (Census handbook formula).
export function shareMoe(num, den, numMoe, denMoe) {
  if (num == null || !den || numMoe == null) return null;
  const p = num / den;
  const inner = numMoe ** 2 - (denMoe == null ? 0 : p ** 2 * denMoe ** 2);
  const radicand = inner > 0 ? inner : numMoe ** 2 + (denMoe == null ? 0 : p ** 2 * denMoe ** 2);
  return Math.sqrt(radicand) / den;
}

function summarize(ind, row) {
  const num = row.num, den = ind.type === "share" ? (row.den ?? 0) - (row.minus_ ?? 0) : null;
  if (ind.type !== "share") {
    return { value: num, moe: row.num_moe ?? null, method: methodOf(row.rank ?? 0), flag: row.flag ?? null };
  }
  const denMoe = row.den_moe == null ? null : Math.sqrt(row.den_moe ** 2 + (row.minus_moe ?? 0) ** 2);
  return {
    value: den > 0 && num != null ? num / den : null,
    moe: shareMoe(num, den, row.num_moe, denMoe),
    method: methodOf(row.rank ?? 0), flag: row.flag ?? null, num, den,
  };
}

const AGG_COLUMNS = (ind) => {
  const num = list(ind.num), den = list(ind.den ?? []), minus = list(ind.minus ?? []);
  const part = (name, vars) => vars
    ? `sum(estimate) FILTER (WHERE variable IN (${vars}))::DOUBLE AS ${name},
       sqrt(sum(power(moe, 2)) FILTER (WHERE variable IN (${vars})))::DOUBLE AS ${name}_moe`
    : `NULL::DOUBLE AS ${name}, NULL::DOUBLE AS ${name}_moe`;
  return [part("num", num), part("den", den || null), part("minus_", minus || null)].join(",\n");
};

const METHOD_RANK = `max(CASE method WHEN 'direct' THEN 0 WHEN 'aggregated' THEN 1 ELSE 2 END)::INTEGER AS rank`;

// Indicator values for areas in one vintage: Map(id) -> {value, moe, method, flag}. `refs` null means every
// area of `type` (used for map layers).
export async function indicatorValues(handle, ind, refs, vintage, type = null) {
  const out = new Map();
  const targets = refs ? [...groupByType(refs)] : [[type, null]];
  await Promise.all(targets.map(async ([t, ids]) => {
    const rows = await sql(handle, `
      SELECT geo_id, ${AGG_COLUMNS(ind)}, ${METHOD_RANK}, max(flag) AS flag
      FROM read_parquet('${dataUrl(`acs/${ind.topic}/${t}.parquet`)}')
      WHERE vintage = ${+vintage} ${ids ? `AND geo_id IN (${list(ids)})` : ""} AND variable IN (${list(variablesOf(ind))})
      GROUP BY geo_id`);
    for (const r of rows) out.set(r.geo_id, summarize(ind, r));
  }));
  return out;
}

// Indicator history across vintages: [{id, vintage, value, moe, method}].
export async function indicatorSeries(handle, ind, refs) {
  const out = [];
  await Promise.all([...groupByType(refs)].map(async ([t, ids]) => {
    const rows = await sql(handle, `
      SELECT geo_id, vintage, ${AGG_COLUMNS(ind)}, ${METHOD_RANK}, max(flag) AS flag
      FROM read_parquet('${dataUrl(`acs/${ind.topic}/${t}.parquet`)}')
      WHERE geo_id IN (${list(ids)}) AND variable IN (${list(variablesOf(ind))})
      GROUP BY geo_id, vintage`);
    for (const r of rows) out.push({ id: r.geo_id, vintage: r.vintage, ...summarize(ind, r) });
  }));
  return out.filter((r) => r.value != null).sort((a, b) => a.vintage - b.vintage);
}

// ---- population estimates --------------------------------------------------------------------------------

const PEP_FILE = { state: "state", county: "county", place: "place", aog: "areas", mpo: "areas", rpo: "areas", fws: "areas" };

// Annual population estimates [{id, year, value, vintage}] for the areas that have them (others return none).
export async function pepSeries(handle, refs) {
  const out = [];
  const byFile = new Map();
  for (const r of refs) byFile.set(PEP_FILE[r.type], [...(byFile.get(PEP_FILE[r.type]) ?? []), r.id]);
  await Promise.all([...byFile].map(async ([file, ids]) => {
    const rows = await sql(handle, `SELECT geo_id AS id, year, estimate::DOUBLE AS value, vintage
                                    FROM read_parquet('${dataUrl(`pep/${file}.parquet`)}')
                                    WHERE geo_id IN (${list(ids)}) ORDER BY year`);
    out.push(...rows);
  }));
  return out;
}

// ---- LODES -----------------------------------------------------------------------------------------------

export async function lodesYears(handle) {
  const rows = await sql(handle, `SELECT DISTINCT year FROM read_parquet('${dataUrl("lodes/wac/county.parquet")}') ORDER BY year`);
  return rows.map((r) => r.year);
}

// Jobs (kind "wac") or workers (kind "rac") by variable for one year: Map("id|variable") -> number.
export async function lodesValues(handle, kind, refs, year) {
  const out = new Map();
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql(handle, `SELECT geo_id, variable, jobs::DOUBLE AS jobs
                                    FROM read_parquet('${dataUrl(`lodes/${kind}/${type}.parquet`)}')
                                    WHERE year = ${+year} AND geo_id IN (${list(ids)})`);
    for (const r of rows) out.set(`${r.geo_id}|${r.variable}`, r.jobs);
  }));
  return out;
}

// Total jobs/workers over the years: [{id, year, value}].
export async function lodesSeries(handle, kind, refs) {
  const out = [];
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql(handle, `SELECT geo_id AS id, year, jobs::DOUBLE AS value
                                    FROM read_parquet('${dataUrl(`lodes/${kind}/${type}.parquet`)}')
                                    WHERE variable = 'C000' AND geo_id IN (${list(ids)}) ORDER BY year`);
    out.push(...rows);
  }));
  return out;
}

export async function lodesVariables(handle) {
  return sql(handle, `SELECT source, variable, "group", label FROM read_parquet('${dataUrl("meta/lodes_variables.parquet")}')`);
}

// Flows into and out of an area for one year, from the OD file of its own geography type.
export async function odFlows(handle, type, id, year) {
  const file = `lodes/od/${type}.parquet`;
  return sql(handle, `SELECT origin_id, dest_id, S000::DOUBLE AS jobs
                      FROM read_parquet('${dataUrl(file)}')
                      WHERE year = ${+year} AND (origin_id = ${lit(id)} OR dest_id = ${lit(id)})`);
}

// Where an area's workers live (origins) or where its residents work (destinations), top N, same type.
export async function odTop(handle, type, id, year, direction, limit = 10) {
  const [near, far] = direction === "origins" ? ["dest_id", "origin_id"] : ["origin_id", "dest_id"];
  return sql(handle, `SELECT ${far} AS other, S000::DOUBLE AS jobs
                      FROM read_parquet('${dataUrl(`lodes/od/${type}.parquet`)}')
                      WHERE year = ${+year} AND ${near} = ${lit(id)} ORDER BY S000 DESC LIMIT ${+limit}`);
}

// ---- QCEW ------------------------------------------------------------------------------------------------

const QCEW_FILE = { state: "state", county: "county", aog: "areas", rpo: "areas", mpo: "areas", fws: "areas" };

export async function qcewYears(handle) {
  const rows = await sql(handle, `SELECT DISTINCT year FROM read_parquet('${dataUrl("qcew/county.parquet")}') ORDER BY year`);
  return rows.map((r) => r.year);
}

// Private-sector employment, establishments and pay by industry sector for one area and year.
// Returns [] when BLS publishes nothing for this kind of area (QCEW stops at the county).
export async function qcewIndustries(handle, ref, year) {
  if (!(ref.type in QCEW_FILE)) return [];
  const rows = await sql(handle, `
    SELECT industry, variable, value::DOUBLE AS value, flag
    FROM read_parquet('${dataUrl(`qcew/${QCEW_FILE[ref.type]}.parquet`)}')
    WHERE geo_id = ${lit(ref.id)} AND year = ${+year} AND ownership = '5'`);
  const by = new Map();
  for (const r of rows) {
    const o = by.get(r.industry) ?? { industry: r.industry };
    o[r.variable] = r.value; if (r.flag) o.flag = r.flag;
    by.set(r.industry, o);
  }
  return [...by.values()];
}

export async function qcewCodes(handle) {
  return sql(handle, `SELECT kind, code, label FROM read_parquet('${dataUrl("meta/qcew_codes.parquet")}')`);
}

export const hasQcew = (type) => type in QCEW_FILE;
export const hasPep = (type) => type in PEP_FILE;

// ---- map geometry ----------------------------------------------------------------------------------------

const geoCache = new Map();
export function geojson(type) {
  if (!geoCache.has(type)) geoCache.set(type, fetch(dataUrl(`web/${type}.geojson`)).then((r) => {
    if (!r.ok) throw new Error(`No map for ${type}`);
    return r.json();
  }));
  return geoCache.get(type);
}
