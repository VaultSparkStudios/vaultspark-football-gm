import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createSession } from "../src/runtime/bootstrap.js";
import { startStaticClientHost, configureClient, createClientLeague, waitGameReady, revealTable } from "./helpers/static-client.js";

// S131 [questionable-status-visible]: a live Questionable tag reads as a
// game-time status on the roster and depth chart, separate from a player who
// is out. The league is built with the real runtime and imported through the
// client API, so the browser renders the actual roster projection.

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });

const captureDir = process.env.S131_CAPTURE_DIR || "";

function injuredLeague() {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const receivers = session.league.players
    .filter((p) => p.teamId === "BUF" && p.status === "active" && (p.rosterSlot || "active") === "active" && p.position === "WR")
    .sort((a, b) => b.overall - a.overall);
  const [questionable, out] = receivers;
  questionable.injury = { type: "Questionable", weeksRemaining: 0 };
  out.injury = { type: "Out 1W", weeksRemaining: 1 };
  return { snapshot: session.toSnapshot(), questionable: questionable.name, out: out.name };
}

for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
  for (const theme of ["dark", "light"]) {
    test.describe(`${device} ${theme}`, () => {
      test.use({ viewport, colorScheme: theme });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((value) => {
          localStorage.setItem("franchise-architect-theme", value);
          localStorage.setItem("franchise-architect-theme-mode", value);
        }, theme);
      });

      test("Questionable reads as a game-time tag; Out reads as injured", async ({ page }) => {
        const league = injuredLeague();
        await configureClient(page, true);
        await createClientLeague(page, host.origin, { seed: 20260306, year: 2026, team: "BUF", mode: "play" });
        const imported = await page.evaluate(async (snapshot) => {
          const { createApiClient } = await import("./lib/api/createApiClient.js");
          return createApiClient()("/api/snapshot/import", { method: "POST", body: { snapshot } });
        }, league.snapshot);
        expect(imported.ok).toBe(true);
        await page.reload();
        await waitGameReady(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        // A phone opens on the weekly loop view; the roster lives in the full view.
        const fullView = page.locator("#mlFullViewBtn");
        if (await fullView.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await fullView.click();
          await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
        }

        // Depth chart, WR group.
        await page.evaluate(() => document.querySelector('#rosterTab [data-team-mode="depthTab"]')?.click());
        if (!(await page.locator("#depthTab").isVisible().catch(() => false))) {
          await page.click('[data-testid="tab-roster"]');
          await page.click('#rosterTab [data-team-mode="depthTab"]');
        }
        await page.selectOption("#depthPositionSelect", "WR");
        await page.click("#loadDepthBtn");
        const rowFor = (name) => page.locator("#depthTable tr[data-depth-row]", { hasText: name });
        await expect(rowFor(league.questionable).locator('td[data-label="Status"]')).toHaveText("Questionable");
        await expect(rowFor(league.questionable).locator(".depth-status--questionable")).toBeVisible();
        await expect(rowFor(league.out).locator('td[data-label="Status"]')).toHaveText("Injured · 1 wk");
        if (captureDir) {
          fs.mkdirSync(captureDir, { recursive: true });
          await rowFor(league.questionable).scrollIntoViewIfNeeded();
          await page.locator("#depthTab").screenshot({ path: `${captureDir}/${device}-${theme}-depth.png` });
        }

        // Roster table injury column.
        await page.evaluate(() => document.querySelector('#depthTab [data-team-mode="rosterTab"], #rosterTab [data-team-mode="rosterTab"]')?.click());
        await revealTable(page, "#rosterTable");
        const rosterRow = page.locator("#rosterTable tr", { hasText: league.questionable });
        await expect(rosterRow).toContainText("Questionable · injury does not rule him out");
        await expect(page.locator("#rosterTable tr", { hasText: league.out })).toContainText("Out 1W · out 1 week");
        await expect(page.locator("#rosterTable")).not.toContainText("Questionable (0)");
        if (captureDir) {
          await rosterRow.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${captureDir}/${device}-${theme}-roster.png` });
        }
      });
    });
  }
}
