import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { applyFootballPostGame } from '../src/engine/gameDayRoster.js';
import { normalizeRosterSlots, capUsedByTeam } from '../src/engine/capCompliance.js';
import { transitionReserveList, recordReserveGameAbsences, resetReserveListsForYear } from '../src/domain/reserveLists.js';
import { simulateGame } from '../src/engine/gameSimulator.js';
import { RNG } from '../src/utils/rng.js';

function fixture() {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: 'BUF' });
  const player = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'active' && p.position === 'WR');
  player.injury = { type: 'recorded-test-injury', origin: 'football', weeksRemaining: 6, year: 2026, startedWeek: 1 };
  const designate = (options = {}) => session.setPlayerDesignation({ teamId: 'BUF', playerId: player.id, designation: 'ir', ...options });
  return { session, player, designate };
}

function miss(f, week, seasonType = 'regular') {
  const result = { year: 2026, week, seasonType, homeTeamId: 'BUF', awayTeamId: 'MIA', gameDayRosters: {} };
  applyFootballPostGame({ league: f.session.league, result });
  return result;
}

test('IR placement frees an active place while preserving contract, injury and randomness; roster sorting cannot activate it', () => {
  const f = fixture();
  const contract = structuredClone(f.player.contract), injury = structuredClone(f.player.injury);
  const cap = capUsedByTeam(f.session.league, 'BUF'), seed = f.session.rng.seed;
  assert.equal(f.designate().ok, true);
  assert.equal(f.player.rosterSlot, 'reserve');
  assert.equal(f.session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'active').length, 52);
  normalizeRosterSlots(f.session.league);
  assert.equal(f.player.rosterSlot, 'reserve');
  assert.deepEqual(f.player.contract, contract);
  assert.deepEqual(f.player.injury, injury);
  assert.equal(f.session.rng.seed, seed);
  assert.ok(capUsedByTeam(f.session.league, 'BUF') >= cap, 'reserve salary remains charged even if other practice players activate');
  assert.equal(f.session.setPracticeSquad({ teamId: 'BUF', playerId: f.player.id, moveToPractice: false }).reasonCode, 'RESERVE_ACTIVATION_REQUIRED');
  assert.ok(!f.session.getDepthChart('BUF').WR.includes(f.player.id), 'reading the depth chart cannot re-add a reserve player');
  assert.ok(!f.session.getDepthChartSnapShare('BUF').WR.some(row => row.playerId === f.player.id));
  assert.equal(f.session.setDepthChart({ teamId: 'BUF', position: 'WR', playerIds: [f.player.id] }).ok, false);
});

test('invalid reserve options are rejected atomically and valid state remains restorable', () => {
  const f = fixture();
  delete f.player.designations;
  for (const options of [{ returnEligible: 'false' }, { beginPractice: 1 }, { active: 'true' }, { beginPractice: true }]) {
    const before = structuredClone(f.session.toSnapshot());
    assert.equal(f.designate(options).reasonCode, 'RESERVE_OPTIONS_INVALID');
    assert.deepEqual(f.session.toSnapshot(), before);
  }
  assert.equal(f.designate().ok, true);
  assert.equal(createSessionFromSnapshot(f.session.toSnapshot()).getPlayerById(f.player.id).rosterSlot, 'reserve');
});

test('restore refuses invented absence strings, unapplied canonical games and wrong placement dates', () => {
  const f = fixture(); f.designate(); miss(f, 1);
  for (const keys of [['a', 'b', 'c', 'd'], ['2026:regular:2:BUF:MIA'], ['2025:regular:1:BUF:MIA']]) {
    const snapshot = structuredClone(f.session.toSnapshot());
    snapshot.league.players.find(p => p.id === f.player.id).reserveStatus.gamesMissed = keys;
    assert.throws(() => createSessionFromSnapshot(snapshot), /Invalid reserve receipt/);
  }
  const snapshot = structuredClone(f.session.toSnapshot());
  snapshot.league.players.find(p => p.id === f.player.id).reserveStatus.placedWeek = 2;
  assert.throws(() => createSessionFromSnapshot(snapshot), /Invalid reserve receipt/);
});

test('duplicate application cannot add a newly placed reserve player to an already applied game', () => {
  const f = fixture();
  const result = miss(f, 1);
  f.designate();
  recordReserveGameAbsences({ league: f.session.league, result });
  assert.deepEqual(f.player.reserveStatus.gamesMissed, []);
});

test('standalone default-week matchups do not create reserve receipts or invalidate saved franchises', () => {
  const f = fixture();
  simulateGame({ league: f.session.league, statBook: f.session.statBook, homeTeamId: 'BUF', awayTeamId: 'MIA',
    year: 2026, rng: new RNG(117), mode: 'drive' });
  assert.equal(f.session.league.reserveGameHistory, undefined);
  assert.doesNotThrow(() => createSessionFromSnapshot(f.session.toSnapshot()));
});

