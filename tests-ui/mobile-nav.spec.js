import { test, expect } from "@playwright/test";

// Guards CANON-041 mobile nav drawer: at ≤980px the sidebar becomes a
// hamburger-triggered 100dvh slide-in drawer instead of a flat inline grid.

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeague(page) {
  // Disable mobile loop before creating the league so it doesn't activate on narrow viewports
  // and intercept pointer events on the hamburger button / topbar.
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("vsfgm_mobile_loop", "0"));
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click().catch(() => {});
  }
}

test("hamburger toggle is visible on mobile, hidden on desktop", async ({ page }) => {
  // Mobile: hamburger should be visible
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createLeague(page);
  const toggle = page.locator("#navToggleBtn");
  await expect(toggle).toBeVisible();

  // Desktop: hamburger should be hidden
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toggle).toBeHidden();
});

test("mobile nav drawer opens and closes via hamburger; inert guards keyboard focus", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createLeague(page);

  const sideMenu = page.locator("#sideMenu");
  const toggle = page.locator("#navToggleBtn");

  // Drawer starts closed: off-screen and inert (no keyboard focus leak)
  await expect(sideMenu).not.toHaveClass(/nav-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await sideMenu.evaluate((el) => el.inert)).toBe(true);

  // Open — inert removed so nav is keyboard-reachable
  await toggle.click();
  await expect(sideMenu).toHaveClass(/nav-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await sideMenu.evaluate((el) => el.inert)).toBe(false);

  // Close via close button — drawer inerted again
  await page.locator("#navDrawerCloseBtn").click();
  await expect(sideMenu).not.toHaveClass(/nav-open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await sideMenu.evaluate((el) => el.inert)).toBe(true);
});

test("backdrop closes mobile nav drawer", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createLeague(page);

  const sideMenu = page.locator("#sideMenu");
  await page.locator("#navToggleBtn").click();
  await expect(sideMenu).toHaveClass(/nav-open/);

  // Click the backdrop at a point to the right of the open drawer.
  // The drawer is min(285px, 88vw) wide; on a 390px viewport that's 285px.
  // Clicking at x=350 avoids the drawer and hits the dimmed backdrop area.
  await page.locator("#navBackdrop").click({ position: { x: 350, y: 400 } });
  await expect(sideMenu).not.toHaveClass(/nav-open/);
});

test("selecting a tab closes the mobile nav drawer", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createLeague(page);

  const sideMenu = page.locator("#sideMenu");
  await page.locator("#navToggleBtn").click();
  await expect(sideMenu).toHaveClass(/nav-open/);

  // Click a tab inside the drawer
  await page.locator("#tab-roster").click();
  await expect(sideMenu).not.toHaveClass(/nav-open/);
});

test("mobile nav drawer is scrollable and covers full viewport height", async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createLeague(page);

  await page.locator("#navToggleBtn").click();
  const sideMenu = page.locator("#sideMenu");
  await expect(sideMenu).toHaveClass(/nav-open/);

  const styles = await sideMenu.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      position: cs.position,
      overflowY: cs.overflowY,
      height: cs.height,
    };
  });
  expect(styles.position).toBe("fixed");
  expect(["auto", "scroll"]).toContain(styles.overflowY);
  // Height should be close to the viewport height (100dvh)
  const vpHeight = MOBILE_VIEWPORT.height;
  const drawerHeight = parseInt(styles.height, 10);
  expect(drawerHeight).toBeGreaterThan(vpHeight * 0.9);
});
