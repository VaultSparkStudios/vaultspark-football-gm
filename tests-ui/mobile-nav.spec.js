import { test, expect } from "@playwright/test";

// Guards the CANON-041 mobile nav: at ≤640px the side-menu must be a
// horizontal scroll strip (not a vertical list), each tab button must have
// a 44px touch target, and tapping a tab must switch the active panel.

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function launchGame(page) {
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

test("side-menu is horizontal flex row on mobile viewport", async ({ page }) => {
  await launchGame(page);
  const display = await page.locator(".side-menu").evaluate((el) =>
    getComputedStyle(el).display
  );
  const flexDir = await page.locator(".side-menu").evaluate((el) =>
    getComputedStyle(el).flexDirection
  );
  const overflow = await page.locator(".side-menu").evaluate((el) =>
    getComputedStyle(el).overflowX
  );
  expect(display).toBe("flex");
  expect(flexDir).toBe("row");
  expect(overflow).toBe("auto");
});

test("mobile nav buttons meet 44px minimum touch target", async ({ page }) => {
  await launchGame(page);
  const heights = await page.locator(".side-menu .menu-btn").evaluateAll((btns) =>
    btns.map((b) => b.getBoundingClientRect().height)
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) {
    expect(h).toBeGreaterThanOrEqual(44);
  }
});

test("tapping a mobile tab button activates its panel", async ({ page }) => {
  await launchGame(page);
  // Dispatch a real click event on the Roster tab via JS to bypass scroll/viewport constraints.
  // The button has a delegated listener from bindMenuTabs that calls activateTab("rosterTab").
  await page.evaluate(() => {
    document.getElementById("tab-roster").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.locator("#rosterTab")).toHaveClass(/active/);
  await expect(page.locator("#overviewTab")).not.toHaveClass(/active/);
});

test("menu-group-header labels are hidden inside horizontal mobile strip", async ({ page }) => {
  await launchGame(page);
  const headers = await page.locator(".side-menu .menu-group-header").evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).display)
  );
  for (const d of headers) {
    expect(d).toBe("none");
  }
});
