// DuckDB-WASM, bundled with the app (no CDN). It reads the committed parquet files over HTTP: by byte range where
// the server supports it (GitHub Pages does, and so do `vite dev` and `vite preview`), whole files otherwise.
import * as duckdb from "@duckdb/duckdb-wasm";
import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export interface Db {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
}

const absolute = (url: string) => new URL(url, document.baseURI).href;

// Every data URL is relative to the page, so the app works from any base path or a plain static server.
export const dataUrl = (path: string) => new URL(`data/${path}`, document.baseURI).href;

export async function openDb(): Promise<Db> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: absolute(mvpWasm), mainWorker: absolute(mvpWorker) },
    eh: { mainModule: absolute(ehWasm), mainWorker: absolute(ehWorker) },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  // allowFullHTTPReads keeps servers without range support (a plain `python -m http.server`) working.
  await db.open({ filesystem: { allowFullHTTPReads: true } });
  return { db, conn: await db.connect() };
}

const num = (x: unknown) => (typeof x === "bigint" ? Number(x) : x);

// Run SQL and return plain objects (BigInt turned into Number).
export async function sql<T = Record<string, any>>(handle: Db, text: string): Promise<T[]> {
  const result = await handle.conn.query(text);
  return result.toArray().map((row) => {
    const o = row.toJSON();
    for (const k of Object.keys(o)) o[k] = num(o[k]);
    return o as T;
  });
}
