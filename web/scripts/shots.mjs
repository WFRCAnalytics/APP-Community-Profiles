// Screenshots every view in light and dark at desktop and mobile widths: node scripts/shots.mjs <base-url> <out-dir> [tabs]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:5174/", out = "shots", only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const tabs = (only ?? "overview,population,housing,income,jobs,indicators").split(",");
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 }, panel: { width: 1440, height: 2600 } };
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
for (const theme of ["light", "dark"]) {
  for (const [name, viewport] of Object.entries(sizes)) {
    if (only && process.env.ONLY_SIZE && name !== process.env.ONLY_SIZE) continue;
    const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[${theme} ${name}] pageerror`, e.message.slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && console.log(`[${theme} ${name}] console`, m.text().slice(0, 200)));
    for (const tab of tabs) {
      await page.goto(`${base}${process.env.HASH ?? "#type=county&id=49035&cmp=49"}&tab=${tab}`);
      await page.waitForSelector(".tile-number", { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const clip = name === "panel" ? { x: 880, y: 52, width: 560, height: 2548 } : undefined;
      await page.screenshot({ path: `${out}/${theme}-${name}-${tab}.png`, clip });
    }
    await ctx.close();
  }
}
await browser.close();
