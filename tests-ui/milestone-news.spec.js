import { test, expect } from "@playwright/test";
import { createZeroedSeasonStats } from "../src/domain/playerFactory.js";
import { capturePlayerMilestoneStats, reportPlayerMilestones } from "../src/engine/beatReporter.js";

test("canonical milestone news is visible, closeable, and reopenable", async ({ page }) => {
  const season = createZeroedSeasonStats();
  season.passing.yards = 3990;
  const player = { id: "milestone-visual", name: "Alex Morgan", position: "QB", teamId: "BUF", seasonStats: { 2026: season } };
  const league = {};
  const previous = capturePlayerMilestoneStats([player], 2026);
  season.passing.yards += 310;
  reportPlayerMilestones(league, [player], 2026, 14, previous);
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready");
  await page.selectOption("#runtimeModeSelect", "client");
  await expect(page.locator('#teamSelect option[value="BUF"]')).toHaveCount(1, { timeout: 60000 });
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/game\.html$/, { timeout: 90000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.evaluate(async rows => {
    const { state } = await import("/lib/appState.js");
    const { renderNewsTicker } = await import("/lib/tabOverview.js");
    state.dashboard.newsLog = rows;
    renderNewsTicker();
  }, league.newsLog);
  const ticker = page.locator("#newsTicker");
  await expect(ticker).toBeVisible();
  await expect(ticker).toContainText("Alex Morgan surpasses 4,000 passing yards");
  const closeTarget = await page.locator("#closeNewsTickerBtn").boundingBox();
  expect(closeTarget.width).toBeGreaterThanOrEqual(44);
  expect(closeTarget.height).toBeGreaterThanOrEqual(44);
  await page.locator("#closeNewsTickerBtn").click();
  await expect(ticker).toBeHidden();
  await page.keyboard.press("n");
  await expect(ticker).toBeVisible();
  await page.evaluate(async () => {
    const { state } = await import("/lib/appState.js");
    state.dashboard.newsLog = [];
    state.newsRows = [];
    const { renderNewsTicker } = await import("/lib/tabOverview.js");
    renderNewsTicker();
  });
  await expect(ticker).toBeHidden();
  await page.keyboard.press("n");
  await expect(ticker).toBeHidden();
});
