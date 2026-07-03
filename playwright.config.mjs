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
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium"
    }
  },
  webServer: {
    command: "node scripts/dev-playwright-server.mjs",
    url: "http://localhost:4273",
    env: {
      PORT: "4273",
      // The UI suite polls far faster than a human; don't let the production
      // 50 req/min bucket 429 the tests (CI run 26991314776).
      VSFGM_RATE_LIMIT_PER_MIN: "100000"
    },
    reuseExistingServer: false,
    timeout: 60_000
  }
});

