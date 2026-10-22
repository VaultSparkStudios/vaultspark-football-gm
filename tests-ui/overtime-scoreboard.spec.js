import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("multiple overtime periods remain visible in the actual box-score modal", async ({ page }) => {
  test.setTimeout(180000);
  const phase = process.env.OVERTIME_CAPTURE_PHASE || "after";
  if (phase === "before") {
    // Replay the exact committed formatter in the same modal/camera. This
    // baseline route does not modify production files or invent a screenshot.
    const baseline = await fs.readFile(".cache/overtime-scoreboard-before.js", "utf8");
    await page.route("**/lib/boxScorePresentation.js", route => route.fulfill({ contentType: "text/javascript", body: baseline }));
  }
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30000 });
  await page.evaluate(() => document.querySelectorAll("details").forEach(el => { el.open = true; }));
  await page.selectOption("#runtimeModeSelect", "server");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30000 });
  await page.fill("#seedInput", "117");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10000 }).catch(() => false)) await skip.click();
  const fixture = {
    gameId: "overtime-visual-fixture", year: 2026, week: 1, seasonType: "playoffs",
    awayTeamName: "Miami Dolphins", homeTeamName: "Buffalo Bills",
    awayTeam: { teamId: "MIA", score: 21 }, homeTeam: { teamId: "BUF", score: 24 },
    quarterScores: { away: [7, 0, 7, 0, 7, 0], home: [7, 0, 7, 0, 7, 3] },
    scoringSummary: [{ teamId: "BUF", quarter: 6, quarterLabel: "OT2", clock: "12:20", type: "FG", description: "Buffalo wins on a field goal in the second overtime period" }],
    playByPlay: [{ offenseTeamId: "BUF", quarter: 6, quarterLabel: "OT2", clock: "12:20", down: 4, distance: 5, fieldPosition: 70, description: "Game-winning field goal" }],
    playerStats: { away: {}, home: {} }
  };
  await page.route("**/api/boxscore?*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, boxScore: fixture }) }));
  await page.evaluate(async () => (await import("/lib/tabOverview.js")).loadBoxScore("overtime-visual-fixture"));
  await expect(page.locator("#boxScoreModal")).not.toHaveClass(/hidden/);
  const scoreboard = page.locator("#boxScoreBroadcastStrip");
  if (phase === "before") await expect(scoreboard).not.toContainText("OT2");
  else {
    await expect(scoreboard).toContainText("OT2");
    await expect(scoreboard.locator(".broadcast-final")).toHaveText(["21", "24"]);
  }
  await fs.mkdir("output/playwright", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => window.innerWidth === document.documentElement.clientWidth);
    const fullView = page.locator("#mlFullViewBtn");
    if (label === "mobile") await expect(fullView).toBeVisible();
    if (await fullView.isVisible({ timeout: 3000 }).catch(() => false)) await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
    await page.evaluate(async () => (await import("/lib/tabOverview.js")).loadBoxScore("overtime-visual-fixture"));
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async value => (await import("/lib/themeCustomizer.js")).applyTheme(value), theme);
      await scoreboard.scrollIntoViewIfNeeded();
      await expect(page.locator("#boxScoreModal")).not.toHaveClass(/hidden/);
      await expect(scoreboard).toBeInViewport();
      await scoreboard.evaluate(el => { el.scrollLeft = 0; });
      await scoreboard.screenshot({ path: `output/playwright/s117-overtime-${phase}-${label}-${theme}.png` });
      if (label === "mobile") {
        await scoreboard.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await scoreboard.screenshot({ path: `output/playwright/s117-overtime-${phase}-${label}-${theme}-end.png` });
      }
    }
  }
});
