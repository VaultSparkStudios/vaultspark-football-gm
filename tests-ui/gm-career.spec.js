import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the GM career screens.
 *
 * The firing rule, the command boundary and the save round-trip are proved at
 * node level (test/gm-career.test.js, test/gm-career-dismissal.test.js). What
 * only a real browser can prove is the wiring: the screens live in a module
 * that is imported on demand, the club switcher is hidden by markup and shown
 * only under Sandbox rules, and the dismissal moment is a required choice that
 * Escape must not skip.
 *
 * The dismissed state is reached with the real "Resign" control — the same
 * terminal state and the same job market a firing produces, without playing two
 * losing seasons in a browser.
 */

async function startFranchise(page, { rules = null } = {}) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  // The setup form starts from the active league's settings, so the rules are always
  // chosen explicitly: a Sandbox league left behind must not leak into the next one.
  await page.selectOption("#rulesPresetInput", rules || "standard");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
}

async function resign(page) {
  // A phone opens on the weekly loop view, and its section menu is a closed
  // drawer; the owner screen is in the full view.
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible().catch(() => false)) {
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
  }
  await page.evaluate(() => document.querySelector('[data-tab="boardroomTab"]').click());
  await expect(page.locator("#boardroomTab")).toHaveClass(/active/);
  await page.locator("#resignGmBtn").click();
  const overlay = page.locator("#gmCareerOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("#gmCareerTitle")).toHaveText("Resign as general manager?");
  return overlay;
}

test("Standard rules hide the club switcher; Sandbox rules show it and it works", async ({ page }) => {
  await startFranchise(page);
  await expect(page.locator("#teamSelect")).toBeHidden();

  await startFranchise(page, { rules: "sandbox" });
  const switcher = page.locator("#teamSelect");
  await expect(switcher).toBeVisible({ timeout: 20_000 });
  await switcher.selectOption("NYJ");
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  await expect(switcher).toHaveValue("NYJ");
});

test("resigning is a choice you can back out of with Escape or Stay", async ({ page }) => {
  await startFranchise(page);
  let overlay = await resign(page);
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();

  overlay = await resign(page);
  await overlay.getByRole("button", { name: "Stay" }).click();
  await expect(overlay).toBeHidden();
  await expect(page.locator("#resignGmBtn")).toBeFocused();
});

test("leaving a club is a required choice: Escape cannot skip it, and a job continues the same league", async ({ page }) => {
  await startFranchise(page);
  const overlay = await resign(page);
  await overlay.getByRole("button", { name: "Resign", exact: true }).click();

  // The moment itself.
  await expect(overlay.locator("#gmCareerTitle")).toHaveText("You have stepped down", { timeout: 30_000 });
  await expect(overlay.locator("#gmCareerTitle")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeVisible();

  // The job market.
  await overlay.getByRole("button", { name: "See the job market" }).click();
  await expect(overlay.locator("#gmCareerTitle")).toHaveText("Choose your next club");
  await page.keyboard.press("Escape");
  await expect(overlay).toBeVisible();
  const offers = overlay.locator(".gm-career-offer");
  expect(await offers.count()).toBeGreaterThanOrEqual(3);
  expect(await offers.count()).toBeLessThanOrEqual(5);
  const first = offers.first();
  await expect(first).toContainText("Last three seasons");
  await expect(first).toContainText("Salary cap");
  await expect(first).toContainText("What the owner expects");
  await expect(overlay.getByRole("link", { name: "Start a new league" })).toBeVisible();

  // Without a club the league clock is closed, by the server, not just the overlay.
  const refused = await page.evaluate(async () => {
    const { api } = await import("./lib/appState.js");
    try { await api("/api/advance-week", { method: "POST", body: {} }); return "advanced"; }
    catch (error) { return error.reasonCode || error.payload?.reasonCode || error.message; }
  });
  expect(refused).toMatch(/gm-dismissed|no longer run/);

  const club = await first.getAttribute("data-team");
  const take = first.getByRole("button", { name: /^Take the .+ job$/ });
  await take.click();
  await expect(overlay).toBeHidden({ timeout: 60_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const controlled = await page.evaluate(async () => (await import("./lib/appState.js")).state.dashboard.controlledTeamId);
  expect(controlled).toBe(club);
  await expect(page.locator("#teamSelect")).toBeHidden();
});

for (const theme of ["dark", "light"]) {
  test(`the job market fits a phone screen in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem("franchise-architect-theme", value), theme);
    await startFranchise(page);
    const overlay = await resign(page);
    await overlay.getByRole("button", { name: "Resign", exact: true }).click();
    await overlay.getByRole("button", { name: "See the job market" }).click({ timeout: 30_000 });
    await expect(overlay.locator(".gm-career-offer").first()).toBeVisible();

    // No sideways scroll, and every "Take the job" button is a full touch target.
    const metrics = await overlay.evaluate((node) => ({
      overflow: node.scrollWidth - node.clientWidth,
      buttons: [...node.querySelectorAll("[data-career-take]")].map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, right: box.right };
      })
    }));
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    for (const button of metrics.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.right).toBeLessThanOrEqual(390);
    }
  });
}
