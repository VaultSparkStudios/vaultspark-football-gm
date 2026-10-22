import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

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

  // This seed's room/depth advice has no observed matching action: committing
  // a week records an unscored outcome instead of inventing agreement. The plan is
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
  await expect(page.locator("#frontOfficeAdvisorTally")).toHaveText(
    "0 with the room · 0 against · 1 unscored over 1 recorded week", { timeout: 60_000 }
  );

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
  const capturePhase = process.env.TRADE_EVALUATION_CAPTURE_PHASE || "after";
  if (capturePhase === "before") await page.route("**/app.js", async route =>
    route.fulfill({ contentType: "text/javascript", body: await fs.readFile(".cache/trade-evaluation-before/app.js.txt", "utf8") }));
  await page.addInitScript(() => localStorage.setItem("vsfgm:runtime-mode", "server"));
  await createLeague(page);
  await page.click('[data-testid="tab-transactions"]');
  await expect(page.locator("[data-trade-team-crest] svg")).toBeVisible();
  await expect(page.locator("#tradeTeamIdentityLabel")).not.toHaveText("Trade context");
  const teamA = await page.locator("#tradeTeamA").inputValue();
  const opponent = await page.locator("#tradeTeamB option").evaluateAll((options, controlled) =>
    options.map((option) => option.value).find((value) => value && value !== controlled), teamA);
  await page.locator("#tradeTeamB").selectOption(opponent);
  await waitGameReady(page);
  await expect(page.locator("#tradeTeamARosterTable button[data-trade-player-id]").first()).toBeVisible();
  await page.locator("#tradeTeamARosterTable button[data-trade-player-id]").first().click();
  await page.locator("#tradeTeamBRosterTable button[data-trade-player-id]").first().click();
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/trade/evaluate" && response.request().method() === "POST");
  await page.click("#evaluateTradeBtn");
  const response = await responsePromise;
  const evaluation = await response.json();
  expect(evaluation.ok).toBe(false);
  expect(evaluation.reasonCode).toBe("cap-failed");
  if (capturePhase === "before") {
    await expect(page.locator("#statusChip")).toContainText("Trade failed cap check");
    await expect(page.locator("#tradeEvalText")).toContainText("Use evaluate");
  } else {
    await waitGameReady(page);
    await expect(page.locator("#tradeEvalText")).toContainText("Cannot execute");
    await expect(page.locator("#tradeEvalText")).toContainText("remaining cap room");
  }
  await fs.mkdir("output/playwright", { recursive: true });
  for (const [viewport, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    const fullView = page.locator("#mlFullViewBtn");
    if (viewport === "mobile") {
      await expect(fullView).toBeVisible();
      await fullView.click();
      await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
    }
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async theme => (await import("/lib/themeCustomizer.js")).applyTheme(theme), theme);
      await page.locator("#tradeEvalText").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `output/playwright/s117-trade-evaluation-${capturePhase}-${viewport}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('[data-testid="tab-overview"]');
  await expect(page.locator('#firstSeasonContract [data-objective="answer-the-phone"]'))
    .toHaveAttribute("data-done", capturePhase === "before" ? "false" : "true");
});
