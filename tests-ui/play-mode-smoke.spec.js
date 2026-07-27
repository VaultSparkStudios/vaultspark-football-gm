import { test, expect } from "@playwright/test";

test("create league in play mode reaches the franchise screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
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

  const tactic = page.locator("#halftimeAdjustModal .tactic-option").first();
  await expect(tactic).toBeVisible({ timeout: 10_000 });
  await tactic.click();
  await page.locator("#halftimeAdjustModal .tactic-confirm-btn").click();

  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 120_000 });
  await expect(page.locator(".weekly-plan-receipt")).toContainText("Weekly plan committed");
  await expect(page.locator(".weekly-plan-receipt")).toContainText("tactic run-heavy");
  await page.locator("details.architecture-review summary").click();
  await expect(page.locator(".architect-ledger-row").first()).toBeVisible();
  await expect(page.locator(".architecture-mastery")).toBeVisible();
  await expect(page.locator(".architecture-mastery .gm-mastery-disclaimer")).toContainText("not a causal claim");
  await expect(page.locator(".week-room-horizon").first()).not.toHaveText(beforeSeasonChapter || "");
  await expect(page.locator("#yearCard")).not.toHaveText(before || "");
});

test("returning player can continue the exact live Season chapter", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);

  await page.evaluate(async () => {
    const dashboard = await fetch("/api/state").then((response) => response.json());
    const { franchiseScopeFromDashboard, franchiseStorageKey } = await import("./lib/franchiseScope.js");
    const scope = franchiseScopeFromDashboard(dashboard);
    const key = franchiseStorageKey("franchise-architect-last-seen:v2", dashboard);
    localStorage.setItem(key, JSON.stringify({
      scope,
      timestamp: Date.now() - (7 * 60 * 60 * 1000),
      year: dashboard.currentYear,
      week: dashboard.currentWeek,
      record: null
    }));
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
