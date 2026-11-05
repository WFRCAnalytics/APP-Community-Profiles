import { defineConfig } from "@playwright/test";

// Uses the browser installed on the machine (Edge) unless PW_CHANNEL says otherwise; CI sets PW_CHANNEL=chromium
// after `npx playwright install chromium`.
export default defineConfig({
  testDir: "e2e",
  webServer: { command: "npm run build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/", reuseExistingServer: true, timeout: 180_000 },
  use: { baseURL: "http://localhost:4173/", channel: process.env.PW_CHANNEL === "chromium" ? undefined : (process.env.PW_CHANNEL ?? "msedge") },
});
