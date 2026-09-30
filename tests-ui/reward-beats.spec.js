import { test, expect } from "@playwright/test";
import { createPlayScenario, readDashboard, WEEKLY_SCENARIOS } from "./helpers/weekly-scenarios.js";

// S70 reward-layer contract: advancing a week produces a visible recap beat,
// the trophy case renders in settings, and the sound toggle persists.

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
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

async function createLeague(page, scenario = WEEKLY_SCENARIOS[0]) {
  await createPlayScenario(page, scenario);
  await expect(page.locator("#tutSkipBtn")).toBeVisible();
  await dismissTutorialIfVisible(page);
}

async function drainWeeklyPlanModals(page, dashboard) {
  const gmDecisionChoice = page.locator("#gmDecisionOptions .gm-decision-option").first();
  if (dashboard.gmDecisionQueue.length > 0) {
    await expect(gmDecisionChoice).toBeVisible();
    await gmDecisionChoice.click();
  }
  // The GM lookup is asynchronous even when its queue is empty. Await the
  // expected next gate; isVisible({ timeout }) only takes an instant snapshot.
  if (dashboard.controlledOnBye) return;
  const skipBtn = page.locator("#halftimeAdjustModal .tactic-skip-btn");
  await expect(skipBtn).toBeVisible();
  await skipBtn.click();
  const commitPlan = page.locator("#commitArchitectPlanBtn");
  await expect(commitPlan).toBeVisible();
  await commitPlan.click();
}

for (const scenario of WEEKLY_SCENARIOS) {
  test(`advancing one ${scenario.name} produces its expected recap state`, async ({ page }) => {
    await createLeague(page, scenario);
    const before = await readDashboard(page);
    expect(before.controlledTeamId).toBe(scenario.teamId);
    expect(before.phase).toBe("regular-season");
    expect(before.currentWeek).toBe(1);
    expect(before.controlledOnBye).toBe(scenario.onBye);
    expect(before.currentWeekSchedule.byeTeams.includes(scenario.teamId)).toBe(scenario.onBye);
    expect(before.currentWeekSchedule.games.some((game) => [game.homeTeamId, game.awayTeamId].includes(scenario.teamId))).toBe(!scenario.onBye);
    expect(Array.isArray(before.gmDecisionQueue)).toBe(true);

    const advances = [];
    const isAdvance = (request) => new URL(request.url()).pathname === "/api/advance-week" && request.method() === "POST";
    page.on("request", (request) => {
      if (isAdvance(request)) advances.push(request.postDataJSON());
    });
    const [response] = await Promise.all([
      page.waitForResponse((response) => isAdvance(response.request())),
      (async () => {
        await page.click("#advanceWeekBtn");
        await drainWeeklyPlanModals(page, before);
      })()
    ]);
    expect(response.ok()).toBe(true);
    const commit = await response.json();
    expect(commit.ok).toBe(true);
    expect(commit.commandReceipt.count).toBe(1);
    expect(commit.commandReceipt.started.week).toBe(before.currentWeek);
    expect(commit.commandReceipt.completed.week).toBe(before.currentWeek + 1);
    await waitGameReady(page);
    expect(advances).toHaveLength(1);
    expect(advances[0].count).toBe(1);
    expect((await readDashboard(page)).currentWeek).toBe(before.currentWeek + 1);

    const card = page.locator("#weekRecapCard.wr-visible");
    if (!scenario.onBye) {
      await expect(page.locator("#boxScoreTicker [data-boxscore-id]")).not.toHaveCount(0);
      await expect(card).toBeVisible();
      await expect(card.locator(".wr-kicker")).toContainText(`Week ${before.currentWeek}`);
      await card.locator(".wr-close").click();
      await expect(page.locator("#weekRecapCard.wr-visible")).toHaveCount(0);
    } else {
      // A scheduled opening bye stays honestly silent.
      await expect(page.locator("#boxScoreTicker [data-boxscore-id]")).toHaveCount(0);
      await expect(page.locator(".weekly-plan-receipt")).toContainText("Bye week");
      await expect(page.locator("#halftimeAdjustModal")).toBeHidden();
      await expect(page.locator("#architectPlanRehearsalModal")).toBeHidden();
      expect(advances[0].weeklyTacticOverride).toBeUndefined();
      await expect(card).toHaveCount(0);
    }
  });
}

test("trophy case renders the full registry and the sound toggle persists", async ({ page }) => {
  await createLeague(page);
  await page.click('[data-testid="tab-settings"]');
  await expect(page.locator("#trophyCaseContent .trophy")).not.toHaveCount(0, { timeout: 10_000 });
  const trophies = await page.locator("#trophyCaseContent .trophy").count();
  expect(trophies).toBeGreaterThanOrEqual(25);
  await expect(page.locator(".trophy-case-summary")).toContainText("/");

  const sound = page.locator("#soundEnabledInput");
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await page.reload();
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
  await page.click('[data-testid="tab-settings"]');
  await expect(page.locator("#soundEnabledInput")).not.toBeChecked();
});
