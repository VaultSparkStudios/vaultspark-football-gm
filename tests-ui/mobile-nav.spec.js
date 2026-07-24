import { test, expect } from "@playwright/test";

// Guards the mobile nav drawer: on a phone viewport the hamburger toggle
// must be visible, open/close the slide-in nav panel, and auto-close on
// tab selection. Regression target: nav used to stack all 14 tabs inline
// above the content, forcing users to scroll past nav to reach the game.
//
// Note: beforeAll sets localStorage "vsfgm_mobile_loop"="0" so the full-screen
// mobile-loop overlay (active at ≤480px by default) does not intercept clicks
// on the hamburger button during these tests.

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

// Create one league shared across the four mobile tests rather than four
// separate league creations. browser.newContext() does NOT inherit baseURL
// from playwright.config so we pass it explicitly here.
let mobilePage;

test.describe("mobile nav drawer (375px)", () => {
  test.setTimeout(300_000);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:4273",
      viewport: MOBILE_VIEWPORT
    });
    mobilePage = await context.newPage();
    await mobilePage.goto("/");
    // Disable the mobile-loop overlay before creating the league so it does not
    // cover the topbar and block the hamburger button during these nav tests.
    await mobilePage.evaluate(() => localStorage.setItem("vsfgm_mobile_loop", "0"));
    await waitSetupReady(mobilePage);
    await mobilePage.click("#createLeagueBtn");
    await expect(mobilePage).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
    await expect(mobilePage.locator("#statusChip")).toContainText("Ready", { timeout: 90_000 });
    const skip = mobilePage.locator("#tutSkipBtn");
    if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skip.click().catch(() => {});
    }
  });

  test.afterEach(async () => {
    await mobilePage.evaluate(() => {
      document.body.classList.remove("mobile-nav-open");
      const menu = document.getElementById("sideMenu");
      if (menu) menu.classList.remove("nav-open");
      const toggle = document.getElementById("mobileNavToggle");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  });

  test("hamburger toggle is visible on mobile viewport", async () => {
    await expect(mobilePage.locator("#mobileNavToggle")).toBeVisible();
  });

  test("hamburger opens the nav drawer on mobile", async () => {
    await expect(mobilePage.locator("body")).not.toHaveClass(/mobile-nav-open/);
    await expect(mobilePage.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "false");

    await mobilePage.locator("#mobileNavToggle").click();

    await expect(mobilePage.locator("body")).toHaveClass(/mobile-nav-open/);
    await expect(mobilePage.locator("#sideMenu")).toHaveClass(/nav-open/);
    await expect(mobilePage.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "true");
  });

  test("selecting a tab closes the mobile nav drawer", async () => {
    await mobilePage.locator("#mobileNavToggle").click();
    await expect(mobilePage.locator("body")).toHaveClass(/mobile-nav-open/);

    await mobilePage.locator("#tab-roster").click();

    await expect(mobilePage.locator("body")).not.toHaveClass(/mobile-nav-open/);
    await expect(mobilePage.locator("#sideMenu")).not.toHaveClass(/nav-open/);
    await expect(mobilePage.locator("#mobileNavToggle")).toHaveAttribute("aria-expanded", "false");
    await expect(mobilePage.locator("#rosterTab")).toHaveClass(/active/);
  });

  test("Escape key closes the mobile nav drawer", async () => {
    await mobilePage.locator("#mobileNavToggle").click();
    await expect(mobilePage.locator("body")).toHaveClass(/mobile-nav-open/);

    await mobilePage.keyboard.press("Escape");

    await expect(mobilePage.locator("body")).not.toHaveClass(/mobile-nav-open/);
    await expect(mobilePage.locator("#sideMenu")).not.toHaveClass(/nav-open/);
  });
});

test("hamburger toggle is NOT visible on desktop viewport", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 90_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click().catch(() => {});
  }
  await expect(page.locator("#mobileNavToggle")).not.toBeVisible();
});
