import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-ui",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:4273",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node scripts/dev-playwright-server.mjs",
    url: "http://localhost:4273",
    env: {
      PORT: "4273"
    },
    reuseExistingServer: false,
    timeout: 60_000
  }
});

