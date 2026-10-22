import { test, expect } from '@playwright/test';
import { createSession } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { standardElevationGame, declareStandardElevation, settleStandardElevationGame } from '../src/domain/standardElevations.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { startStaticClientHost, configureClient, createClientLeague, readClient, assertRuntime, saveSlot, waitGameReady } from './helpers/static-client.js';

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
for (const worker of [true, false]) test(`built ${worker ? 'worker' : 'in-page'} preserves chronological playoffs and weekly recovery through save and actual advancement`, async ({ page }) => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF', mode: 'play' });
  session.phase = 'postseason'; session.currentWeek = 19;
  session.postseasonState = createPostseasonState({ league: session.league, year: 2026 });
  for (let i = 0; i < 3; i++) simulateNextPostseasonGame({ state: session.postseasonState,
    league: session.league, statBook: session.statBook, year: 2026, rng: session.rng });
  const next = nextPostseasonGame(session.postseasonState, session.league);
  expect(next.conference).toBe('NFC'); expect(next.round).toBe('wildcard');
  session.controlledTeamId = next.homeTeamId;
  for (const player of session.league.players.filter(player => player.teamId === next.homeTeamId))
    player.injury = { type: 'Out 1W', weeksRemaining: 1 };
  const recovering = session.league.players.find(player => player.teamId === next.homeTeamId && player.rosterSlot === 'practice'
    && player.experience === 0 && !player.suspensionWeeks);
  const injuryGame = standardElevationGame({ year: 2026, week: 18, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId });
  // Controlled saved entitlement specimen; the built product must perform
  // recovery itself, with no mutable preview or injected simulation result.
  recovering.injury = null;
  expect(declareStandardElevation({ league: session.league, player: recovering, teamId: recovering.teamId,
    game: injuryGame, capSpace: 1e8 }).ok).toBe(true);
  settleStandardElevationGame({ league: session.league, result: { ...injuryGame, winnerId: recovering.teamId } });
  applyInjury(recovering, { type: 'Out 1W', weeksRemaining: 1 }, { gameId: injuryGame.gameId });
  await configureClient(page, worker);
  await createClientLeague(page, host.origin, { seed: 117, year: 2026, team: next.homeTeamId, mode: 'play' });
  await assertRuntime(page, worker);
  const imported = await page.evaluate(async snapshot => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import', { method: 'POST', body: { snapshot } });
  }, session.toSnapshot());
  expect(imported.ok).toBe(true);
  const check = async () => {
    const exported = await readClient(page, '/api/snapshot/export');
    expect(exported.snapshot.postseasonState).toEqual(session.postseasonState);
    expect(exported.snapshot.league.players.find(player => player.id === recovering.id).elevationInjuryPay.episodes[0].status).toBe('active');
    const state = await readClient(page, '/api/state');
    expect(state.postseasonProgress.stage).toBe('NFC-wildcard');
    expect(state.postseasonProgress.nextGame.homeTeamId).toBe(next.homeTeamId);
  };
  await check(); await saveSlot(page, 'postseason-chronology');
  await page.reload(); await waitGameReady(page); await assertRuntime(page, worker); await check();
  const state = await readClient(page, '/api/state'), decision = state.gmDecisionQueue?.[0];
  const result = await page.evaluate(async ({ state, decision }) => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/advance-week', { method: 'POST', body: { count: 1, weeklyTacticOverride: 'run-heavy',
      ...(decision ? { gmDecisionChoice: { decisionId: decision.id, choiceId: decision.options[0].id,
        occurrenceKey: decision.occurrenceKey, week: state.currentWeek } } : {}) } });
  }, { state, decision });
  expect(result.ok).toBe(true);
  const exported = await readClient(page, '/api/snapshot/export');
  const recovered = exported.snapshot.league.players.find(player => player.id === recovering.id);
  expect(recovered.injury).toBeNull();
  expect(recovered.elevationInjuryPay.episodes[0].status).toBe('recovered');
  expect(exported.snapshot.league.rehabReceipts.some(row => row.playerId === recovering.id && row.week === 19)).toBe(true);
  // An active bracket retains its entries. A completed bracket stores full
  // games once in league.gameArchive; latestPostseason deliberately omits the
  // duplicate play-by-play payload to stay within browser save capacity.
  const archive = exported.snapshot.postseasonState?.gameArchiveEntries || exported.snapshot.league.gameArchive
    .filter(game => game.year === 2026 && game.seasonType === 'playoffs')
    .map(game => {
      const final = game.label === 'super-bowl';
      return { ...game, conference: final ? 'NFL' : game.label.slice(0, 3).toUpperCase(),
        round: final ? 'super-bowl' : game.label.slice(4) };
    });
  expect(archive?.length).toBeGreaterThanOrEqual(4);
  expect(archive.slice(0, 4).map(game => `${game.conference}-${game.round}`)).toEqual([
    'AFC-wildcard', 'AFC-wildcard', 'AFC-wildcard', 'NFC-wildcard']);
  expect([archive[3].homeTeamId, archive[3].awayTeamId]).toContain(next.homeTeamId);
  const ranks = { wildcard: 0, divisional: 1, conference: 2, 'super-bowl': 3 };
  expect(archive.every((game, i) => i === 0 || ranks[game.round] >= ranks[archive[i - 1].round])).toBe(true);
});
