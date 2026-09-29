import { test, expect } from "@playwright/test";

// S109 — the Desk carries the Front Office Advisor and the First Season
// Contract; the league-wide tables moved to the League tab. This spec proves
// the surfaces render from a real boot, not from a fixture.

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

async function createLeague(page, seed = 20260306) {
  await page.goto("/");
  await waitSetupReady(page);
  const advancedSettings = page.locator("details:has(#seedInput)");
  if (!(await advancedSettings.getAttribute("open"))) {
    await advancedSettings.locator(":scope > summary").click();
  }
  await page.fill("#seedInput", String(seed));
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
}

test("the Desk shows the advisor's call and the first-season contract; the League tab holds the standings", async ({ page }) => {
  await createLeague(page);

  await expect(page.locator('[data-testid="tab-overview"]')).toHaveText("Desk");
  await expect(page.locator('[data-testid="tab-calendar"]')).toHaveText("League");

  const advisor = page.locator("#frontOfficeAdvisorPanel");
  await expect(advisor).toBeVisible({ timeout: 30_000 });
  await expect(advisor.locator(".advisor-card")).toHaveCount(1);
  await expect(advisor.locator(".advisor-call")).not.toBeEmpty();
  await expect(page.locator("#frontOfficeAdvisorTally")).toHaveText("No calls scored yet");

  const contract = page.locator("#firstSeasonContract");
  await expect(contract).toBeVisible();
  await expect(contract.locator("li.first-season-objective")).toHaveCount(5);
  await expect(page.locator("#firstSeasonContractProgress")).toHaveText("0 of 5");
  await expect(page.locator("#gmCommitmentBoard")).toBeHidden();

  // The standings and the news feed live on the League tab now.
  await expect(page.locator("#overviewTab #standingsTable")).toHaveCount(0);
  await expect(page.locator("#calendarTab #standingsTable")).toHaveCount(1);
  await expect(page.locator("#calendarTab #newsTable")).toHaveCount(1);

  // Committing a week scores the advice on the desk. The weekly plan is
  // composed in modals (decision → tactic → rehearsal); drain them like app.spec.
  await page.click("#advanceWeekBtn");
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
  await waitGameReady(page, 120_000);
  await expect(page.locator("#frontOfficeAdvisorTally")).toContainText(/over 1 week/, { timeout: 60_000 });

  // After a played week the League tab carries real standings rows.
  await page.click('[data-testid="tab-calendar"]');
  await expect(page.locator("#calendarTab #standingsTable tr").nth(1)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-league-team-crest] svg")).toBeVisible();
  await expect(page.locator("#leagueTeamIdentityLabel")).not.toHaveText("League context");
  await page.click('[data-testid="tab-overview"]');

  // Shelving the contract hides it and stays hidden after a re-render.
  await page.click("#firstSeasonContractDismissBtn");
  await expect(contract).toBeHidden();
});

test("a player can work the trade desk for the contract without waiting for a rival call", async ({ page }) => {
  await createLeague(page);
  await page.click('[data-testid="tab-transactions"]');
  await expect(page.locator("[data-trade-team-crest] svg")).toBeVisible();
  await expect(page.locator("#tradeTeamIdentityLabel")).not.toHaveText("Trade context");
  const teamA = await page.locator("#tradeTeamA").inputValue();
  const opponent = await page.locator("#tradeTeamB option").evaluateAll((options, controlled) =>
    options.map((option) => option.value).find((value) => value && value !== controlled), teamA);
  await page.locator("#tradeTeamB").selectOption(opponent);
  await expect(page.locator("#tradeTeamARosterTable button[data-trade-player-id]").first()).toBeVisible();
  await page.locator("#tradeTeamARosterTable button[data-trade-player-id]").first().click();
  await page.locator("#tradeTeamBRosterTable button[data-trade-player-id]").first().click();
  await page.click("#evaluateTradeBtn");
  await expect(page.locator("#tradeEvalText")).not.toContainText("Use evaluate", { timeout: 30_000 });
  await page.click('[data-testid="tab-overview"]');
  await expect(page.locator('#firstSeasonContract [data-objective="answer-the-phone"]')).toHaveAttribute("data-done", "true");
});
