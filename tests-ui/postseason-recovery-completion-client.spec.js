import { test, expect } from '@playwright/test';
import { createSession } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { standardElevationGame, declareStandardElevation, settleStandardElevationGame } from '../src/domain/standardElevations.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { expandSnapshotPensionService } from '../src/runtime/pensionServiceSnapshot.js';
import { startStaticClientHost, configureClient, createClientLeague, readClient, assertRuntime, saveSlot, waitGameReady } from './helpers/static-client.js';

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
for (const injuredWeeks of [1, 3, 5, 30]) for (const worker of [true, false]) test(`built ${worker ? 'worker' : 'in-page'} reconciles ${injuredWeeks}-week nonqualifier injury through final and named load`, async ({ page }) => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF', mode: 'play' });
  session.phase = 'postseason'; session.currentWeek = 19;
  session.postseasonState = createPostseasonState({ league: session.league, year: 2026 });
  const club = session.league.teams.find(team => !Object.values(session.postseasonState.seeds).flat().some(row => row.teamId === team.id));
  club.staff.medicalDirector.discipline = 72; club.owner.facilities.rehab = 72;
  const player = session.league.players.find(row => row.teamId === club.id && row.rosterSlot === 'practice' && row.experience === 0);
  const game = standardElevationGame({ year: 2026, week: 18, homeTeamId: club.id,
    awayTeamId: session.league.teams.find(team => team.id !== club.id).id });
  // Controlled saved rights specimen. All playoff outcomes and completion
  // reconciliation run through the actual engine and built product.
  expect(declareStandardElevation({ league: session.league, player, teamId: club.id, game, capSpace: 1e8 }).ok).toBe(true);
  settleStandardElevationGame({ league: session.league, result: { ...game, winnerId: club.id } });
  applyInjury(player, { type: `Out ${injuredWeeks}W`, weeksRemaining: injuredWeeks }, { gameId: game.gameId });
  const pensionBefore = structuredClone(player.pensionService);
  const contractBefore = structuredClone(player.contract);
  for (let i = 0; i < 12; i++) simulateNextPostseasonGame({ state: session.postseasonState,
    league: session.league, statBook: session.statBook, year: 2026, rng: session.rng });
  const final = nextPostseasonGame(session.postseasonState, session.league);
  expect(final.round).toBe('super-bowl');
  session.controlledTeamId = final.homeTeamId; session.currentWeek = 22;
  await configureClient(page, worker);
  await createClientLeague(page, host.origin, { seed: 117, year: 2026, team: final.homeTeamId, mode: 'play' });
  await assertRuntime(page, worker);
  const imported = await page.evaluate(async snapshot => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import', { method: 'POST', body: { snapshot } });
  }, session.toSnapshot());
  expect(imported.ok).toBe(true);
  const check = async completed => {
    const { snapshot } = await readClient(page, '/api/snapshot/export');
    const saved = expandSnapshotPensionService(snapshot).league.players.find(row => row.id === player.id);
    if (completed && injuredWeeks <= 5) expect(saved.injury).toBeNull();
    else expect(saved.injury.weeksRemaining).toBe(completed ? injuredWeeks - 5 : injuredWeeks);
    expect(saved.elevationInjuryPay.episodes[0].status).toBe(completed && injuredWeeks <= 5 ? 'recovered' : 'active');
    expect(saved.pensionService).toEqual(pensionBefore);
    expect(saved.contract).toEqual(contractBefore);
    expect(saved.contract.postseasonPayLedger).toBeUndefined();
    expect(saved.elevationInjuryPay.payroll.map(row => row.week)).toEqual(completed ? Array.from({length: Math.min(5, injuredWeeks)}, (_,i) => 19 + i) : []);
    if (completed) {
      expect(snapshot.phase).toBe('season-awards');
      expect(snapshot.latestPostseason.medicalRecovery).toMatchObject({ year: 2026, throughWeek: 23 });
      for (const row of saved.elevationInjuryPay.payroll) {
        expect(row.practiceCents).toBe(0); expect(row.additionalCents).toBe(row.payCents); expect(row.capChargeCents).toBe(0);
      }
    } else expect(snapshot.postseasonState.medicalRecovery).toBeUndefined();
  };
  await check(false); await saveSlot(page, 'completion-before');
  await page.reload(); await waitGameReady(page); await assertRuntime(page, worker); await check(false);
  const state = await readClient(page, '/api/state'), decision = state.gmDecisionQueue?.[0];
  const advanced = await page.evaluate(async ({ state, decision }) => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/advance-week', { method: 'POST', body: { count: 1, weeklyTacticOverride: 'run-heavy',
      ...(decision ? { gmDecisionChoice: { decisionId: decision.id, choiceId: decision.options[0].id,
        occurrenceKey: decision.occurrenceKey, week: state.currentWeek } } : {}) } });
  }, { state, decision });
  expect(advanced.ok, JSON.stringify(advanced)).toBe(true); await check(true);
  await page.reload(); await waitGameReady(page);
  if (await page.locator('#closeSeasonReviewBtn').isVisible()) await page.locator('#closeSeasonReviewBtn').click();
  if (await page.locator('#firstDebriefDecline').isVisible()) await page.locator('#firstDebriefDecline').click();
  await check(true); await saveSlot(page, 'completion-after');
  await page.reload(); await waitGameReady(page); await assertRuntime(page, worker); await check(true);
  await page.evaluate(async () => {
    const { api } = await import('./lib/appState.js');
    await api('/api/new-league', {method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'BUF',mode:'play'}});
    await (await import('./lib/gameFlow.js')).loadState();
  });
  await page.locator('[data-testid="tab-settings"]').click();
  await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
  await page.locator('#saveSlotInput').fill('completion-after');
  await page.locator('#loadBtn').click();
  await expect.poll(async () => (await readClient(page,'/api/state')).phase).toBe('season-awards');
  await check(true);
  await page.reload(); await waitGameReady(page); await assertRuntime(page,worker); await check(true);
});
