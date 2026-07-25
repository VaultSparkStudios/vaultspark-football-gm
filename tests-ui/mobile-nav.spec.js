import { test, expect } from "@playwright/test";

// Guards CANON-041: scrollable 100dvh mobile nav.
// At narrow viewports (≤640px), the sidebar must convert to a fixed horizontal
// bottom tab bar so users never have to scroll past navigation to reach content.

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function createLeagueAt(page, viewportWidth = 375) {
  await page.setViewportSize({ width: viewportWidth, height: 812 });
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

test("mobile (375px): side-menu is a fixed bottom bar, not a stacked list", async ({ page }) => {
  await createLeagueAt(page, 375);

  const pos = await page.locator(".side-menu").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos, "side-menu must be fixed at narrow viewport").toBe("fixed");

  const bottom = await page.locator(".side-menu").evaluate(
    (el) => getComputedStyle(el).bottom
  );
  expect(parseFloat(bottom), "side-menu bottom edge at or near 0").toBeLessThanOrEqual(50);
});

test("mobile (375px): section headers are hidden in the bottom bar", async ({ page }) => {
  await createLeagueAt(page, 375);

  const headers = page.locator(".side-menu .menu-group-header");
  const count = await headers.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const display = await headers.nth(i).evaluate((el) => getComputedStyle(el).display);
    expect(display, `group header ${i} hidden`).toBe("none");
  }
});

test("mobile (375px): tab buttons remain clickable and switch active tab", async ({ page }) => {
  await createLeagueAt(page, 375);

  const statsBtn = page.locator(".menu-btn[data-tab='statsTab']");
  await statsBtn.scrollIntoViewIfNeeded();
  await statsBtn.click();

  const panel = page.locator("#statsTab");
  await expect(panel).toBeVisible();
  const ariaSelected = await statsBtn.getAttribute("aria-selected");
  expect(ariaSelected).toBe("true");
});

test("desktop (1200px): side-menu keeps sticky positioning as vertical sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click().catch(() => {});
  }

  const pos = await page.locator(".side-menu").evaluate(
    (el) => getComputedStyle(el).position
  );
  expect(pos, "side-menu must be sticky at wide viewport").toBe("sticky");
});
