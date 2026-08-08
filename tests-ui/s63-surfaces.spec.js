import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the two S63 surfaces that replaced or added live UI.
 *
 * Both shipped with node-level adapter and contract tests, but neither had ever
 * been proved to render and function in a real browser. That gap mattered most
 * for the coaching market, which *replaced* the numeric staff editor: a render
 * or wiring failure would leave players unable to change their staff at all,
 * and every node-level test would still pass.
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

async function openSettings(page) {
  await page.locator('[data-tab="settingsTab"]').first().click();
  await expect(page.locator("#settingsTab")).toHaveClass(/active/);
}

async function advanceWeekThroughPlan(page, timeoutMs = 150_000) {
  const status = page.locator("#statusChip");
  await page.locator("#advanceWeekBtn").click();
  await page.waitForTimeout(50);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await status.textContent().catch(() => ""))?.includes("Ready")) return;

    const decision = page.locator("#gmDecisionOptions .gm-decision-option").first();
    if (await decision.isVisible().catch(() => false)) {
      await decision.click();
      continue;
    }

    const tacticSkip = page.locator("#halftimeAdjustModal .tactic-skip-btn");
    if (await tacticSkip.isVisible().catch(() => false)) {
      await tacticSkip.click();
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

// ── Coaching market ───────────────────────────────────────────────────────────

test("the coaching market renders named candidates against a real staff budget", async ({ page }) => {
  await startFranchise(page);
  await openSettings(page);

  const market = page.locator("#coachingMarketPanel");
  await expect(market).toBeVisible({ timeout: 30_000 });
  await expect(market.locator(".coaching-market-head h3")).toContainText("Head Coach Market");

  // The budget line must state real money, not a placeholder.
  await expect(market.locator(".coaching-market-budget")).toContainText(/\$\d/);

  const candidates = market.locator(".cm-candidate");
  await expect(candidates.first()).toBeVisible();
  const count = await candidates.count();
  expect(count).toBeGreaterThan(0);

  // Every candidate is a named person with a price and a term — not a number box.
  const first = candidates.first();
  await expect(first.locator("strong")).not.toBeEmpty();
  await expect(first).toContainText(/PC \d+ · DEV \d+ · DIS \d+/);
  await expect(first).toContainText(/\$[\d.]+M\/yr · \d+ years/);

  // The incumbent is shown with what leaving him costs.
  await expect(market.locator(".coaching-market-incumbent")).toContainText("Currently");
  await expect(market.locator(".cm-fire")).toContainText(/dead money/i);
});

test("the numeric staff rating editor is gone from the page", async ({ page }) => {
  await startFranchise(page);
  await openSettings(page);
  await expect(page.locator("#coachingMarketPanel")).toBeVisible({ timeout: 30_000 });

  // These four inputs wrote straight into the simulation for any team.
  for (const id of ["#staffPlaycallingInput", "#staffDevelopmentInput", "#staffDisciplineInput", "#staffYearsInput"]) {
    await expect(page.locator(id)).toHaveCount(0);
  }
  // Renaming survives, and is labelled as such.
  await expect(page.locator("#updateStaffBtn")).toHaveText(/rename/i);
});

test("hiring a coach through the market changes the staff sheet", async ({ page }) => {
  await startFranchise(page);
  await openSettings(page);

  const market = page.locator("#coachingMarketPanel");
  await expect(market).toBeVisible({ timeout: 30_000 });

  const hireButton = market.locator(".cm-hire").first();
  await expect(hireButton).toBeVisible();
  const hiredName = (await market.locator(".cm-candidate").first().locator("strong").textContent())?.trim();
  expect(hiredName && hiredName.length > 1).toBeTruthy();

  await hireButton.click();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  // The hire must reach the staff table — this is the assertion that would have
  // caught the coaching-tree name resync reverting every new hire.
  await expect(page.locator("#staffTable")).toContainText(hiredName, { timeout: 30_000 });
  // And the market re-renders around the new incumbent.
  await expect(market.locator(".coaching-market-incumbent")).toContainText(hiredName);
});

test("a rival's staff is visible but not editable", async ({ page }) => {
  await startFranchise(page);
  await openSettings(page);
  await expect(page.locator("#coachingMarketPanel")).toBeVisible({ timeout: 30_000 });

  const controlled = await page.locator("#staffTeamSelect").inputValue();
  const otherValue = await page.locator("#staffTeamSelect option").evaluateAll(
    (options, current) => options.map((option) => option.value).find((value) => value && value !== current),
    controlled
  );
  expect(otherValue).toBeTruthy();

  await page.selectOption("#staffTeamSelect", otherValue);
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  // No hire/fire controls for a franchise you do not run, and the panel says why.
  const market = page.locator("#coachingMarketPanel");
  await expect(market.locator(".cm-hire")).toHaveCount(0);
  await expect(market.locator(".cm-fire")).toHaveCount(0);
  await expect(market.locator(".coaching-market-empty")).toContainText(otherValue);
});

// ── Press room ────────────────────────────────────────────────────────────────

test("the podium opens after a game and answering it records a receipt", async ({ page }) => {
  test.setTimeout(360_000);
  await startFranchise(page);

  // Advance until the controlled team has played and the room asks a question.
  const card = page.locator("#pressRoomCard");
  for (let week = 0; week < 4; week += 1) {
    await advanceWeekThroughPlan(page);
    if (await card.locator(".press-room-question").isVisible({ timeout: 3_000 }).catch(() => false)) break;
  }

  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator(".press-room-question")).not.toBeEmpty();

  // Three real postures plus an honest skip, each stating its own consequence.
  const options = card.locator(".press-room-option");
  await expect(options).toHaveCount(3);
  await expect(options.first().locator(".press-option-consequence")).not.toBeEmpty();
  await expect(card.locator(".press-room-skip")).toBeVisible();

  await options.first().click();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  // Answering closes the question and leaves the GM's own words on the record.
  await expect(card.locator(".press-room-question")).toHaveCount(0, { timeout: 30_000 });
  await expect(card.locator(".press-room-quote")).not.toBeEmpty();
  await expect(card.locator(".press-room-reasons")).not.toBeEmpty();
});

// ── Opponent-aware gameplanning receipt ──────────────────────────────────────

test("the pre-game brief states the opponent read the engine acts on", async ({ page }) => {
  await startFranchise(page);
  await page.locator("#advanceWeekBtn").click();

  const decision = page.locator("#gmDecisionOptions .gm-decision-option").first();
  if (await decision.isVisible({ timeout: 8_000 }).catch(() => false)) await decision.click();

  const brief = page.locator("#tacticalMatchupBrief");
  await expect(brief).toBeVisible({ timeout: 30_000 });
  const headline = (await brief.locator("strong").textContent()) || "";
  const edge = brief.locator(".tactical-matchup-edge");
  if (/No controlled-team game/i.test(headline)) {
    // A generated bye is an authoritative empty state, not a missing read.
    await expect(brief).toContainText("A tactical override would have no matchup to affect.");
    await expect(edge).toHaveCount(0);
  } else {
    await expect(brief.locator("strong")).toContainText("Week");
    // The S63 edge line is source-derived; it either names a soft side or says
    // plainly that there is none. An absent line would mean the read never
    // reached the player.
    await expect(edge).toHaveCount(1);
    await expect(edge).toContainText(/Soft side:|Even front and secondary/);
  }
});
