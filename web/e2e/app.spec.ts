import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ready = async (page: Page) => {
  await page.waitForSelector(".tile-number", { timeout: 60_000 });
  await expect(page.locator(".tile-number").first()).not.toHaveText("–", { timeout: 30_000 });
};

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A blocked basemap (offline CI) is not an app error; everything else is.
  page.on("console", (m) => m.type() === "error" && !/tiles\.openfreemap|Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text()));
  return errors;
}

test("loads the registry and the overview for one area", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("WFRC AOG");
  await expect(page.getByText("Population over time")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the URL hash restores the area, comparison, period and tab", async ({ page }) => {
  await page.goto("/#type=county&id=49035&cmp=49&v=2022&tab=population");
  await ready(page);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Salt Lake County");
  await expect(page.locator("#f-period")).toHaveValue("2022");
  await expect(page.getByRole("tab", { name: "Population" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Age and sex")).toBeVisible();
  await page.getByRole("tab", { name: "Jobs and commute" }).click();
  await expect(page).toHaveURL(/tab=jobs/);
  expect(page.url()).toContain("cmp=49");
});

test("search jumps to an area and compare adds a second series", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("combobox", { name: /Find a city/ }).fill("provo");
  await page.getByRole("option", { name: /^Provo/ }).first().click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Provo");
  await page.locator("#f-cmp").selectOption("49");
  await expect(page.locator(".tile-compare b").first()).toBeVisible();
  await expect(page).toHaveURL(/cmp=49/);
});

test("every chart has a table view and the indicators table downloads as CSV", async ({ page }) => {
  await page.goto("/#type=county&id=49035&tab=housing");
  await ready(page);
  const card = page.getByRole("region", { name: "Own or rent" });
  await card.getByRole("button", { name: "Table" }).click();
  await expect(card.getByRole("table")).toBeVisible();
  await page.getByRole("tab", { name: "Indicators" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/salt-lake-county-profile\.csv/);
});

test("methods page renders in the app", async ({ page }) => {
  await page.goto("/#page=methods");
  await expect(page.getByRole("heading", { level: 1, name: /methods and sources/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Census published").first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`no axe violations in ${scheme} mode`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await page.goto("/#type=county&id=49035&cmp=49");
    await ready(page);
    await page.waitForFunction(() => !document.querySelector(".loading"));
    const result = await new AxeBuilder({ page }).disableRules(["scrollable-region-focusable"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("on a phone the panel is a bottom sheet over the map", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await ready(page);
  const panel = await page.locator(".panel").boundingBox();
  expect(panel!.y).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
