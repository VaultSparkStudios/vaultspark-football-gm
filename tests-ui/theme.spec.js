import { test, expect } from "@playwright/test";

// Guards the Session 33 theme overhaul: the light theme must keep text and
// surfaces on opposite luminance ends (readable), and the dark theme must stay
// dark. Regression target: light mode used to render dark panels/topbar/sidebar
// with dark text on top (invisible) because surfaces were hardcoded dark.

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

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("franchise-architect-theme", t);
    document.documentElement.dataset.theme = t;
    document.body.dataset.theme = t;
  }, theme);
}

// Resolve a CSS custom property on <html> and estimate the luminance of the
// first color token found inside it (handles hex + rgb/rgba + gradients).
async function tokenLuminance(page, varName) {
  return page.evaluate((name) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return null;
    let m = raw.match(/#([0-9a-fA-F]{6})/);
    let r, g, b;
    if (m) {
      const n = parseInt(m[1], 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      m = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return null;
      r = +m[1]; g = +m[2]; b = +m[3];
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
  }, varName);
}

test("light theme keeps text and surfaces readable (opposite luminance ends)", async ({ page }) => {
  await createLeague(page);
  await setTheme(page, "light");
  await page.waitForTimeout(200);

  const ink = await tokenLuminance(page, "--ink");
  const panel = await tokenLuminance(page, "--panel-grad");
  const nav = await tokenLuminance(page, "--nav-grad");
  const topbar = await tokenLuminance(page, "--topbar-grad");
  const card = await tokenLuminance(page, "--card-grad");

  // In light mode, every major surface must be light and the text dark.
  expect(ink, "light --ink should be dark text").toBeLessThan(110);
  for (const [name, val] of [["panel", panel], ["nav", nav], ["topbar", topbar], ["card", card]]) {
    expect(val, `light --${name}-grad should be a light surface`).toBeGreaterThan(180);
    // Text and surface must contrast strongly (the original bug: ~0 gap).
    expect(val - ink, `light text/${name} contrast gap`).toBeGreaterThan(120);
  }
});

test("dark theme keeps surfaces dark and text light", async ({ page }) => {
  await createLeague(page);
  await setTheme(page, "dark");
  await page.waitForTimeout(200);

  const ink = await tokenLuminance(page, "--ink");
  const panel = await tokenLuminance(page, "--panel-grad");
  const nav = await tokenLuminance(page, "--nav-grad");

  expect(ink, "dark --ink should be light text").toBeGreaterThan(180);
  expect(panel, "dark --panel-grad should be a dark surface").toBeLessThan(80);
  expect(nav, "dark --nav-grad should be a dark surface").toBeLessThan(80);
  expect(ink - panel, "dark text/panel contrast gap").toBeGreaterThan(120);
});

test("identity card renders a real scheme label, never [object Object]", async ({ page }) => {
  await createLeague(page);
  const spotlight = page.locator("#overviewTeamSpotlight");
  await expect(spotlight).toBeVisible();
  await expect(spotlight).not.toContainText("[object Object]");
  await expect(spotlight).toContainText("Chemistry");
});

test("theme toggle persists across a reload", async ({ page }) => {
  await createLeague(page);
  await setTheme(page, "light");
  await page.reload();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe("light");
});

test("theme customizer changes appearance and accent, and persists", async ({ page }) => {
  await page.goto("/");
  await waitSetupReady(page);

  // Open the customizer popover.
  await page.click("#setupThemeToggleBtn");
  await expect(page.locator(".theme-cx-panel")).toBeVisible();

  // Pick an explicit Dark appearance + Emerald accent.
  await page.click('.theme-cx-mode[data-mode="dark"]');
  await page.click('.theme-cx-accent[data-accent="emerald"]');

  const applied = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    accent: document.documentElement.dataset.accent,
    accentVar: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase()
  }));
  expect(applied.theme).toBe("dark");
  expect(applied.accent).toBe("emerald");
  expect(applied.accentVar).toBe("#3fbf87"); // dark emerald preset

  // Switch to Light: the emerald preset must resolve to its darkened light value.
  await page.click('.theme-cx-mode[data-mode="light"]');
  const light = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase()
  );
  expect(light).toBe("#12795d");

  // Persist across reload (pre-paint boot must restore both).
  await page.reload();
  await waitSetupReady(page);
  const afterReload = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    accent: document.documentElement.dataset.accent
  }));
  expect(afterReload.theme).toBe("light");
  expect(afterReload.accent).toBe("emerald");
});

test("gold accent is the default and clears the data-accent attribute", async ({ page }) => {
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#setupThemeToggleBtn");
  await page.click('.theme-cx-accent[data-accent="gold"]');
  const accent = await page.evaluate(() => document.documentElement.dataset.accent);
  // Gold is the base palette — no data-accent override should be present.
  expect(accent).toBeUndefined();
});

test("theme customizer supports keyboard focus and arrow navigation", async ({ page }) => {
  await page.goto("/");
  await waitSetupReady(page);

  const button = page.locator("#setupThemeToggleBtn");
  await button.click();
  const panel = page.locator(".theme-cx-panel");
  await expect(panel).toBeVisible();

  const panelId = await panel.getAttribute("id");
  await expect(button).toHaveAttribute("aria-controls", panelId || "");
  await expect(page.locator(":focus")).toHaveAttribute("data-mode", "system");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(":focus")).toHaveAttribute("data-mode", "light");
  await expect(page.locator('html')).toHaveAttribute("data-theme", "light");

  await page.keyboard.press("End");
  await expect(page.locator(":focus")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator('html')).toHaveAttribute("data-theme", "dark");

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("data-accent", "gold");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(":focus")).toHaveAttribute("data-accent", "emerald");
  await expect(page.locator('html')).toHaveAttribute("data-accent", "emerald");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
});
