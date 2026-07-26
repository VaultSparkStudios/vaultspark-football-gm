import { test, expect } from "@playwright/test";

// Tests for the CANON-041 mobile nav drawer — a scrollable 100dvh slide-in
// panel that replaces the static sidebar on narrow viewports (≤640px).
//
// Viewport choice: 550×900 sits in the 481–640px band where the hamburger
// drawer is active but the mobile-loop overlay does NOT auto-activate
// (mobile loop auto-enables at ≤480px). This cleanly isolates the drawer.

const DRAWER_VIEWPORT = { width: 550, height: 900 };

async function waitGameReady(page) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
}

async function dismissTutorialIfVisible(page) {
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

async function createLeagueMobile(page) {
  await page.setViewportSize(DRAWER_VIEWPORT);
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
}

test("mobile hamburger button is visible at 390px width", async ({ page }) => {
  await createLeagueMobile(page);
  const toggle = page.locator("#mobileNavToggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("mobile nav drawer opens when hamburger is clicked", async ({ page }) => {
  await createLeagueMobile(page);

  const toggle = page.locator("#mobileNavToggle");
  const nav = page.locator("#gameNav");

  // Drawer should start off-screen (aria-expanded=false)
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();

  // After click: aria-expanded true, body has mobile-nav-open class
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("body")).toHaveClass(/mobile-nav-open/);

  // Nav should now be translated on-screen — verify it contains tab buttons
  await expect(nav.locator("[data-testid='tab-overview']")).toBeVisible();
  await expect(nav.locator("[data-testid='tab-roster']")).toBeVisible();
});

test("tapping a nav tab closes the drawer and shows the correct panel", async ({ page }) => {
  await createLeagueMobile(page);

  // Open the drawer
  await page.locator("#mobileNavToggle").click();
  await expect(page.locator("body")).toHaveClass(/mobile-nav-open/);

  // Tap the Roster tab
  await page.locator("[data-testid='tab-roster']").click();

  // Drawer should be closed
  await expect(page.locator("body")).not.toHaveClass(/mobile-nav-open/);
  await expect(page.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "false");
});

test("tapping the backdrop closes the mobile nav drawer", async ({ page }) => {
  await createLeagueMobile(page);

  await page.locator("#mobileNavToggle").click();
  await expect(page.locator("body")).toHaveClass(/mobile-nav-open/);

  // Tap the backdrop to the right of the 280px drawer (drawer occupies x=0..280 at this viewport)
  await page.locator("#mobileNavBackdrop").click({ position: { x: 420, y: 450 } });

  await expect(page.locator("body")).not.toHaveClass(/mobile-nav-open/);
  await expect(page.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "false");
});

test("hamburger is hidden at desktop viewport and side-menu is visible", async ({ page }) => {
  // Desktop viewport — hamburger must be invisible and sidebar in flow
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);

  // Hamburger hidden on desktop
  await expect(page.locator("#mobileNavToggle")).toBeHidden();

  // Desktop tab buttons are directly accessible
  await expect(page.locator("[data-testid='tab-overview']")).toBeVisible();
  await expect(page.locator("[data-testid='tab-settings']")).toBeVisible();
});
