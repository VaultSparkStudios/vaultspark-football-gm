import { test, expect } from "@playwright/test";
import { createPlayScenario, readDashboard, WEEKLY_SCENARIOS } from "./helpers/weekly-scenarios.js";

test("create league in play mode reaches the franchise screen", async ({ page }) => {
  await createPlayScenario(page);
  await expect(page.locator("#yearCard")).toContainText("2026");
});

for (const scenario of WEEKLY_SCENARIOS) {
test(`first session commits exactly one ${scenario.name} with a durable evidence trail`, async ({ page }) => {
  test.setTimeout(120_000);
  await createPlayScenario(page, scenario);
  await expect(page.locator(".tutorial-overlay")).toBeVisible();

  for (let step = 0; step < 3; step += 1) {
    await page.locator(".tutorial-choice").first().click();
    await expect(page.locator("#tutNextBtn")).toBeEnabled();
    await page.locator("#tutNextBtn").click();
  }

  await expect(page.locator(".tutorial-receipt")).toContainText("Opening Contract Applied", { timeout: 20_000 });
  await expect(page.locator(".tutorial-receipt-row")).toHaveCount(3);
  await expect(page.locator(".tutorial-receipt-row").first()).toContainText("Applied from the current league state");
  await page.getByRole("button", { name: "Enter the Franchise" }).click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);

  await expect(page.locator("#openingContractCard")).toBeVisible();
  await expect(page.locator("#openingContractCard")).toContainText("Opening Contract");
  const before = await readDashboard(page);
  expect(before.controlledTeamId).toBe(scenario.teamId);
  expect(before.phase).toBe("regular-season");
  expect(before.currentWeek).toBe(1);
  expect(before.controlledOnBye).toBe(scenario.onBye);
  expect(before.currentWeekSchedule.byeTeams.includes(scenario.teamId)).toBe(scenario.onBye);
  expect(before.currentWeekSchedule.games.some((game) => [game.homeTeamId, game.awayTeamId].includes(scenario.teamId))).toBe(!scenario.onBye);
  const beforeSeasonChapter = await page.locator(".week-room-horizon").first().textContent();
  const advances = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/advance-week" && request.method() === "POST") advances.push(request.postDataJSON());
  });
  // Observe real modal visibility across the entire commit, not just its end.
  await page.evaluate(() => {
    window.__weeklyModalOpens = [];
    const modals = ["halftimeAdjustModal", "architectPlanRehearsalModal"].map((id) => document.getElementById(id));
    const observer = new MutationObserver(() => {
      for (const modal of modals) {
        if (!modal.hidden && modal.classList.contains("active")) window.__weeklyModalOpens.push(modal.id);
      }
    });
    for (const modal of modals) observer.observe(modal, { attributes: true, attributeFilter: ["hidden", "class"] });
    window.__weeklyModalObserver = observer;
  });
  const committedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/advance-week" && response.request().method() === "POST");
  await page.locator("#advanceWeekBtn").click();

  const decision = page.locator("#gmDecisionOptions .gm-decision-option").first();
  const tactic = page.locator("#halftimeAdjustModal .tactic-option").first();
  const byeReceipt = page.locator(".weekly-plan-receipt", { hasText: "Bye week" });
  await expect.poll(async () => (await decision.isVisible()) || (await tactic.isVisible()) || (await byeReceipt.isVisible()), { timeout: 30_000 }).toBe(true);
  if (await decision.isVisible()) await decision.click();
  if (!scenario.onBye) {
    await expect(tactic).toBeVisible();
    await tactic.click();
    await page.locator("#halftimeAdjustModal .tactic-confirm-btn").click();
    await expect(page.locator("#architectPlanRehearsalModal")).toBeVisible();
    await expect(page.locator("#architectRehearsalCounter")).not.toBeEmpty();
    await page.locator("#commitArchitectPlanBtn").click();
  }

  const response = await committedResponse;
  expect(response.ok()).toBe(true);
  const commit = await response.json();
  expect(commit.ok).toBe(true);
  expect(commit.commandReceipt.count).toBe(1);
  expect(commit.commandReceipt.started.week).toBe(before.currentWeek);
  expect(commit.commandReceipt.completed.week).toBe(before.currentWeek + 1);
  expect(advances).toHaveLength(1);
  expect(advances[0].count).toBe(1);
  if (scenario.onBye) expect(advances[0].weeklyTacticOverride).toBeUndefined();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 120_000 });
  const firstDebriefDecline = page.locator("#firstDebriefDecline");
  if (await firstDebriefDecline.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstDebriefDecline.click();
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
  }
  if (scenario.onBye) {
    // A bye is an authoritative empty state, not a missing read: the plan says
    // so in its own receipt and must not have asked for a tactic.
    await expect(byeReceipt).toContainText("bye week — no opponent");
    await expect(byeReceipt).toContainText("GM call → bye week");
    await expect(page.locator("#halftimeAdjustModal")).toBeHidden();
    await expect(page.locator("#architectPlanRehearsalModal")).toBeHidden();
    expect(await page.evaluate(() => window.__weeklyModalOpens)).toEqual([]);
    expect(commit.architectEntry.intent.tactic).toBeNull();
    expect(commit.architectEntry.outcome.recordAfter).toEqual(commit.architectEntry.outcome.recordBefore);
  } else {
    await expect(page.locator(".weekly-plan-receipt")).toContainText("Weekly plan committed");
    await expect(page.locator(".weekly-plan-receipt")).toContainText("tactic: run heavy");
    await expect(page.locator(".weekly-plan-receipt")).toContainText("reviewed against");
  }
  await page.locator("details.architecture-review summary").click();
  await expect(page.locator(".architect-ledger-row").first()).toBeVisible();
  await expect(page.locator(".architecture-mastery")).toBeVisible();
  await expect(page.locator(".gm-mastery-signature")).toBeVisible();
  await expect(page.locator(".gm-mastery-signature")).toContainText("Strongest signature");
  await expect(page.locator(".gm-mastery-signature")).toContainText(/recorded move|Still taking shape/);
  await expect(page.locator(".architecture-mastery .gm-mastery-disclaimer")).toContainText("not a causal claim");
  await expect(page.locator(".week-room-horizon").first()).not.toHaveText(beforeSeasonChapter || "");
  await expect(page.locator("#yearCard")).toContainText(`/ W${before.currentWeek + 1}`);
  const receipt = await page.evaluate(async () => (await import("./lib/appState.js")).state.weeklyPlanReceipt);
  expect(receipt.status).toBe("committed");
  expect(receipt.onBye).toBe(scenario.onBye);
  expect(receipt.observed.architectReceiptId).toBe(commit.architectEntry.id);

  // The composer receipt belongs to this page. The engine's architect entry is
  // the durable authority; reload must retain it and must not advance again.
  await page.reload();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const reloaded = await readDashboard(page);
  expect(reloaded.currentYear).toBe(before.currentYear);
  expect(reloaded.currentWeek).toBe(before.currentWeek + 1);
  expect(reloaded.controlledTeamId).toBe(scenario.teamId);
  expect(reloaded.architectLedger.filter((entry) => entry.id === commit.architectEntry.id)).toEqual([commit.architectEntry]);
  expect(reloaded.controlledOnBye).toBe(reloaded.currentWeekSchedule.byeTeams.includes(scenario.teamId));
  expect(advances).toHaveLength(1);
  await expect(page.locator(".weekly-plan-receipt")).toHaveCount(0);
  await page.locator("details.architecture-review summary").click();
  await expect(page.locator(".architect-ledger-row").first()).toBeVisible();
});
}

