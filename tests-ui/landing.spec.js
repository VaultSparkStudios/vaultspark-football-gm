import { test, expect } from "@playwright/test";

// Guards the Session 33 follow-up: landing.html accent must be gold/amber,
// not the old blue (#4f8ef7) that mismatched the game UI's gold/teal brand.

async function getAccentRgb(page) {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent").trim();
    const m = raw.match(/#([0-9a-f]{6})/i);
    if (!m) return null;
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  });
}

test("landing accent is gold/amber in dark mode (R > G > B)", async ({ page }) => {
  await page.goto("/landing.html");
  const rgb = await getAccentRgb(page);
  expect(rgb).not.toBeNull();
  // Gold/amber characteristic: red significantly above blue, green in between
  expect(rgb.r).toBeGreaterThan(rgb.b + 80);
  expect(rgb.g).toBeGreaterThan(rgb.b);
});

test("landing hero headline and CTA are visible in dark mode", async ({ page }) => {
  await page.goto("/landing.html");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".btn-primary").first()).toBeVisible();
  const box = await page.locator(".btn-primary").first().boundingBox();
  expect(box.width).toBeGreaterThan(60);
});

test("landing accent is gold/amber in light mode", async ({ page }) => {
  await page.goto("/landing.html");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
  });
  const rgb = await getAccentRgb(page);
  expect(rgb).not.toBeNull();
  // Light-mode gold: still warmer (R > B), not blue (where B would dominate)
  expect(rgb.r).toBeGreaterThan(rgb.b);
});

test("landing primary CTA button uses warm (non-blue) background", async ({ page }) => {
  await page.goto("/landing.html");
  const btnColor = await page.evaluate(() => {
    const btn = document.querySelector(".btn-primary");
    if (!btn) return null;
    return getComputedStyle(btn).backgroundColor;
  });
  expect(btnColor).not.toBeNull();
  const m = btnColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    const [, r, , b] = m.map(Number);
    // Warm color: red channel exceeds blue (gold/amber); blue-dominant = cold (old blue brand)
    expect(Number(r)).toBeGreaterThan(Number(b));
  }
});
