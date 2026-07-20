import { test, expect } from "@playwright/test";

// Guards CANON-041: on narrow mobile viewports the sidebar is replaced by a
// sticky bottom tab nav. Verifies the nav is visible, switches tabs, and the
// More sheet opens/closes cleanly.

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeague(page) {
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click().catch(() => {});
  }
}

test.describe("Mobile bottom nav (CANON-041)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("bottom nav is visible and sidebar is hidden on mobile", async ({ page }) => {
    await createLeague(page);

    // Bottom nav must be present and visible
    const bottomNav = page.locator("#mobileBottomNav");
    await expect(bottomNav).toBeVisible();

    // The sidebar must not be visible on this viewport
    const sidebar = page.locator(".side-menu");
    await expect(sidebar).toBeHidden();

    // All four primary tab buttons present
    await expect(page.locator("[data-testid='mobile-tab-overview']")).toBeVisible();
    await expect(page.locator("[data-testid='mobile-tab-roster']")).toBeVisible();
    await expect(page.locator("[data-testid='mobile-tab-transactions']")).toBeVisible();
    await expect(page.locator("[data-testid='mobile-tab-draft']")).toBeVisible();
  });

  test("bottom nav switches tabs and marks active", async ({ page }) => {
    await createLeague(page);

    // Overview tab should be active by default
    const overviewBtn = page.locator("[data-testid='mobile-tab-overview']");
    await expect(overviewBtn).toHaveClass(/active/);
    await expect(page.locator("#overviewTab")).toBeVisible();

    // Click Roster tab
    const rosterBtn = page.locator("[data-testid='mobile-tab-roster']");
    await rosterBtn.click();
    await expect(rosterBtn).toHaveClass(/active/);
    await expect(overviewBtn).not.toHaveClass(/active/);
    await expect(page.locator("#rosterTab")).toBeVisible();
    await expect(page.locator("#overviewTab")).toBeHidden();
  });

  test("More button opens and closes the secondary tab sheet", async ({ page }) => {
    await createLeague(page);

    const moreBtn = page.locator("#mobileMoreBtn");
    const sheet = page.locator("#mobileMoreSheet");

    // Sheet starts hidden
    await expect(sheet).not.toHaveClass(/open/);

    // Open the sheet
    await moreBtn.click();
    await expect(sheet).toHaveClass(/open/);
    await expect(moreBtn).toHaveAttribute("aria-expanded", "true");

    // Secondary tabs are visible in the sheet
    await expect(page.locator("#mobileMoreSheet .mobile-more-item[data-tab='settingsTab']")).toBeVisible();

    // Close via close button
    await page.locator("#mobileMoreCloseBtn").click();
    await expect(sheet).not.toHaveClass(/open/);
    await expect(moreBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("selecting a More-sheet tab switches content and closes sheet", async ({ page }) => {
    await createLeague(page);

    await page.locator("#mobileMoreBtn").click();
    await expect(page.locator("#mobileMoreSheet")).toHaveClass(/open/);

    // Click Settings from the more sheet
    await page.locator("#mobileMoreSheet .mobile-more-item[data-tab='settingsTab']").click();

    // Settings panel is now active
    await expect(page.locator("#settingsTab")).toBeVisible();
    // Sheet is closed
    await expect(page.locator("#mobileMoreSheet")).not.toHaveClass(/open/);
  });
});
