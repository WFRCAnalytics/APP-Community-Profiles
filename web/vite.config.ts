import { createReadStream, cpSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../data");
// Only what the app reads is served and published; boundaries and crosswalk tables stay out.
const PUBLISHED = ["acs", "lodes", "pep", "qcew", "meta", "web"];
const TYPES: Record<string, string> = { ".parquet": "application/octet-stream", ".geojson": "application/geo+json", ".json": "application/json" };

// Serves ../data at /data/ (with byte ranges, like GitHub Pages) in `vite dev` and `vite preview`, and copies it into dist/data on build.
function dataPlugin(): Plugin {
  const middleware = (req: any, res: any, next: any) => {
    const url = decodeURIComponent((req.url ?? "").split("?")[0]);
    const m = url.match(/^(?:.*?)\/data\/(.+)$/);
    if (!m) return next();
    const file = normalize(join(DATA, m[1]));
    const top = m[1].split("/")[0];
    if (!file.startsWith(DATA) || !PUBLISHED.includes(top) || !TYPES[extname(file)] || !existsSync(file)) return next();
    const size = statSync(file).size;
    res.setHeader("Content-Type", TYPES[extname(file)]);
    res.setHeader("Accept-Ranges", "bytes");
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? +range[1] : size - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", end - start + 1);
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", size);
      createReadStream(file).pipe(res);
    }
  };
  let outDir = "dist";
  return {
    name: "profiles-data",
    configureServer: (s) => void s.middlewares.use(middleware),
    configurePreviewServer: (s) => void s.middlewares.use(middleware),
    configResolved: (c) => void (outDir = resolve(c.root, c.build.outDir)),
    closeBundle() {
      for (const top of PUBLISHED) {
        const from = join(DATA, top);
        if (!existsSync(from)) continue;
        for (const name of readdirSync(from, { recursive: true, encoding: "utf8" })) {
          const src = join(from, name);
          if (!TYPES[extname(src)] || !statSync(src).isFile()) continue;
          const dest = join(outDir, "data", top, name);
          mkdirSync(dirname(dest), { recursive: true });
          cpSync(src, dest);
        }
      }
    },
  };
}

// BASE is configurable for the Pages deploy (e.g. /APP-Community-Profiles/). The default "./" keeps every URL relative.
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [svelte(), dataPlugin()],
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
