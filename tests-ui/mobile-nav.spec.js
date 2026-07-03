import { test, expect } from "@playwright/test";

// Guards the CANON-041 mobile nav drawer implementation:
// on narrow viewports the hamburger opens a full-height scrollable sidebar drawer;
// desktop keeps the inline sidebar.

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeague(page) {
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  // Dismiss tutorial overlay so it doesn't intercept clicks
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
  // Dismiss mobile loop overlay — tests start from full game view so nav drawer is reachable
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toHaveClass(/hidden/, { timeout: 5_000 }).catch(() => {});
  }
}

test("mobile viewport shows hamburger button and hides inline nav", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  // Hamburger is visible on mobile
  const hamburger = page.locator("#navDrawerBtn");
  await expect(hamburger).toBeVisible();

  // Side-menu is off-screen (left: -260px → not in viewport)
  const sideMenuBox = await page.locator("#sideNav").boundingBox();
  expect(sideMenuBox).not.toBeNull();
  // The drawer starts left of the viewport (negative x)
  expect(sideMenuBox.x + sideMenuBox.width).toBeLessThanOrEqual(10);
});

test("hamburger opens mobile nav drawer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  const hamburger = page.locator("#navDrawerBtn");
  await hamburger.click();

  // Body gets nav-drawer-open class
  await expect(page.locator("body")).toHaveClass(/nav-drawer-open/);
  // aria-expanded flips to true
  await expect(hamburger).toHaveAttribute("aria-expanded", "true");
  // Drawer slides into viewport
  const sideMenuBox = await page.locator("#sideNav").boundingBox();
  expect(sideMenuBox.x).toBeGreaterThanOrEqual(0);
});

test("close button dismisses the mobile nav drawer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  await page.locator("#navDrawerBtn").click();
  await expect(page.locator("body")).toHaveClass(/nav-drawer-open/);

  await page.locator("#navDrawerCloseBtn").click();
  await expect(page.locator("body")).not.toHaveClass(/nav-drawer-open/);
  await expect(page.locator("#navDrawerBtn")).toHaveAttribute("aria-expanded", "false");
});

test("selecting a tab auto-closes the mobile nav drawer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  await page.locator("#navDrawerBtn").click();
  await expect(page.locator("body")).toHaveClass(/nav-drawer-open/);

  // Click the Roster tab inside the open drawer
  await page.locator("#tab-roster").click();
  await expect(page.locator("body")).not.toHaveClass(/nav-drawer-open/);
});

test("desktop viewport hides hamburger and keeps inline sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createLeague(page);

  // Hamburger is hidden on desktop
  const hamburger = page.locator("#navDrawerBtn");
  await expect(hamburger).toBeHidden();

  // Side-menu is visible inline (not off-screen)
  const sideMenuBox = await page.locator("#sideNav").boundingBox();
  expect(sideMenuBox).not.toBeNull();
  expect(sideMenuBox.x).toBeGreaterThanOrEqual(0);
});
