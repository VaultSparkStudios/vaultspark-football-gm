import { test, expect } from "@playwright/test";

/**
 * S109 — shareable moment cards.
 *
 * momentCard.js is a lazy island reached only via dynamic import from its
 * producers, so this spec proves the browser-only path node tests cannot:
 * the module loads on demand, the Share control mounts, and clicking it
 * actually rasterizes a non-empty PNG. navigator.share/clipboard are stubbed
 * before navigation so the click resolves deterministically in a headless
 * browser that may not implement either API.
 */

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function waitGameReady(page, timeout = 60_000) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await decline.click();
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
  }
}

async function dismissTutorialIfVisible(page) {
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

async function stubShareCapture(page) {
  await page.addInitScript(() => {
    window.__momentShareCalls = [];
    const capture = (file) => {
      window.__momentShareCalls.push({ size: file ? file.size : 0, type: file ? file.type : null });
    };
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        capture(data?.files?.[0] || null);
        return undefined;
      }
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {},
        write: async (items) => {
          const item = items?.[0];
          const blob = item && typeof item.getType === "function" ? await item.getType("image/png") : null;
          capture(blob);
        }
      }
    });
  });
}

async function createLeagueFromSetup(page, { seed = 20260306 } = {}) {
  await page.goto("/");
  await waitSetupReady(page);
  const advancedSettings = page.locator("details:has(#seedInput)");
  if (!(await advancedSettings.getAttribute("open"))) {
    await advancedSettings.locator(":scope > summary").click();
  }
  await page.fill("#seedInput", String(seed));
  await expect(page.locator("#seedInput")).toHaveValue(String(seed));
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
}

test("the development report's Share control rasterizes a non-empty moment card", async ({ page }) => {
  // A full season plus offseason drive is mostly spent reaching the
  // retirements stage; the default 90s budget is not enough.
  test.setTimeout(240_000);
  await stubShareCapture(page);
  await createLeagueFromSetup(page);

  await page.evaluate(async () => {
    const advance = async () => (await fetch("/api/offseason/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    await fetch("/api/advance-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 1 }) });
    for (let i = 0; i < 12; i += 1) {
      const result = await advance();
      const history = result?.pipeline?.history || [];
      if (history.some((entry) => entry.stage === "retirements")) break;
      if (result?.pipeline?.completed) break;
    }
  });

  await page.click('[data-testid="refresh-btn"]');
  await waitGameReady(page);
  await page.click('[data-testid="tab-history"]');
  await expect(page.locator("#offseasonDevelopmentSummary")).toContainText(/improved \(\d+%\)/, { timeout: 30_000 });

  const shareButton = page.locator("#offseasonDevelopmentPanel [data-moment-share-btn]");
  await expect(shareButton).toBeVisible({ timeout: 15_000 });
  await shareButton.click();

  await expect
    .poll(async () => page.evaluate(() => window.__momentShareCalls?.length || 0), { timeout: 15_000 })
    .toBeGreaterThan(0);

  const calls = await page.evaluate(() => window.__momentShareCalls);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0].size).toBeGreaterThan(0);
});
