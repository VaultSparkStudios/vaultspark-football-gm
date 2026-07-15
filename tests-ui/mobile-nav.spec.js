import { test, expect } from "@playwright/test";

// Guards CANON-041: at narrow viewports the sidebar nav transforms into a
// compact horizontal-scrollable pill strip (≤ 80px tall) instead of a
// full-screen vertical stack of buttons (≥ 500px).

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeagueNarrow(page) {
  await page.setViewportSize({ width: 390, height: 844 });
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

test("mobile nav strip: compact horizontal layout at 390px viewport", async ({ page }) => {
  await createLeagueNarrow(page);

  const sideMenu = page.locator(".side-menu");
  await expect(sideMenu).toBeVisible();

  // Must be horizontal-scrollable (not vertical stacked)
  const overflowX = await sideMenu.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflowX).toBe("auto");

  // Height must be compact — horizontal strip, not a 500px stack
  const box = await sideMenu.boundingBox();
  expect(box.height).toBeLessThan(80);
});

test("mobile nav strip: tab buttons are tappable (min 40px height)", async ({ page }) => {
  await createLeagueNarrow(page);

  const overviewBtn = page.locator("#tab-overview");
  await expect(overviewBtn).toBeVisible();

  const box = await overviewBtn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
});

test("mobile nav strip: group headers are hidden, tabs remain visible", async ({ page }) => {
  await createLeagueNarrow(page);

  // Group headers must not be visible in the compact strip
  const headers = page.locator(".side-menu .menu-group-header");
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    await expect(headers.nth(i)).not.toBeVisible();
  }

  // All tab buttons should still exist and be accessible
  await expect(page.locator("#tab-roster")).toBeVisible();
  await expect(page.locator("#tab-draft")).toBeVisible();
  await expect(page.locator("#tab-history")).toBeVisible();
});

test("mobile nav strip: switching tabs works at narrow viewport", async ({ page }) => {
  await createLeagueNarrow(page);

  // Scroll the strip to reveal the Roster button, then click it
  const rosterBtn = page.locator("#tab-roster");
  // Use native DOM click to bypass overflow-clip visibility check while still
  // triggering event listeners (Playwright force:true skips listeners).
  await page.evaluate(() => {
    const btn = document.querySelector("#tab-roster");
    btn?.scrollIntoView({ behavior: "instant", inline: "center" });
    btn?.click();
  });

  // The roster tab panel should become visible
  await expect(page.locator("#rosterTab")).toBeVisible();
  await expect(rosterBtn).toHaveClass(/active/);
});
