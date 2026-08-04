import { test, expect } from "@playwright/test";

// S70 reward-layer contract: advancing a week produces a visible recap beat,
// the trophy case renders in settings, and the sound toggle persists.

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function waitGameReady(page, timeout = 60_000) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout });
}

async function dismissTutorialIfVisible(page) {
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

async function createLeague(page) {
  await page.goto("/");
  await waitSetupReady(page);
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
}

async function drainWeeklyPlanModals(page) {
  const gmDecisionChoice = page.locator("#gmDecisionOptions .gm-decision-option").first();
  if (await gmDecisionChoice.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await gmDecisionChoice.click();
  }
  const skipBtn = page.locator("#halftimeAdjustModal .tactic-skip-btn");
  if (await skipBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skipBtn.click();
  }
  const commitPlan = page.locator("#commitArchitectPlanBtn");
  if (await commitPlan.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await commitPlan.click();
  }
}

test("advancing a week surfaces a recap beat card unless the team was on a bye", async ({ page }) => {
  await createLeague(page);
  await page.click("#advanceWeekBtn");
  await drainWeeklyPlanModals(page);
  await waitGameReady(page, 120_000);

  const card = page.locator("#weekRecapCard.wr-visible");
  const played = (await page.locator("#boxScoreTicker [data-boxscore-id]").count()) > 0;
  if (played) {
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator(".wr-kicker")).toContainText(/Week \d+/);
    await card.locator(".wr-close").click();
    await expect(page.locator("#weekRecapCard.wr-visible")).toHaveCount(0);
  } else {
    // A scheduled opening bye stays honestly silent.
    await expect(card).toHaveCount(0);
  }
});

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
