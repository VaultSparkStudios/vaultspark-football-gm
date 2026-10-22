import { test, expect } from '@playwright/test';
import { createSession } from '../src/runtime/bootstrap.js';
import { standardElevationGame, declareStandardElevation } from '../src/domain/standardElevations.js';
import { finalizePensionPlanYear, pensionServiceCount } from '../src/domain/pensionService.js';
import { expandSnapshotPensionService } from '../src/runtime/pensionServiceSnapshot.js';
import { simulateGame } from '../src/engine/gameSimulator.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { RNG } from '../src/utils/rng.js';
import { startStaticClientHost, configureClient, createClientLeague, readClient, assertRuntime, saveSlot, waitGameReady } from './helpers/static-client.js';

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
for (const worker of [true, false]) test(`built ${worker ? 'worker' : 'in-page'} preserves observed pension proofs and independent service counts`, async ({ page }) => {
  await configureClient(page, worker);
  await createClientLeague(page, host.origin, { seed: 117, year: 2026, team: 'BUF', mode: 'play' });
  await assertRuntime(page, worker);
  // Controlled imported specimen: three actual native games, followed by an
  // explicit ledger finalization. This is not a played complete annual season.
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF', mode: 'play' });
  session.league.teamCapOverride.BUF = 1e9;
  const p = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'practice' && p.experience === 0 && !p.injury?.weeksRemaining && !p.suspensionWeeks);
  const game = week => standardElevationGame({ year: 2026, week, homeTeamId: 'BUF', awayTeamId: 'MIA' });
  expect(declareStandardElevation({ league: session.league, player: p, teamId: 'BUF', game: game(1), capSpace: 1e8 }).ok).toBe(true);
  p.designations.gameDayInactive = true;
  const play = week => simulateGame({ league: session.league, statBook: session.statBook, rng: new RNG(117), ...game(week) });
  play(1); applyInjury(p, { type: 'Out 4W', weeksRemaining: 4 }, { gameId: game(1).gameId });
  play(2); play(3); finalizePensionPlanYear(session.league, 2026);
  session.currentWeek = 4;
  const snapshot = session.toSnapshot(), expected = pensionServiceCount(p);
  expect(expected.seasons).toBe(1);
  expect(p.accruedSeasons).toBe(0);
  const imported = await page.evaluate(async snapshot => {
    const { createApiClient } = await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import', { method: 'POST', body: { snapshot } });
  }, snapshot);
  expect(imported.ok).toBe(true);
  const check = async () => {
    const exported = await readClient(page, '/api/snapshot/export');
    const restored = expandSnapshotPensionService(exported.snapshot).league.players.find(row => row.id === p.id);
    expect(restored.pensionService).toEqual(p.pensionService);
    const result = await readClient(page, `/api/player?playerId=${encodeURIComponent(p.id)}`);
    expect(result.profile.player.service.pension).toEqual(expected);
    expect(result.profile.player.service.accrued.seasons).toBe(0);
    expect(result.profile.player.service.salaryCredited.seasons).toBe(0);
  };
  await check(); await saveSlot(page, 'pension-proof-verified');
  await page.reload(); await waitGameReady(page); await assertRuntime(page, worker); await check();
});
