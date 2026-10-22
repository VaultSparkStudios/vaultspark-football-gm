import { test, expect } from '@playwright/test';
import { startStaticClientHost, configureClient, createClientLeague, readClient, assertRuntime, saveSlot, waitGameReady } from './helpers/static-client.js';

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
for (const worker of [true, false]) test(`built ${worker ? 'worker' : 'in-page'} elevation survives save/reload and reverts after its actual game`, async ({ page }) => {
  test.setTimeout(180000);
  await configureClient(page, worker);
  await createClientLeague(page, host.origin, { seed: 20260306, year: 2026, team: 'BUF', mode: 'play' });
  await assertRuntime(page, worker);
  for (const id of ['#firstDebriefDecline', '#tutSkipBtn']) if (await page.locator(id).isVisible()) await page.locator(id).click();
  await page.click('[data-testid="tab-roster"]'); await page.click('#loadRosterBtn');
  const button = page.locator('#rosterTable [data-act="elevate"]').first();
  await expect(button).toBeVisible();
  const playerId = await button.getAttribute('data-id');
  const before = (await readClient(page, '/api/roster?team=BUF')).roster.find(p => p.id === playerId);
  await button.click(); await expect(page.locator('#standardElevationCard')).toBeVisible();
  await page.click('#confirmStandardElevationBtn');
  await expect(page.locator('#standardElevationCard')).toBeHidden();
  const check = async () => {
    const player = (await readClient(page, '/api/roster?team=BUF')).roster.find(p => p.id === playerId);
    expect(player.standardElevation.pending).toBeTruthy();
    expect(player.contract).toEqual(before.contract);
    expect(player.rosterSlot).toBe('practice');
    expect(player.standardElevation.remainingRegular).toBe(2);
  };
  await check(); await saveSlot(page, 'elevation-proof');
  await page.reload(); await waitGameReady(page); await assertRuntime(page, worker); await check();
  const rival = await page.evaluate(async playerId => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    try { await createApiClient()('/api/roster/elevation', { method: 'POST', body: { teamId: 'MIA', playerId } }); return null; }
    catch (error) { return { message: error.message, reasonCode: error.reasonCode }; }
  }, playerId);
  expect(rival).not.toBeNull();
  const state = await readClient(page, '/api/state'), decision = state.gmDecisionQueue?.[0];
  await page.evaluate(async ({ state, decision }) => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/advance-week', { method: 'POST', body: { count: 1, weeklyTacticOverride: 'run-heavy',
      ...(decision ? { gmDecisionChoice: { decisionId: decision.id, choiceId: decision.options[0].id, occurrenceKey: decision.occurrenceKey, week: state.currentWeek } } : {}) } });
  }, { state, decision });
  const player = (await readClient(page, '/api/roster?team=BUF')).roster.find(p => p.id === playerId);
  expect(player.standardElevation.pending).toBeNull();
  const { payLedger, ...terms } = player.contract;
  const { payLedger: previousPayLedger, ...previousTerms } = before.contract;
  expect(terms).toEqual(previousTerms);
  expect(payLedger).toEqual({ ...previousPayLedger,
    [`${state.currentYear}:${state.currentWeek}`]: { year: state.currentYear, week: state.currentWeek, teamId: 'BUF', amount: before.contract.weeklySalary } });
  expect(player.standardElevation.remainingRegular).toBe(2);
});
