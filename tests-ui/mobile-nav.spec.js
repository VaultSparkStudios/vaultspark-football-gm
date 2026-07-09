import { test, expect } from "@playwright/test";

// CANON-041: mobile horizontal scrollable nav strip.
// Guards that the side-menu collapses from a stacked 700px+ vertical list to a
// compact horizontal pill strip on narrow viewports, so content is immediately
// visible below the nav without requiring a long scroll.

const PHONE_VIEWPORT = { width: 375, height: 812 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createAndLoadGame(page) {
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

async function dismissMobileOverlay(page) {
  // On ≤480px the mobile loop overlay auto-activates; exit to Full View to
  // expose the main nav strip.
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toHaveCSS("display", "none", { timeout: 5_000 });
  }
}

test("mobile nav strip: renders as a compact horizontal flex strip, not a stacked list", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const page = await ctx.newPage();
  await createAndLoadGame(page);
  await dismissMobileOverlay(page);

  const sideMenu = page.locator(".side-menu");

  // Must be flex row (not the old stacked grid).
  const displayAndDir = await sideMenu.evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, direction: s.flexDirection };
  });
  expect(displayAndDir.display).toBe("flex");
  expect(displayAndDir.direction).toBe("row");

  // Must be horizontally scrollable.
  const overflowX = await sideMenu.evaluate((el) => getComputedStyle(el).overflowX);
  expect(["auto", "scroll"]).toContain(overflowX);

  // Strip height must be compact: at most 64px (vs 700px+ stacked).
  const navHeight = await sideMenu.evaluate((el) => el.getBoundingClientRect().height);
  expect(navHeight).toBeLessThan(64);

  await ctx.close();
});

test("mobile nav strip: all tab buttons present and accessible via horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const page = await ctx.newPage();
  await createAndLoadGame(page);
  await dismissMobileOverlay(page);

  const sideMenu = page.locator(".side-menu");

  // There should be at least 8 tab buttons present in the strip.
  const tabBtnCount = await sideMenu.locator(".menu-btn").count();
  expect(tabBtnCount).toBeGreaterThan(8);

  // The strip itself must not overflow the viewport horizontally (it should scroll).
  const stripWidth = await sideMenu.evaluate((el) => el.scrollWidth);
  const viewportWidth = PHONE_VIEWPORT.width;
  // scrollWidth > clientWidth confirms scrollable overflow.
  const clientWidth = await sideMenu.evaluate((el) => el.clientWidth);
  expect(stripWidth).toBeGreaterThan(clientWidth);

  await ctx.close();
});

test("mobile nav strip: tapping a tab switches panel after dismissing mobile overlay", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const page = await ctx.newPage();
  await createAndLoadGame(page);
  await dismissMobileOverlay(page);

  // The Overview tab is active by default.
  await expect(page.locator("#overviewTab")).toHaveClass(/active/);

  // Tap the Settings tab button from the strip.
  await page.locator('[data-tab="settingsTab"]').click();
  await expect(page.locator("#settingsTab")).toHaveClass(/active/, { timeout: 5_000 });
  await expect(page.locator("#overviewTab")).not.toHaveClass(/active/);

  await ctx.close();
});
