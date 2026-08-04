import { test, expect } from "@playwright/test";

// S70 root-funnel contract: first-time visitors get a one-click start and no
// returning-player furniture; returning players get Continue/Resume instead.

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

// The dev Playwright server is stateful across spec files, so first-visit
// behavior is exercised in the client runtime, where a fresh browser context
// is genuinely a fresh player.
async function gotoAsFreshClientVisitor(page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("vsfgm:runtime-mode", "client"));
  await page.reload();
  await waitSetupReady(page);
}

test("fresh visitor: one-click instant start reaches the game with a random team", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);

  // New-visitor hero: instant start visible; Continue/Resume hidden (not disabled).
  await expect(page.locator('[data-testid="instant-start-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="continue-active-btn"]')).toBeHidden();
  await expect(page.locator('[data-testid="resume-latest-btn"]')).toBeHidden();

  // No server-first language on the first paint of a zero-backend runtime.
  await expect(page.locator("#activeLeagueText")).not.toContainText("server");

  // Saved Leagues stays collapsed when there is nothing to show.
  await expect(page.locator("#savedLeaguesSection")).not.toHaveAttribute("open", "");

  // Team select defaults to the random option.
  await expect(page.locator("#teamSelect")).toHaveValue("__random__");

  // One click: instant start creates a league and lands in the game.
  await page.click('[data-testid="instant-start-btn"]');
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
});

test("quick start era card starts a league in the same click", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);
  await page.click("#presetBalancedBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
});

test("returning player sees Continue Franchise instead of instant start", async ({ page }) => {
  await page.goto("/");
  await waitSetupReady(page);
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  await page.goto("/");
  await waitSetupReady(page);
  await expect(page.locator('[data-testid="continue-active-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="instant-start-btn"]')).toBeHidden();
});
