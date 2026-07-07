import { test, expect } from "@playwright/test";

// Guards CANON-041: 100dvh scrollable mobile nav drawer with hamburger toggle.
// On narrow viewports the side-menu must be hidden off-screen and only shown
// when the user taps the hamburger button; selecting a tab must close it.

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function createLeague(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  // Dismiss tutorial if present and wait for overlay to fully clear
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0, { timeout: 10_000 });
  }
  // Disable the mobile loop overlay so it doesn't block the nav drawer at narrow viewports.
  // The overlay auto-activates at ≤480px and would intercept pointer events over the topbar.
  await page.evaluate(() => {
    localStorage.setItem("vsfgm_mobile_loop", "0");
    document.body.classList.remove("mobile-loop-active");
    const overlay = document.getElementById("mobileLoopOverlay");
    if (overlay) overlay.classList.add("hidden");
  });
}

test.describe("mobile nav drawer (CANON-041)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("hamburger visible and drawer hidden on mobile", async ({ page }) => {
    await createLeague(page);
    const hamburger = page.locator("#navDrawerToggleBtn");
    await expect(hamburger).toBeVisible();
    // Drawer starts off-screen — body must not have nav-drawer-open
    const drawerOpen = await page.evaluate(() =>
      document.body.classList.contains("nav-drawer-open")
    );
    expect(drawerOpen).toBe(false);
  });

  test("hamburger opens the nav drawer", async ({ page }) => {
    await createLeague(page);
    await page.locator("#navDrawerToggleBtn").click();
    const drawerOpen = await page.evaluate(() =>
      document.body.classList.contains("nav-drawer-open")
    );
    expect(drawerOpen).toBe(true);
    // Close button and at least one tab button must be visible in the drawer
    await expect(page.locator("#navDrawerCloseBtn")).toBeVisible();
    await expect(page.locator("#sideMenu")).toBeVisible();
  });

  test("selecting a tab closes the drawer", async ({ page }) => {
    await createLeague(page);
    await page.locator("#navDrawerToggleBtn").click();
    expect(await page.evaluate(() => document.body.classList.contains("nav-drawer-open"))).toBe(true);
    // Click the Roster tab inside the drawer
    await page.locator("#tab-roster").click();
    const drawerOpen = await page.evaluate(() =>
      document.body.classList.contains("nav-drawer-open")
    );
    expect(drawerOpen).toBe(false);
  });

  test("close button dismisses the drawer", async ({ page }) => {
    await createLeague(page);
    await page.locator("#navDrawerToggleBtn").click();
    await page.locator("#navDrawerCloseBtn").click();
    const drawerOpen = await page.evaluate(() =>
      document.body.classList.contains("nav-drawer-open")
    );
    expect(drawerOpen).toBe(false);
  });

  test("Escape key dismisses the drawer", async ({ page }) => {
    await createLeague(page);
    await page.locator("#navDrawerToggleBtn").click();
    await page.keyboard.press("Escape");
    const drawerOpen = await page.evaluate(() =>
      document.body.classList.contains("nav-drawer-open")
    );
    expect(drawerOpen).toBe(false);
  });
});
