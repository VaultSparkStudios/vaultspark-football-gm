import { test, expect as baseExpect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const phase = process.env.S122_CAPTURE_PHASE || "after";
const expect = baseExpect.configure({ timeout: 3000 });
const captures = process.env.S122_CAPTURE_PHASE;
const output = path.resolve("output/playwright/s122-navigation", phase);

async function createLeague(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30_000 });
  const advanced = page.locator("details:has(#seedInput)");
  if (!(await advanced.getAttribute("open"))) await advanced.locator(":scope > summary").click();
  await page.fill("#seedInput", "20260306");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game(?:\.html)?(?:\?.*)?$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  for (const id of ["firstDebriefDecline", "tutSkipBtn", "mlFullViewBtn"]) {
    const button = page.locator(`#${id}`);
    if (await button.isVisible()) await button.click();
  }
}

async function desk(page) {
  await page.evaluate(async () => {
    const { activateTab } = await import("/lib/gameFlow.js");
    await activateTab("overviewTab");
  });
}

async function capture(page, name) {
  if (!captures) return;
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}

async function destination(page, id, tab) {
  await expect(page.locator(`#${tab}`)).toHaveClass(/\bactive\b/, { timeout: 1500 });
  await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.locator(`#${id}`)).toBeFocused();
  await expect(page.locator(".tab-panel.active")).toHaveCount(1);
}

for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  for (const theme of ["dark", "light"]) {
    test(`${device} ${theme}: mastery and league news reach real decision surfaces`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((value) => {
        localStorage.setItem("franchise-architect-theme", value);
      }, theme);
      await createLeague(page);
      const failures = [];
      for (const [focus, id, tab] of [
        ["results", "advanceWeekBtn", "overviewTab"],
        ["stewardship", "contractsSpotlight", "contractsTab"],
        ["promise", "franchiseCommandCenter", "overviewTab"],
        ["identity", "advanceWeekBtn", "overviewTab"]
      ]) {
        await desk(page);
        await page.locator(".architecture-review").evaluate((element) => { element.open = true; });
        await page.selectOption("#architectFocusSelect", focus);
        await page.click("[data-architect-save-focus]");
        await expect(page.locator("#statusChip")).toContainText("Ready");
        await expect(page.locator(".architect-focus-next")).toBeAttached();
        await page.locator(".architecture-review").evaluate((element) => { element.open = true; });
        await page.locator(".architect-focus-next").scrollIntoViewIfNeeded();
        await capture(page, `${device}-${theme}-mastery-${focus}`);
        await page.locator(".architect-focus-next").click();
        try {
          await destination(page, id, tab);
          await capture(page, `${device}-${theme}-mastery-${focus}-destination`);
        }
        catch (error) { failures.push(`${focus}: ${error.message}`); }
      }

      // The saved focus must survive the worker's real recovery path, not
      // merely navigate correctly while an in-memory declaration is present.
      await page.reload();
      await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
      await desk(page);
      await page.locator(".architecture-review").evaluate((element) => { element.open = true; });
      await expect(page.locator("#architectFocusSelect")).toHaveValue("identity");
      await page.locator(".architect-focus-next").click();
      await destination(page, "advanceWeekBtn", "overviewTab");
      await capture(page, `${device}-${theme}-mastery-identity-reload-destination`);

      // Exercise both public renderers and their real delegated click listeners.
      // Strip unrelated pressure from this fixture so the low-pressure news
      // fallback is selected deterministically, rather than waiting seasons.
      await desk(page);
      await page.evaluate(async () => {
        const { state } = await import("/lib/appState.js");
        state.dashboard = {
          ...state.dashboard, currentWeek: 1, phase: "regular-season", settings: {},
          cap: { capSpace: 10_000_000 }, injuryReport: [], gmDecisionQueue: [],
          controlledTeam: { ...state.dashboard.controlledTeam, owner: {} }, fanSentiment: {}
        };
        state.mobilePendingDecision = null;
        state.mobilePendingDecisionChoice = null;
        state.newsRows = [{ headline: "League news navigation regression fixture" }];
        const { renderFranchiseCommandCenter } = await import("/lib/tabOverview.js");
        renderFranchiseCommandCenter();
      });
      const news = page.locator('#franchiseCommandCenter [data-target-id="newsTable"]');
      await news.scrollIntoViewIfNeeded();
      await capture(page, `${device}-${theme}-desktop-news`);
      await news.click();
      try {
        await destination(page, "newsTable", "calendarTab");
        await capture(page, `${device}-${theme}-desktop-news-destination`);
      }
      catch (error) { failures.push(`desktop-news: ${error.message}`); }

      await desk(page);
      await page.evaluate(async () => {
        const { state } = await import("/lib/appState.js");
        const { renderMobileOverlay, setMobileModeEnabled } = await import("/lib/mobileLoop.js");
        setMobileModeEnabled(true);
        renderMobileOverlay(state, () => {});
        document.getElementById("mobileLoopOverlay").classList.remove("hidden");
      });
      const pressure = page.locator('.ml-pressure-stack [data-target-id="newsTable"]');
      await pressure.scrollIntoViewIfNeeded();
      await capture(page, `${device}-${theme}-mobile-news`);
      await pressure.click();
      try {
        await destination(page, "newsTable", "calendarTab");
        await capture(page, `${device}-${theme}-mobile-news-destination`);
      }
      catch (error) { failures.push(`mobile-news: ${error.message}`); }
      expect(failures).toEqual([]);
    });
  }
}
