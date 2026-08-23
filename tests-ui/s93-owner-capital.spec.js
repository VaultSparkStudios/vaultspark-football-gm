import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the S93 owner-capital surfaces.
 *
 * This session *replaced* live UI: the three raw facility number boxes are gone
 * and a priced facilities market stands where they were. That is the same shape
 * as S63's coaching market, and it carries the same risk — a render or wiring
 * failure would leave players unable to change their facilities at all, while
 * every node-level adapter and contract test kept passing. It also loads its
 * markup through a dynamic import to stay out of the settings island's boot
 * budget, which is exactly the kind of wiring only a real browser can prove.
 */

async function startFranchise(page) {
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
}

async function openOwnerPanel(page) {
  await page.locator('[data-tab="boardroomTab"]').first().click();
  await expect(page.locator("#boardroomTab")).toHaveClass(/active/);
  await page.locator("#loadOwnerBtn").click();
  await expect(page.locator("#facilitiesMarket .control-spotlight-grid")).toBeVisible({ timeout: 30_000 });
}

test("the raw facility number boxes are gone from the shipped page", async ({ page }) => {
  await startFranchise(page);
  await page.locator('[data-tab="boardroomTab"]').first().click();

  // The defect was three free number boxes. Their absence is the fix's receipt.
  await expect(page.locator("#ownerTrainingInput")).toHaveCount(0);
  await expect(page.locator("#ownerRehabInput")).toHaveCount(0);
  await expect(page.locator("#ownerAnalyticsInput")).toHaveCount(0);

  // The economics that are still the player's to set directly remain.
  await expect(page.locator("#ownerTicketPriceInput")).toHaveCount(1);
  await expect(page.locator("#ownerStaffBudgetInput")).toHaveCount(1);
});

test("the facilities market renders a real price, allowance and upkeep for each wing", async ({ page }) => {
  await startFranchise(page);
  await openOwnerPanel(page);

  const market = page.locator("#facilitiesMarket");
  await expect(market).toContainText(/Club cash \$/);
  await expect(market).toContainText(/facility upkeep \$/);
  await expect(market).toContainText(/operating reserve \$/);

  for (const wing of ["training", "rehab", "analytics"]) {
    const card = market.locator(".control-spotlight-card", { hasText: wing }).first();
    await expect(card).toBeVisible();
    // A price, a build allowance and a recurring cost — not a number box.
    await expect(card).toContainText(/Next point \$/);
    await expect(card).toContainText(/of 3 left to build this year/);
    await expect(card).toContainText(/Upkeep \$/);
  }
});

test("the gate pricing card reports the league centre and that the maximum price is not the best price", async ({ page }) => {
  await startFranchise(page);
  await openOwnerPanel(page);

  const pricing = page.locator("#facilitiesMarket .control-spotlight-card", { hasText: "Gate Pricing" });
  await expect(pricing).toBeVisible();
  await expect(pricing).toContainText(/league mean \d+/);
  await expect(pricing).toContainText(/Attendance \d+% of what fan interest alone would fill/);

  const text = (await pricing.textContent()) || "";
  const best = Number(text.match(/Best gate revenue near (\d+)/)?.[1]);
  expect(Number.isFinite(best)).toBe(true);
  // The whole point of giving the dial a demand curve: the legal ceiling (450)
  // is no longer the answer.
  expect(best).toBeLessThan(450);
  expect(best).toBeGreaterThan(35);
});

test("breaking ground moves the level, spends cash, and then reports the allowance is spent", async ({ page }) => {
  await startFranchise(page);
  await openOwnerPanel(page);

  const trainingCard = () =>
    page.locator("#facilitiesMarket .control-spotlight-card", { hasText: "training" }).first();
  const levelOf = async () => {
    const text = (await trainingCard().textContent()) || "";
    return Number(text.match(/^\s*training\s*(\d+)/m)?.[1] ?? text.match(/(\d+)\s*\|\s*league/)?.[1]);
  };

  const before = await levelOf();
  expect(Number.isFinite(before)).toBe(true);

  await page.selectOption("#facilityInvestSelect", "training");
  await page.fill("#facilityInvestPoints", "3");
  await page.locator("#investFacilityBtn").click();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  await expect(trainingCard()).toContainText(/0 of 3 left to build this year/, { timeout: 30_000 });
  const after = await levelOf();
  expect(after).toBe(before + 3);
});
