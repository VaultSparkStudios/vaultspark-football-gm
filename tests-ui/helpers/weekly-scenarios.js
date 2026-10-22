import { expect } from "@playwright/test";

// Real generated schedule, not a patched dashboard or fabricated receipt.
// Bye scenarios reach their actual midseason bye through real week commands.
export const WEEKLY_SCENARIOS = Object.freeze([
  Object.freeze({ name: "scheduled game", seed: 20260306, teamId: "BUF", onBye: false }),
  Object.freeze({ name: "bye week", seed: 20260306, teamId: "CHI", onBye: true })
]);

export async function createPlayScenario(page, scenario = WEEKLY_SCENARIOS[0]) {
  await page.addInitScript(() => localStorage.setItem("vsfgm:runtime-mode", "server"));
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("server");
  const settings = page.locator("details:has(#seedInput)");
  if (!(await settings.getAttribute("open"))) await settings.locator(":scope > summary").click();
  await page.fill("#seedInput", String(scenario.seed));
  await page.fill("#startYearInput", "2026");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", scenario.teamId);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 60_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
}

export async function readDashboard(page) {
  const response = await page.request.get("/api/state");
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function reachScenarioWeek(page, scenario) {
  if (!scenario.onBye) return;
  for (let i=0;i<14;i++) {
    const state=await readDashboard(page);
    if(state.controlledOnBye) break;
    const decision=state.gmDecisionQueue?.[0];
    const response=await page.request.post('/api/advance-week',{data:{count:1,weeklyTacticOverride:'run-heavy',
      ...(decision?{gmDecisionChoice:{decisionId:decision.id,choiceId:decision.options[0].id,occurrenceKey:decision.occurrenceKey,week:state.currentWeek}}:{})}});
    expect(response.ok(), await response.text()).toBe(true);
    const outcome=await response.json();
    expect(outcome.ok).toBe(true);
    expect(outcome.commandReceipt.completed.week).toBe(state.currentWeek+1);
  }
  const state=await readDashboard(page);
  expect(state.controlledOnBye).toBe(true);
  expect(state.currentWeek).toBeGreaterThanOrEqual(5);
  expect(state.currentWeek).toBeLessThanOrEqual(14);
  expect(state.currentWeek).not.toBe(12);
  await page.reload();
  await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  // The real pagehide visit is Week 1 while the server has reached its bye.
  // Complete the real asynchronous return flow before clicking a GM modal.
  const returnOverlay=page.locator('#returnDigestOverlay');
  await expect(returnOverlay).toBeVisible({timeout:20000});
  await returnOverlay.locator('[data-action="dismiss"]').click();
  await expect(returnOverlay).toHaveCount(0);
  const decline=page.locator('#firstDebriefDecline');
  if(await decline.isVisible()) await decline.click();
}
