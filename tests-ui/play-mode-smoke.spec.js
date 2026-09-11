import { test, expect } from "@playwright/test";

test("create league in play mode reaches the franchise screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  await expect(page.locator("#yearCard")).toContainText("2026");
});

test("first session turns onboarding promises into a committed weekly evidence trail", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("vsfgm_tutorial_seen_v1"));
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");

  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
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
  const before = await page.locator("#yearCard").textContent();
  const beforeSeasonChapter = await page.locator(".week-room-horizon").first().textContent();
  await page.locator("#advanceWeekBtn").click();

  const decision = page.locator("#gmDecisionOptions .gm-decision-option").first();
  if (await decision.isVisible({ timeout: 10_000 }).catch(() => false)) await decision.click();

  // S105 — the bye-week defect S103 fixed in s63-surfaces was still latent here.
  //
  // This spec asserted the tactic modal unconditionally, but S102 made a bye
  // suppress the tactic step entirely (`composeWeeklyPlan`: `tacticalPhase =
  // regularSeason && !onByeWeek`), so on a bye there is no modal to click. The
  // browser league is generated from a random seed, so whether the controlled
  // team plays in the first advanced week varies per run — measured at roughly
  // one bye in five. That is exactly the intermittency observed: this test
  // failed in S104's CI run and again in S105's promotion gate
  // (`toBeVisible` → `hidden`) while passing in S105's own CI run on the very
  // same commit. Assert against whichever branch the product actually rendered;
  // a run that never draws a bye is a green that proves nothing.
  const tactic = page.locator("#halftimeAdjustModal .tactic-option").first();
  const byeReceipt = page.locator(".weekly-plan-receipt", { hasText: "Bye week" });
  await expect(tactic.or(byeReceipt).first()).toBeVisible({ timeout: 30_000 });
  const onBye = await byeReceipt.isVisible().catch(() => false);
  if (!onBye) {
    await tactic.click();
    await page.locator("#halftimeAdjustModal .tactic-confirm-btn").click();
    await expect(page.locator("#architectPlanRehearsalModal")).toBeVisible();
    await expect(page.locator("#architectRehearsalCounter")).not.toBeEmpty();
    await page.locator("#commitArchitectPlanBtn").click();
  }

  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 120_000 });
  const firstDebriefDecline = page.locator("#firstDebriefDecline");
  if (await firstDebriefDecline.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstDebriefDecline.click();
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
  }
  if (onBye) {
    // A bye is an authoritative empty state, not a missing read: the plan says
    // so in its own receipt and must not have asked for a tactic.
    await expect(byeReceipt).toContainText("bye week — no opponent");
    await expect(byeReceipt).toContainText("gm-decision → bye");
    await expect(page.locator("#halftimeAdjustModal .tactic-option")).toHaveCount(0);
  } else {
    await expect(page.locator(".weekly-plan-receipt")).toContainText("Weekly plan committed");
    await expect(page.locator(".weekly-plan-receipt")).toContainText("tactic run-heavy");
    await expect(page.locator(".weekly-plan-receipt")).toContainText("reviewed against");
  }
  await page.locator("details.architecture-review summary").click();
  await expect(page.locator(".architect-ledger-row").first()).toBeVisible();
  await expect(page.locator(".architecture-mastery")).toBeVisible();
  await expect(page.locator(".gm-mastery-signature")).toBeVisible();
  await expect(page.locator(".gm-mastery-signature")).toContainText("Strongest signature");
  await expect(page.locator(".gm-mastery-signature")).toContainText(/source receipt|Awaiting source receipts/);
  await expect(page.locator(".architecture-mastery .gm-mastery-disclaimer")).toContainText("not a causal claim");
  await expect(page.locator(".week-room-horizon").first()).not.toHaveText(beforeSeasonChapter || "");
  await expect(page.locator("#yearCard")).not.toHaveText(before || "");
});

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
