import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the three game-plan dials under the weekly tactic
 * choice: pace, run-pass lean and coverage.
 *
 * The node tests prove the dials reach the simulator and move the box score.
 * This proves the part a node test cannot: the controls render in the plan
 * modal, a click is what gets sent, and the summary line says what was chosen.
 */

async function startFranchise(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
}

function captureAdvanceBodies(page) {
  const bodies = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/advance-week")) {
      bodies.push(request.postDataJSON() || {});
    }
  });
  return bodies;
}

// Drives one advance to completion. `onPlanModal` runs once, the first time the
// plan modal is on screen, and returns true when it has finished the modal
// itself; otherwise the modal is committed with no tactic.
async function advanceWeek(page, { onPlanModal = null, timeoutMs = 150_000 } = {}) {
  const status = page.locator("#statusChip");
  await page.locator("#advanceWeekBtn").click();
  await page.waitForTimeout(50);
  const deadline = Date.now() + timeoutMs;
  let planSeen = false;

  while (Date.now() < deadline) {
    if ((await status.textContent().catch(() => ""))?.includes("Ready")) {
      const decline = page.locator("#firstDebriefDecline");
      if (await decline.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await decline.click();
        await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
      }
      return { planSeen };
    }

    const decision = page.locator("#gmDecisionOptions .gm-decision-option").first();
    if (await decision.isVisible().catch(() => false)) {
      await decision.click();
      continue;
    }

    const tacticSkip = page.locator("#halftimeAdjustModal .tactic-skip-btn");
    if (await tacticSkip.isVisible().catch(() => false)) {
      const handled = !planSeen && onPlanModal ? await onPlanModal() : false;
      planSeen = true;
      if (!handled) await tacticSkip.click();
      continue;
    }

    const commit = page.locator("#commitArchitectPlanBtn");
    if (await commit.isVisible().catch(() => false)) {
      await commit.click();
      continue;
    }

    await page.waitForTimeout(250);
  }

  const observed = (await status.textContent().catch(() => "unavailable"))?.trim();
  throw new Error(`Advance-week plan did not settle within ${timeoutMs}ms (status: ${observed}).`);
}

test("the weekly plan offers pace, run-pass lean and coverage, and sends what was chosen", async ({ page }) => {
  test.setTimeout(480_000);
  const bodies = captureAdvanceBodies(page);
  await startFranchise(page);

  // Opening week: the staff's game plan, no modal, nothing extra sent.
  await advanceWeek(page);
  expect(bodies.length).toBe(1);
  expect(bodies[0].gamePlan).toBeUndefined();
  await expect(page.locator(".weekly-plan-receipt")).toContainText("staff game plan");

  // The plan modal first appears on the second advance. A bye has no game to
  // plan, so keep advancing until a week with an opponent opens the modal.
  const dials = page.locator("#gamePlanDepth");
  let chosen = false;
  for (let attempt = 0; attempt < 3 && !chosen; attempt += 1) {
    const sentBefore = bodies.length;
    const { planSeen } = await advanceWeek(page, {
      onPlanModal: async () => {
        await expect(dials).toBeVisible();
        const groups = dials.locator('[role="radiogroup"]');
        await expect(groups).toHaveCount(3);
        await expect(dials.locator(".game-plan-segment")).toHaveCount(9);

        // Every dial opens on its neutral middle and says what it trades.
        for (const [key, neutral] of [["pace", "normal"], ["lean", "balanced"], ["coverage", "balanced"]]) {
          await expect(dials.locator(`[data-game-plan-key="${key}"][aria-checked="true"]`))
            .toHaveAttribute("data-game-plan-value", neutral);
          await expect(dials.locator(`#gamePlan-${key}-trade`)).not.toBeEmpty();
        }

        await dials.locator('[data-game-plan-key="pace"][data-game-plan-value="hurry-up"]').click();
        await expect(dials.locator('[data-game-plan-key="pace"][data-game-plan-value="hurry-up"]'))
          .toHaveAttribute("aria-checked", "true");
        await expect(dials.locator('[data-game-plan-key="pace"][data-game-plan-value="normal"]'))
          .toHaveAttribute("aria-checked", "false");
        await expect(dials.locator("#gamePlan-pace-trade")).toContainText("More drives for both teams");

        await dials.locator('[data-game-plan-key="coverage"][data-game-plan-value="take-chances"]').click();
        await expect(dials.locator("#gamePlan-coverage-trade")).toContainText("More interceptions");

        // Arrow keys move within a dial, like any radio group.
        await dials.locator('[data-game-plan-key="lean"][aria-checked="true"]').focus();
        await page.keyboard.press("ArrowLeft");
        await expect(dials.locator('[data-game-plan-key="lean"][data-game-plan-value="lean-run"]'))
          .toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("ArrowRight");
        await expect(dials.locator('[data-game-plan-key="lean"][data-game-plan-value="balanced"]'))
          .toHaveAttribute("aria-checked", "true");

        // The dials stand on their own: commit with no tactic.
        await page.locator("#halftimeAdjustModal .tactic-skip-btn").click();
        return true;
      }
    });
    if (!planSeen) {
      // A bye week: nothing to plan, and nothing may have been sent for it.
      expect(bodies[sentBefore]?.gamePlan).toBeUndefined();
      continue;
    }
    chosen = true;
    const sent = bodies[bodies.length - 1];
    expect(sent.gamePlan).toEqual({ pace: "hurry-up", coverage: "take-chances" });
    expect(sent.weeklyTacticOverride).toBeUndefined();
  }
  expect(chosen, "a week with an opponent must open the plan modal within three advances").toBe(true);

  // The summary line names the chosen plan in plain words.
  const receipt = page.locator(".weekly-plan-receipt");
  await expect(receipt).toContainText("pace: hurry-up");
  await expect(receipt).toContainText("coverage: take chances");
  await expect(receipt).not.toContainText("run-pass lean");
});

test("the auto-plan modal does not offer the weekly dials", async ({ page }) => {
  await startFranchise(page);
  // The same modal is reused to declare a multi-week auto-plan, where a
  // week-by-week dial would have nothing to attach to.
  await page.evaluate(async () => {
    const flow = await import("./lib/gameFlow.js");
    flow.showHalftimeAdjustModal(() => {}, { title: "Architect Auto-Plan" });
  });
  await expect(page.locator("#halftimeAdjustModal")).toBeVisible();
  await expect(page.locator("#gamePlanDepth")).toBeHidden();
  await expect(page.locator("#gamePlanDepth .game-plan-segment")).toHaveCount(0);
  await page.locator("#halftimeAdjustModal .tactic-skip-btn").click();
  await expect(page.locator("#halftimeAdjustModal")).toBeHidden();
});
