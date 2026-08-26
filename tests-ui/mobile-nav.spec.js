import { test, expect } from "@playwright/test";

/**
 * CANON-041 mobile navigation drawer.
 *
 * Below 980px the 14-button side menu used to render as a static grid above the
 * content, so a phone or tablet user scrolled past the whole nav before seeing
 * any game. These tests pin the drawer behaviour and, critically, its
 * coexistence with the mobile decision deck — the collision that repeatedly
 * broke earlier attempts at this feature.
 */

async function startFranchise(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
}

test("desktop keeps the sidebar and shows no hamburger", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startFranchise(page);
  await expect(page.locator("#mobileNavToggle")).toBeHidden();
  await expect(page.locator("#sideMenu")).toBeVisible();
});

test("the tablet band gets a drawer instead of a nav stack above content", async ({ page }) => {
  // 768px previously fell in the gap: too wide for the deck, too narrow for the
  // sidebar, so it stacked a two-column nav strip over the game.
  await page.setViewportSize({ width: 768, height: 1024 });
  await startFranchise(page);

  const toggle = page.locator("#mobileNavToggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "sideMenu");
  const target = await toggle.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);

  // Closed drawer must be off-canvas and out of the tab order.
  await expect(page.locator("#sideMenu")).toHaveAttribute("inert", "");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#sideMenu")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#mobileNavScrim")).toBeVisible();
  const safeAreaPadding = await page.locator("#sideMenu").evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  });
  expect(safeAreaPadding.every((value) => Number.parseFloat(value) > 0)).toBe(true);

  // Drawer actually slides on screen. Polled because the transform animates
  // over 280ms — asserting immediately catches it mid-slide.
  await expect
    .poll(async () => (await page.locator("#sideMenu").boundingBox())?.x ?? -999, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(-1);
});

test("the 769-980px band is covered too", async ({ page }) => {
  // The band an earlier 768px breakpoint left behind.
  await page.setViewportSize({ width: 900, height: 800 });
  await startFranchise(page);
  await expect(page.locator("#mobileNavToggle")).toBeVisible();
});

test("choosing a section closes the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await startFranchise(page);
  await page.locator("#mobileNavToggle").click();
  await expect(page.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "true");

  await page.locator('[data-tab="rosterTab"]').first().click();
  await expect(page.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#rosterTab")).toHaveClass(/active/);
});

test("scrim and Escape both dismiss the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await startFranchise(page);
  const toggle = page.locator("#mobileNavToggle");

  await toggle.click();
  await page.locator("#mobileNavScrim").click({ position: { x: 300, y: 400 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("the decision deck owns the phone — no drawer on top of it", async ({ page }) => {
  // The collision earlier attempts kept hitting: the drawer stacks above the
  // deck overlay, so both visible at once would put a hamburger over a
  // full-screen replacement UI.
  await page.setViewportSize({ width: 390, height: 844 });
  await startFranchise(page);

  await expect(page.locator("body")).toHaveClass(/mobile-loop-active/);
  await expect(page.locator("#mobileLoopOverlay")).toBeVisible();
  await expect(page.locator("#mobileNavToggle")).toBeHidden();
});

test("leaving the deck via Full View reveals a closed drawer, not an open one", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFranchise(page);
  await expect(page.locator("#mobileLoopOverlay")).toBeVisible();

  await page.locator("#mlFullViewBtn").click();
  await expect(page.locator("#mobileLoopOverlay")).toBeHidden();

  const toggle = page.locator("#mobileNavToggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
