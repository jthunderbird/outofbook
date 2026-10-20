// End-to-end tests against the running dev stack (docker compose up -d, with
// DEV_AUTH=1 for the account tests). Base URL: E2E_BASE_URL, default
// https://localhost:7444. Tests that need the user's real games skip unless
// packages/core/test/fixtures/local/games300.json exists (kept out of git).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://localhost:7444",
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    // Hosts Playwright cannot install browsers on (e.g. Ubuntu 20.04) can point at an existing Chromium.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
});
