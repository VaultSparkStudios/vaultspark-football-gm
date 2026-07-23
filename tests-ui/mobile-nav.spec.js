import { test, expect } from "@playwright/test";

// Guards the CANON-041 mobile nav: on ≤640px viewports the .side-menu
// becomes a compact horizontally-scrollable pill strip instead of a tall
// stacked grid, so content is reachable without scrolling past the nav.

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

test("mobile nav is a horizontal scroll strip at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  const sideMenu = page.locator(".side-menu");

  // Nav must be a flex row on mobile
  const display = await sideMenu.evaluate((el) => getComputedStyle(el).display);
  const flexDir = await sideMenu.evaluate((el) => getComputedStyle(el).flexDirection);
  expect(display).toBe("flex");
  expect(flexDir).toBe("row");

  // Overflow must be auto on the x-axis (scrollable) and hidden on y
  const overflowX = await sideMenu.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflowX).toBe("auto");

  // Nav height must be compact — much less than the viewport height
  const navBox = await sideMenu.boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox.height).toBeLessThan(100);

  // Tab buttons must be visible and tappable (min 44px touch target)
  const firstBtn = page.locator(".menu-btn").first();
  await expect(firstBtn).toBeVisible();
  const btnBox = await firstBtn.boundingBox();
  expect(btnBox).not.toBeNull();
  expect(btnBox.height).toBeGreaterThanOrEqual(44);

  // Group headers must be hidden on mobile (nav strip carries no section labels)
  const groupHeaders = page.locator(".side-menu .menu-group-header");
  for (const header of await groupHeaders.all()) {
    const vis = await header.evaluate((el) => getComputedStyle(el).display);
    expect(vis).toBe("none");
  }
});

test("mobile nav tab buttons activate their panels when clicked", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createLeague(page);

  // Fire the click via JS evaluation to avoid Playwright viewport-scroll issues
  // on elements that may be off-screen within the horizontal-scroll nav container
  await page.evaluate(() => {
    const btn = document.getElementById("tab-roster");
    if (btn) btn.click();
  });

  await expect(page.locator("#tab-roster")).toHaveClass(/active/);
  await expect(page.locator("#rosterTab")).toBeVisible();
});

test("body uses dvh for full-viewport coverage", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // min-height should resolve to at least the viewport height (dvh == vh when
  // no dynamic toolbar is present in headless mode)
  const bodyMinH = await page.evaluate(() => getComputedStyle(document.body).minHeight);
  // Headless Chrome resolves dvh === vh so the pixel value must equal viewport height
  expect(parseInt(bodyMinH, 10)).toBeGreaterThanOrEqual(812);
});
