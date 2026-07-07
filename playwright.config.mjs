import { defineConfig } from "@playwright/test";
import { existsSync } from "fs";

// In the VaultSpark cloud execution environment, Chromium is pre-installed at
// this path and Playwright's version may not match. Fall back to normal
// resolution (e.g. after `playwright install`) when the path isn't present.
const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";
const cloudLaunchOptions = existsSync(CLOUD_CHROMIUM)
  ? { executablePath: CLOUD_CHROMIUM }
  : {};

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
    launchOptions: cloudLaunchOptions
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

