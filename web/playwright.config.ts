import { defineConfig } from "@playwright/test";

// Uses the browser installed on the machine (Edge) unless PW_CHANNEL says otherwise; CI sets PW_CHANNEL=chromium
// after `npx playwright install chromium`.
export default defineConfig({
  testDir: "e2e",
  webServer: { command: "npm run build && npx vite preview --port 4179 --strictPort", url: "http://localhost:4179/", reuseExistingServer: !process.env.CI, timeout: 180_000 },
  use: { baseURL: "http://localhost:4179/", channel: process.env.PW_CHANNEL === "chromium" ? undefined : (process.env.PW_CHANNEL ?? "msedge") },
});
