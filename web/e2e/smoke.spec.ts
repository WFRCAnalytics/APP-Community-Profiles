import { expect, test } from "@playwright/test";

test("loads the registry and the overview for one area", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2 })).toContainText("ACS 2020–2024", { timeout: 60_000 });
  await expect(page.getByText("Population", { exact: true })).toBeVisible();
  await expect(page.locator("dd").first()).not.toHaveText(/^–/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
