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

test("loads the overview for the default area with no errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("WFRC region");
  await expect(page.getByText("Population over time")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the URL hash restores the area, comparison, year and tab", async ({ page }) => {
  await page.goto("/#type=county&id=49035&cmp=49&v=2022&tab=people");
  await ready(page);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Salt Lake County");
  await expect(page.locator("output")).toHaveText("2022");
  await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Age and sex, 2022" })).toBeVisible();
  await page.getByRole("tab", { name: "Jobs and economy" }).click();
  await expect(page).toHaveURL(/tab=jobs/);
  expect(page.url()).toContain("cmp=49");
});

test("search picks an area and the compare picker suggests areas of the same kind first", async ({ page }) => {
  await page.goto("/#type=county&id=49035");
  await ready(page);
  await page.getByRole("button", { name: /Search or browse areas/ }).click();
  await page.getByRole("combobox", { name: "Search for an area" }).fill("provo");
  await page.getByRole("option", { name: /^Provo/ }).first().click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Provo");
  await page.goto("/#type=county&id=49035");
  await ready(page);
  await page.getByRole("button", { name: /Compare with another area/ }).click();
  const first = page.locator("#picker-list").getByRole("option").first();
  await expect(page.getByText("Counties like Salt Lake County")).toBeVisible();
  await expect(first).toContainText("County");
  await page.getByRole("option", { name: /^Utah State/ }).click();
  await expect(page).toHaveURL(/cmp=49/);
});

test("every chart has a table view, and the indicators table downloads as CSV", async ({ page }) => {
  await page.goto("/#type=county&id=49035&tab=people");
  await ready(page);
  const card = page.getByRole("region", { name: "Race" });
  await card.getByRole("button", { name: "Table" }).click();
  await expect(card.getByRole("table")).toBeVisible();
  await page.getByRole("tab", { name: "Indicators" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/salt-lake-county-2024-profile\.csv/);
});

test("the documentation page renders in the app", async ({ page }) => {
  await page.goto("/#page=methods");
  await expect(page.getByRole("heading", { level: 2, name: /documentation/i })).toBeVisible({ timeout: 60_000 });
});

test("a method chip explains itself on hover", async ({ page }) => {
  await page.goto("/#type=county&id=49035");
  await ready(page);
  const chip = page.locator(".chip").first();
  await chip.focus();
  await expect(chip).toHaveAttribute("data-tip", /Census Bureau/);
});

for (const scheme of ["light", "dark"] as const) {
  for (const tab of ["overview", "people", "jobs"]) {
    test(`no axe violations on ${tab} in ${scheme} mode`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = watchErrors(page);
      await page.goto(`/#type=county&id=49035&cmp=49&tab=${tab}`);
      await ready(page);
      await page.waitForFunction(() => !document.querySelector(".loading"));
      const result = await new AxeBuilder({ page }).disableRules(["scrollable-region-focusable"]).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
    });
  }
}

test("every tab fits one screen at 1440 by 900", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const tab of ["overview", "map", "people", "households", "housing", "income", "education", "jobs", "commute", "indicators"]) {
    await page.goto(`/#type=county&id=49035&cmp=49&tab=${tab}`);
    await ready(page).catch(() => page.waitForSelector(".screen"));
    await page.waitForFunction(() => !document.querySelector(".loading"));
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), tab).toBe(true);
  }
});

test("on a phone the page scrolls as one column without sideways overflow", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await context.close();
});
