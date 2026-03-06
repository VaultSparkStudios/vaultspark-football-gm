import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-ui",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node scripts/dev-playwright-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000
  }
});