test('actual weekly simulation records reserve absences, excludes the player at kickoff and restores the live clock', () => {
  const f = fixture(); f.player.injury.weeksRemaining = 12; f.designate();
  for (let n = 0; n < 5 && f.player.reserveStatus.gamesMissed.length < 4; n++) {
    const result = f.session.advanceWeek();
    assert.notEqual(result.ok, false);
    assert.equal(f.player.rosterSlot, 'reserve');
    const game = result.games?.find(g => g.homeTeamId === 'BUF' || g.awayTeamId === 'BUF');
    if (game) assert.ok(!game.gameDayRosters?.BUF?.playerIds.includes(f.player.id));
  }
  assert.equal(f.player.reserveStatus.gamesMissed.length, 4);
  const restored = createSessionFromSnapshot(f.session.toSnapshot());
  const dto = restored.getRoster('BUF').find(p => p.id === f.player.id);
  assert.equal(dto.reserveStatus.gamesMissed, 4);
  assert.equal(dto.reserveStatus.practice.ok, true);
  assert.equal(dto.reserveStatus.activation.ok, false, 'the injury still prevents activation');
});

test('healthy placement is refused without manufacturing an injury or changing RNG', () => {
  const f = fixture(); f.player.injury = null;
  const before = structuredClone(f.player), seed = f.session.rng.seed;
  assert.equal(f.designate().reasonCode, 'RESERVE_INJURY_REQUIRED');
  assert.deepEqual(f.player, before);
  assert.equal(f.session.rng.seed, seed);
});

test('only applied team games advance the four-game clock; duplicate, old, bye and other-club receipts cannot help', () => {
  const f = fixture(); f.session.currentWeek = 3;
  assert.equal(f.designate().ok, true);
  miss(f, 2); miss(f, 3); miss(f, 3);
  recordReserveGameAbsences({ league: f.session.league, result: { year: 2026, week: 4, seasonType: 'regular', homeTeamId: 'CIN', awayTeamId: 'BAL' } });
  assert.equal(f.player.reserveStatus.gamesMissed.length, 1);
  f.player.injury.weeksRemaining = 0; f.session.currentWeek = 8;
  assert.equal(f.designate({ active: false }).reasonCode, 'RESERVE_GAMES_REQUIRED', 'calendar weeks alone are insufficient');
  miss(f, 5); miss(f, 6); miss(f, 7);
  // Keep a real active vacancy; normalization is intentionally not called.
  assert.equal(f.designate({ active: false }).ok, true);
  assert.equal(f.player.rosterSlot, 'active');
  assert.equal(f.session.league.reserveReturnHistory.length, 1);
  assert.equal(f.designate({ active: false }).unchanged, true);
});

test('practice designation starts a calendar window and consumes the return place even if activation later fails', () => {
  const f = fixture(); f.designate();
  for (let week = 1; week <= 4; week++) miss(f, week);
  f.session.currentWeek = 5;
  assert.equal(f.designate({ active: false, beginPractice: true }).ok, true);
  assert.equal(f.player.rosterSlot, 'reserve');
  assert.equal(f.session.league.reserveReturnHistory.length, 1);
  f.session.currentWeek = 9; f.player.injury.weeksRemaining = 0;
  assert.equal(f.designate({ active: false }).reasonCode, 'RESERVE_PRACTICE_EXPIRED');
  assert.equal(f.session.league.reserveReturnHistory.length, 1);
});

test('reserve PUP requires preseason provenance; 2026 practice opens after two games, activation after four', () => {
  const f = fixture();
  const context = { year: 2026, week: 1, phase: 'offseason', campCuts: true };
  assert.equal(transitionReserveList(f.session.league, f.player, context, { designation: 'pup', active: true }).reasonCode, 'PUP_PRESEASON_HISTORY_REQUIRED');
  f.player.medicalHistory = { failedPreseasonPhysical: true, practicedThisPreseason: false };
  assert.equal(transitionReserveList(f.session.league, f.player, context, { designation: 'pup', active: true }).ok, true);
  miss(f, 1); miss(f, 2); f.player.injury.weeksRemaining = 0;
  assert.equal(transitionReserveList(f.session.league, f.player, { year: 2026, week: 3, phase: 'regular-season' },
    { designation: 'pup', active: false, beginPractice: true }).ok, true);
  assert.equal(f.session.setPlayerDesignation({ teamId: 'BUF', playerId: f.player.id, designation: 'pup', active: false }).reasonCode, 'RESERVE_GAMES_REQUIRED');
  miss(f, 3); miss(f, 4); f.session.currentWeek = 5;
  assert.equal(f.session.setPlayerDesignation({ teamId: 'BUF', playerId: f.player.id, designation: 'pup', active: false }).ok, true);
  assert.equal(f.session.league.reserveReturnHistory, undefined, 'PUP activation does not spend an IR/NFI designation');
});

