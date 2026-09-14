import { test, expect } from "@playwright/test";

/**
 * S108 — the Offseason Development Report card on the History tab.
 *
 * The card's renderer is a lazily imported module (the history island sits
 * within 1% of its boot-budget headroom floor), so this spec proves two things
 * the node tests cannot: the lazy module loads in a real browser, and the
 * report the runtime writes at the retirements stage reaches the screen.
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

test("the development report card renders its placeholder before any offseason, from a lazily loaded module", async ({ page }) => {
  await createLeagueFromSetup(page);
  await page.click('[data-testid="tab-history"]');
  await expect(page.locator("#offseasonDevelopmentPanel")).toBeVisible();
  await expect(page.locator("#offseasonDevelopmentSummary")).toContainText("Advance the retirements stage");
});

test("after an offseason's retirements stage the card names the club's risers and fallers", async ({ page }) => {
  // A full season is simulated in-page to reach the offseason; the default
  // 90 s budget is mostly spent there.
  test.setTimeout(240_000);
  await createLeagueFromSetup(page);
  // Drive the runtime to the retirements stage through its own API, the way
  // the node tests do, then re-read the dashboard the way the UI does.
  const stage = await page.evaluate(async () => {
    const advance = async () => (await fetch("/api/offseason/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    // Reach the offseason first: the pipeline only advances from there.
    await fetch("/api/advance-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 1 }) });
    let last = null;
    for (let i = 0; i < 12; i += 1) {
      last = await advance();
      const history = last?.pipeline?.history || [];
      if (history.some((entry) => entry.stage === "retirements")) break;
      if (last?.pipeline?.completed) break;
    }
    return last?.pipeline || null;
  });
  const retirements = (stage?.history || []).find((entry) => entry.stage === "retirements");
  expect(retirements, "the retirements stage ran").toBeTruthy();
  expect(retirements.result?.message).toMatch(/improved, \d+ declined/);
  expect(stage.developmentReport?.club?.progressed, "the runtime keeps the report on the pipeline").toBeGreaterThan(0);

  // The screen refreshes the way a player's does — the dashboard Refresh
  // control reloads state — and the History tab renders from that state.
  await page.click('[data-testid="refresh-btn"]');
  await waitGameReady(page);
  const dashboardReport = await page.evaluate(async () => {
    const payload = await (await fetch("/api/state")).json();
    const pipeline = payload?.dashboard?.offseasonPipeline || payload?.state?.offseasonPipeline || payload?.offseasonPipeline || null;
    return { keys: Object.keys(payload || {}), stage: pipeline?.stage ?? null, progressed: pipeline?.developmentReport?.club?.progressed ?? null };
  });
  expect(dashboardReport.progressed, `the dashboard state carries the report (${JSON.stringify(dashboardReport)})`).toBeGreaterThan(0);
  await page.click('[data-testid="tab-history"]');
  await expect(page.locator("#offseasonDevelopmentSummary")).toContainText(/improved \(\d+%\)/);
  await expect(page.locator("#offseasonDevelopmentTable tr").nth(1)).toBeVisible();
  await expect(page.locator("#offseasonDevelopmentTable")).toContainText(/Riser|Faller/);
  await expect(page.locator("#offseasonDevelopmentTable")).toContainText("→");
});
