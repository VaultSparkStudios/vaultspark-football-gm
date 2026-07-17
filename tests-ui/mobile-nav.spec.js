import { test, expect } from "@playwright/test";

// CANON-041 regression: 100dvh scrollable mobile nav drawer must open/close
// and close on tab selection. Verifies the hamburger replaces the inline
// side-menu reflow at mobile viewport widths.

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeagueAtMobile(page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
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

test("mobile: hamburger button is visible and side-menu is off-screen by default", async ({ page }) => {
  await createLeagueAtMobile(page);

  const toggle = page.locator("#mobileNavToggleBtn");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Side-menu should be off-screen (transformed left) without being display:none
  const sideMenu = page.locator("#sideMenu");
  await expect(sideMenu).toBeAttached();
  const box = await sideMenu.boundingBox();
  // Off-screen means right edge <= 0 or far left of viewport
  expect(box === null || (box.x + box.width) <= 0).toBe(true);
});

test("mobile: hamburger opens the drawer and close button dismisses it", async ({ page }) => {
  await createLeagueAtMobile(page);

  const toggle = page.locator("#mobileNavToggleBtn");
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Drawer should now be on-screen
  const sideMenu = page.locator("#sideMenu");
  const box = await sideMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);

  // Close with the X button
  await page.locator("#mobileNavCloseBtn").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const boxAfter = await sideMenu.boundingBox();
  expect(boxAfter === null || (boxAfter.x + boxAfter.width) <= 0).toBe(true);
});

test("mobile: selecting a tab closes the drawer", async ({ page }) => {
  await createLeagueAtMobile(page);

  await page.locator("#mobileNavToggleBtn").click();
  await expect(page.locator("#mobileNavToggleBtn")).toHaveAttribute("aria-expanded", "true");

  // Click the Roster tab in the drawer
  await page.locator("#tab-roster").click();
  await expect(page.locator("#mobileNavToggleBtn")).toHaveAttribute("aria-expanded", "false");

  // Roster tab panel should now be active
  await expect(page.locator("#rosterTab")).toBeVisible();
});

test("mobile: backdrop click closes the drawer", async ({ page }) => {
  await createLeagueAtMobile(page);

  await page.locator("#mobileNavToggleBtn").click();
  await expect(page.locator("#mobileNavToggleBtn")).toHaveAttribute("aria-expanded", "true");

  // Click the backdrop (area to the right of the drawer)
  await page.locator("#mobileNavBackdrop").click({ position: { x: 340, y: 400 } });
  await expect(page.locator("#mobileNavToggleBtn")).toHaveAttribute("aria-expanded", "false");
});

test("desktop: hamburger is hidden and side-menu is in normal flow", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  const toggle = page.locator("#mobileNavToggleBtn");
  await expect(toggle).not.toBeVisible();

  // Side-menu should be visible in normal flow
  const sideMenu = page.locator("#sideMenu");
  const box = await sideMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeGreaterThan(100);
});