test('reserve receipts survive compressed restore, reject malformed counters and roll forward without rewriting contracts', async () => {
  const f = fixture(); f.designate(); miss(f, 1);
  const restored = createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(f.session.toSnapshot())));
  const player = restored.getPlayerById(f.player.id);
  assert.deepEqual(player.reserveStatus, f.player.reserveStatus);
  assert.equal(player.rosterSlot, 'reserve');
  const bad = structuredClone(restored.toSnapshot()); bad.league.players.find(p => p.id === player.id).reserveStatus.gamesMissed.push(player.reserveStatus.gamesMissed[0]);
  assert.throws(() => createSessionFromSnapshot(bad), /Invalid reserve receipt/);
  const contract = structuredClone(player.contract);
  resetReserveListsForYear(restored.league, 2027);
  assert.equal(player.rosterSlot, 'active'); assert.equal(player.designations.ir, false);
  assert.deepEqual(player.contract, contract);
  resetReserveListsForYear(restored.league, 2027);
  assert.equal(player.reserveHistory.length, 1);
});

test('return designations stop at eight regular-season uses; only a playoff club receives two additional places', () => {
  const f = fixture();
  const players = f.session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'active').slice(0, 10);
  for (const p of players) {
    p.injury = { origin: 'football', weeksRemaining: 6 };
    assert.equal(f.session.setPlayerDesignation({ teamId: 'BUF', playerId: p.id, designation: 'ir' }).ok, true);
  }
  for (let week = 1; week <= 4; week++) miss(f, week);
  f.session.currentWeek = 5;
  const begin = p => f.session.setPlayerDesignation({ teamId: 'BUF', playerId: p.id, designation: 'ir', active: false, beginPractice: true });
  for (const p of players.slice(0, 8)) assert.equal(begin(p).ok, true);
  assert.equal(begin(players[8]).reasonCode, 'RESERVE_RETURN_LIMIT');
  f.session.phase = 'postseason'; f.session.currentWeek = 19;
  assert.equal(begin(players[8]).reasonCode, 'RESERVE_RETURN_LIMIT', 'phase alone does not establish playoff qualification');
  f.session.league.teams.find(t => t.id === 'BUF').playoffSeed = 2;
  assert.equal(begin(players[8]).ok, true); assert.equal(begin(players[9]).ok, true);
  assert.equal(f.session.league.reserveReturnHistory.length, 10);
});

test('final-cut designations are charged immediately and stop at two; NFI cannot relabel a football injury', () => {
  const f = fixture();
  const players = f.session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'active').slice(0, 3);
  const context = { year: 2026, week: 1, phase: 'offseason', campCuts: true };
  for (const p of players) p.injury = { origin: 'football', weeksRemaining: 6 };
  assert.equal(transitionReserveList(f.session.league, players[0], context, { designation: 'nfi', active: true }).reasonCode, 'NFI_ORIGIN_REQUIRED');
  for (const p of players.slice(0, 2)) assert.equal(transitionReserveList(f.session.league, p, context, { designation: 'ir', active: true }).ok, true);
  assert.equal(f.session.league.reserveReturnHistory.length, 2);
  assert.equal(transitionReserveList(f.session.league, players[2], context, { designation: 'ir', active: true }).reasonCode, 'RESERVE_CUT_RETURN_LIMIT');
  assert.equal(transitionReserveList(f.session.league, players[2], context, { designation: 'ir', active: true, returnEligible: false }).ok, true);
  assert.equal(f.session.league.reserveReturnHistory.length, 2);
});

test('camp-cut guidance uses the same upcoming financial year as the reserve command', () => {
  const f = fixture();
  f.session.phase = 'offseason';
  f.session.league.financialYear = 2027;
  f.session.league.offseasonPipeline = { stage: 'camp-cuts' };
  assert.equal(f.designate().ok, true);
  assert.equal(f.player.reserveStatus.year, 2027);
  const read = f.session.getRoster('BUF').find(p => p.id === f.player.id).reserveStatus;
  assert.equal(read.activation.reasonCode, 'RESERVE_RETURN_PHASE');
  assert.equal(read.practice.reasonCode, 'RESERVE_RETURN_PHASE');
  assert.equal(f.designate({ active: false }).reasonCode, read.activation.reasonCode);
});
