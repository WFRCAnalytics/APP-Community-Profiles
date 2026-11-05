// node scripts/lab-shot.mjs <url> <out.png> [theme] [hash]
import { chromium } from "@playwright/test";
const [url, out, theme = "light", hash = ""] = process.argv.slice(2);
const b = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const p = await (await b.newContext({ viewport: { width: 520, height: 700 }, colorScheme: theme })).newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
p.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 200)));
await p.goto(url + hash);
await p.waitForSelector(".mapcard .maplibregl-canvas", { timeout: 60000 });
await p.waitForTimeout(6000);
await p.screenshot({ path: out });
await b.close();
