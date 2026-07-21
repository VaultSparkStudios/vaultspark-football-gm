import { test, expect } from "@playwright/test";

// CANON-041: mobile horizontal scroll nav + 100dvh viewport fixes.
// Asserts the side-menu converts to a scrollable pill strip at 375 px and
// that every tab is still reachable / functional on a phone-sized viewport.

const MOBILE = { width: 375, height: 812 };

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

// At mobile viewports the mobile overlay auto-activates and covers the game.
// Click "Full View" to reveal the full game UI with the scrollable nav strip.
async function switchToFullView(page) {
  const fullViewBtn = page.locator("#mlFullViewBtn");
  if (await fullViewBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await fullViewBtn.click();
    await expect(page.locator("#mobileLoopOverlay")).toHaveClass(/hidden/);
  }
}

test("mobile nav: side-menu is horizontally scrollable at 375 px", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await createLeague(page);

  // CSS checks work on DOM elements regardless of the overlay's z-index.
  const nav = page.locator(".side-menu");

  // overflow-x must be auto (the scrollable axis).
  await expect(nav).toHaveCSS("overflow-x", "auto");

  // At 375 px the strip has more content than fits; scrollWidth > clientWidth.
  const overflows = await nav.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(true);
});

test("mobile nav: tab switch works at 375 px after switching to full view", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await createLeague(page);
  await switchToFullView(page);

  // Settings is the last tab — it requires scrolling to reach on mobile.
  const settingsBtn = page.locator("#tab-settings");
  await settingsBtn.scrollIntoViewIfNeeded();
  await settingsBtn.click();

  await expect(page.locator("#settingsTab")).toBeVisible();
  await expect(settingsBtn).toHaveAttribute("aria-selected", "true");
});

test("mobile nav: group headers hidden in pill strip at 375 px", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await createLeague(page);

  // Section label divs should not be displayed inside the horizontal strip.
  // This is a CSS rule check — works on DOM elements even when visually covered.
  const headers = page.locator(".side-menu .menu-group-header");
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    await expect(headers.nth(i)).toHaveCSS("display", "none");
  }
});
