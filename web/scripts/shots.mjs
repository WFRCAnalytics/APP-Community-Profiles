// Screenshots every tab in light and dark at desktop and mobile widths:
//   node scripts/shots.mjs <base-url> <out-dir> [tabs] ; env HASH="#type=county&id=49035&cmp=49", ONLY_SIZE=desktop|mobile, ONLY_THEME=light|dark
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:5174/", out = "shots", only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const tabs = (only ?? "overview,map,people,households,housing,income,education,jobs,commute,indicators").split(",");
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
for (const theme of ["light", "dark"]) {
  if (process.env.ONLY_THEME && process.env.ONLY_THEME !== theme) continue;
  for (const [name, viewport] of Object.entries(sizes)) {
    if (process.env.ONLY_SIZE && process.env.ONLY_SIZE !== name) continue;
    const ctx = await browser.newContext({ viewport, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[${theme} ${name}] pageerror`, e.message.slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && console.log(`[${theme} ${name}] console`, m.text().slice(0, 200)));
    for (const tab of tabs) {
      await page.goto(`${base}${process.env.HASH ?? "#type=county&id=49035&cmp=49"}&tab=${tab}`);
      await page.waitForSelector(".screen", { timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(tab === "map" || tab === "overview" ? 5000 : 2200);
      await page.screenshot({ path: `${out}/${theme}-${name}-${tab}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