test("returning player can continue the exact live Season chapter", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);

  await page.evaluate(async () => {
    const dashboard = await fetch("/api/state").then((response) => response.json());
    const { recordReturnBoundary } = await import("./lib/returnDigest.js");
    recordReturnBoundary(dashboard, { reason: "browser-test-prior-session" });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("return-digest-browser-test")) return;
    const key = Object.keys(localStorage).find((entry) => entry.startsWith("franchise-architect-session-boundary:v3"));
    if (!key) throw new Error("Versioned return boundary missing");
    const prior = JSON.parse(localStorage.getItem(key));
    prior.timestamp = Date.now() - (7 * 60 * 60 * 1000);
    prior.week = Number(prior.week || 0) - 1;
    prior.chapterId = "browser-test-prior-chapter";
    localStorage.setItem(key, JSON.stringify(prior));
    sessionStorage.setItem("return-digest-browser-test", "applied");
  });

  await page.reload();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const continueButton = page.locator('[data-action="continue-chapter"]');
  await expect(continueButton).toBeVisible({ timeout: 20_000 });
  await expect(continueButton).toContainText("Continue");
  await continueButton.click();
  await expect(page.locator(".return-digest-overlay")).toHaveCount(0);
  await expect(page.locator("#franchiseCommandCenter")).toBeFocused();
});
