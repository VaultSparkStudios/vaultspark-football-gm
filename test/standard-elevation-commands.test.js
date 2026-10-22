import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createLocalApiRuntime } from '../src/app/api/localApiRuntime.js';
import { createPostseasonState, nextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';

function fixture() {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.league.teamCapOverride.BUF = 1e9;
  const players = session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'practice' && !p.injury?.weeksRemaining && !p.suspensionWeeks);
  assert.ok(players.length >= 3);
  return { session, players };
}
const snapshot = session => JSON.stringify(session.toSnapshot());
const transportSnapshot = session => {
  const saved = session.toSnapshot(), league = { ...saved.league };
  // Every transport request records API timings/counters, including refusals.
  // Keep every franchise and RNG field in this nonmutation comparison.
  delete league.observability;
  return JSON.stringify({ ...saved, league });
};

test('scheduled elevation preview is pure; declaration retains practice terms and actual advance reverts once', async () => {
  const { session, players: [p] } = fixture();
  const input = { teamId: 'BUF', playerId: p.id }, before = snapshot(session), contract = structuredClone(p.contract);
  const quote = session.previewPlayerElevation(input);
  assert.equal(quote.ok, true);
  assert.deepEqual(quote.game, session.getStandardElevationGame('BUF'));
  assert.equal(quote.remainingAfterDeclaration, 2);
  assert.equal(snapshot(session), before);
  assert.equal(session.declarePlayerElevation({ ...input, expectedGameId: 'stale' }).reasonCode, 'ELEVATION_GAME_CHANGED');
  assert.equal(snapshot(session), before);
  const declared = session.declarePlayerElevation({ ...input, expectedGameId: quote.game.gameId });
  assert.equal(declared.ok, true);
  assert.deepEqual(p.contract, contract);
  const row = session.getRoster('BUF').find(row => row.id === p.id);
  assert.equal(row.rosterSlot, 'practice');
  assert.equal(row.standardElevation.pending.game.gameId, quote.game.gameId);
  assert.equal(row.standardElevation.remainingRegular, 2);
  const once = snapshot(session);
  assert.equal(session.declarePlayerElevation(input).unchanged, true);
  assert.equal(snapshot(session), once);
  const restored = createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  assert.deepEqual(restored.getPlayerById(p.id).standardElevations, p.standardElevations);
  assert.equal(session.advanceWeek().ok, true);
  assert.equal(p.standardElevations.games[0].status, 'reverted');
  assert.equal(p.rosterSlot, 'practice');
  assert.equal(session.getRoster('BUF').find(row => row.id === p.id).standardElevation.pending, null);
  assert.equal(session.league.capLedger.BUF.elevationCharges[0].status, 'earned');
});

test('bye, offseason, stale matchup and invalid player refuse without mutation', () => {
  const { session, players: [p] } = fixture();
  for (const phase of ['offseason', 'season-awards', 'postseason']) {
    session.phase = phase;
    const before = snapshot(session);
    assert.equal(session.declarePlayerElevation({ teamId: 'BUF', playerId: p.id }).reasonCode, 'ELEVATION_NO_SCHEDULED_GAME');
    assert.equal(snapshot(session), before);
  }
  session.phase = 'regular-season';
  session.currentWeek = session.seasonSchedule.find(row => !row.games.some(g => [g.homeTeamId, g.awayTeamId].includes('BUF'))).week;
  const before = snapshot(session);
  assert.equal(session.previewPlayerElevation({ teamId: 'BUF', playerId: p.id }).reasonCode, 'ELEVATION_NO_SCHEDULED_GAME');
  assert.equal(snapshot(session), before);
  session.currentWeek = 1;
  const active = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'active');
  assert.equal(session.declarePlayerElevation({ teamId: 'BUF', playerId: active.id }).reasonCode, 'ELEVATION_NOT_PRACTICE');
});

test('two-player limit and insufficient cap leave the prospective third declaration unchanged', () => {
  const { session, players } = fixture();
  for (const p of players.slice(0, 2)) assert.equal(session.declarePlayerElevation({ teamId: 'BUF', playerId: p.id }).ok, true);
  const before = snapshot(session);
  assert.equal(session.declarePlayerElevation({ teamId: 'BUF', playerId: players[2].id }).reasonCode, 'ELEVATION_GAME_LIMIT');
  assert.equal(snapshot(session), before);
  const second = fixture(), summary = second.session.getTeamCapSummary('BUF');
  second.session.league.teamCapOverride.BUF -= summary.capSpace;
  const zeroRoom = snapshot(second.session);
  assert.equal(second.session.declarePlayerElevation({ teamId: 'BUF', playerId: second.players[0].id }).reasonCode, 'ELEVATION_CAP_ROOM');
  assert.equal(snapshot(second.session), zeroRoom);
});

test('postseason preview uses the next actual bracket game and quotes benefits without zero-pay presentation', () => {
  const { session } = fixture();
  session.phase = 'postseason';
  session.postseasonState = createPostseasonState({ league: session.league, year: 2026 });
  const next = nextPostseasonGame(session.postseasonState, session.league), teamId = next.homeTeamId;
  const p = session.league.players.find(p => p.teamId === teamId && p.rosterSlot === 'practice' && !p.injury?.weeksRemaining && !p.suspensionWeeks);
  const before = snapshot(session), quote = session.previewPlayerElevation({ teamId, playerId: p.id });
  assert.equal(quote.ok, true);
  assert.equal(quote.game.homeTeamId, next.homeTeamId);
  assert.equal(quote.game.round, 'wildcard');
  assert.ok(quote.compensation.minimumCents > 0);
  assert.equal(quote.compensation.additionalCapCents, 0);
  assert.equal(snapshot(session), before);
  assert.equal(session.declarePlayerElevation({ teamId, playerId: p.id, expectedGameId: quote.game.gameId }).ok, true);
});

test('local commands enforce franchise authority and ignore submitted fictional matchups', async () => {
  const data = new Map(), storage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  const runtime = createLocalApiRuntime({ storage, scheduler: fn => fn() });
  await runtime.request('/api/new-league', { method: 'POST', body: { seed: 117, startYear: 2026, controlledTeamId: 'BUF' } });
  const session = runtime.getSession(), p = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'practice' && !p.injury?.weeksRemaining && !p.suspensionWeeks);
  session.league.teamCapOverride.BUF = 1e9;
  const before = transportSnapshot(session);
  const rival = await runtime.request('/api/roster/elevation', { method: 'POST', body: { teamId: 'MIA', playerId: p.id } });
  assert.equal(rival.status, 403);
  assert.equal(transportSnapshot(session), before);
  const preview = await runtime.request('/api/roster/elevation-preview', { method: 'POST', body: {
    teamId: 'BUF', playerId: p.id, game: { year: 2035, homeTeamId: 'BUF', awayTeamId: 'MIA' } } });
  assert.equal(preview.status, 200);
  assert.equal(preview.payload.game.year, 2026);
  assert.equal(transportSnapshot(session), before);
  const result = await runtime.request('/api/roster/elevation', { method: 'POST', body: { teamId: 'BUF', playerId: p.id, expectedGameId: preview.payload.game.gameId } });
  assert.equal(result.status, 200);
  assert.equal(result.payload.roster.find(row => row.id === p.id).standardElevation.pending.game.gameId, preview.payload.game.gameId);
});
