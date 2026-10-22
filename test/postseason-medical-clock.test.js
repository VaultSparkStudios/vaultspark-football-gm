import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { validatePostseasonMedicalClock, previewPostseasonGameRecovery } from '../src/domain/postseasonMedicalClock.js';
import { standardElevationGame, declareStandardElevation, settleStandardElevationGame } from '../src/domain/standardElevations.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { inspectSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';

function fixture() {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.phase = 'postseason'; session.currentWeek = 19;
  session.postseasonState = createPostseasonState({ league: session.league, year: 2026 });
  return session;
}
const play = (session, options = {}) => simulateNextPostseasonGame({ state: session.postseasonState,
  league: session.league, statBook: session.statBook, year: 2026, rng: session.rng, ...options });
const practice = (session, club) => session.league.players.find(player => player.teamId === club
  && player.rosterSlot === 'practice' && player.experience === 0 && !player.suspensionWeeks);

test('wildcard bye recovers once, not once per match or for the other conference', () => {
  const session = fixture(), state = session.postseasonState;
  const club = state.seeds.AFC.find(row => row.seed === 1).teamId, player = practice(session, club);
  player.injury = { type: 'Long recovery', weeksRemaining: 20 };
  play(session); assert.equal(player.injury.weeksRemaining, 19);
  assert.equal(state.medicalClock.clubWeeks[club], 19);
  for (let i = 0; i < 5; i++) { play(session); assert.equal(player.injury.weeksRemaining, 19); }
  assert.equal(nextPostseasonGame(state, session.league).round, 'divisional');
  play(session); assert.equal(player.injury.weeksRemaining, 18);
  assert.equal(player.developmentHealth.missedWeeks, 2);
  validatePostseasonMedicalClock(state);
});

test('two-week final gap recovers twice and retains both elapsed injury-pay intervals through clearance', () => {
  const session = fixture();
  for (let i = 0; i < 12; i++) play(session);
  const next = nextPostseasonGame(session.postseasonState, session.league), club = next.homeTeamId;
  assert.equal(next.round, 'super-bowl');
  // Saved qualifying regular-season injury with two modeled weeks remaining
  // at the final. The episode's source/pay rights are real domain records.
  const player = practice(session, club), g = standardElevationGame({ year: 2026, week: 18,
    homeTeamId: club, awayTeamId: next.awayTeamId });
  assert.equal(declareStandardElevation({ league: session.league, player, teamId: club, game: g, capSpace: 1e8 }).ok, true);
  settleStandardElevationGame({ league: session.league, result: { ...g, winnerId: club } });
  applyInjury(player, { type: 'Out 2W', weeksRemaining: 2 }, { gameId: g.gameId });
  const missed = player.developmentHealth.missedWeeks;
  play(session);
  assert.equal(player.injury, null);
  assert.equal(player.developmentHealth.missedWeeks, missed + 2);
  assert.equal(player.elevationInjuryPay.episodes[0].status, 'recovered');
  assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>row.week), [22,23]);
  for (const row of player.elevationInjuryPay.payroll) {
    assert.equal(row.practiceCents,player.contract.postseasonPayLedger[`2026:postseason:${row.week}`].amount*100);
    assert.equal(row.additionalCents,Math.max(0,row.payCents-row.practiceCents));
  }
  assert.ok(player.contract.postseasonPayLedger['2026:postseason:22']);
  assert.ok(player.contract.postseasonPayLedger['2026:postseason:23']);
  assert.equal(session.postseasonState.medicalClock.clubWeeks[club], 23);
  validatePostseasonMedicalClock(session.postseasonState);
});

test('pure previews and refused session advance preserve recovery, entitlements, clock and RNG', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  const player = practice(session, next.homeTeamId), g = standardElevationGame({ year: 2026, week: 18,
    homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId });
  assert.equal(declareStandardElevation({ league: session.league, player, teamId: player.teamId, game: g, capSpace: 1e8 }).ok, true);
  settleStandardElevationGame({ league: session.league, result: { ...g, winnerId: player.teamId } });
  applyInjury(player, { type: 'Out 1W', weeksRemaining: 1 }, { gameId: g.gameId });
  const blockedClub = session.postseasonState.seeds.NFC.find(row => row.seed !== 1).teamId;
  for (const candidate of session.league.players.filter(player => player.teamId === blockedClub))
    candidate.injury = { type: 'Out 16W', weeksRemaining: 16 };
  const before = JSON.stringify(session.toSnapshot());
  const preview = previewPostseasonGameRecovery({ state: session.postseasonState, league: session.league, next, year: 2026 });
  assert.equal(preview.players.find(row => row.id === player.id).elevationInjuryPay.episodes[0].status, 'recovered');
  assert.equal(session.getAdvanceReadiness().ok, false);
  assert.equal(session.getAdvanceReadiness().ok, false);
  assert.equal(session.advanceWeek().ok, false);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

test('next-week recovery permits an otherwise empty playoff club to advance', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  session.controlledTeamId = next.homeTeamId;
  for (const player of session.league.players.filter(player => player.teamId === next.homeTeamId))
    player.injury = { type: 'Out 1W', weeksRemaining: 1 };
  const before = JSON.stringify(session.toSnapshot());
  assert.equal(session.getAdvanceReadiness().ok, true);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  const result = session.advanceWeek();
  assert.equal(result.ok, true);
  assert.ok(session.postseasonState?.gameArchiveEntries.length || session.latestPostseason?.gameArchiveEntries.length);
  assert.ok(session.league.rehabReceipts.some(row => row.teamId === next.homeTeamId && row.week === 19));
});

test('actual elevated-practice injury does not recover during its incident week', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  const player = practice(session, next.homeTeamId), game = standardElevationGame({ year: 2026,
    homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, seasonType: 'playoffs', round: next.round,
    label: `${next.conference.toLowerCase()}-${next.round}` });
  assert.equal(declareStandardElevation({ league: session.league, player, teamId: player.teamId, game, capSpace: 1e8 }).ok, true);
  applyInjury(player, { type: 'Out 3W', weeksRemaining: 3 }, { gameId: game.gameId, origin: 'elevated-practice' });
  play(session);
  assert.equal(player.injury.weeksRemaining, 3);
  assert.equal(player.standardElevations.games.at(-1).status, 'reverted');
  assert.equal(player.elevationInjuryPay.episodes[0].status, 'active');
});

test('saved medical clock restores exactly and corrupt or advanced clocks refuse without mutation', () => {
  const session = fixture(); play(session);
  const snapshot = session.toSnapshot(), restored = createSessionFromSnapshot(structuredClone(snapshot));
  assert.deepEqual(restored.postseasonState.medicalClock, session.postseasonState.medicalClock);
  session.setPostseasonMatchupPlans(); restored.setPostseasonMatchupPlans();
  assert.deepEqual(play(restored), play(session));
  assert.deepEqual(restored.postseasonState, session.postseasonState);
  for (const clock of [null, { version: 'unknown', clubWeeks: {} },
    { ...snapshot.postseasonState.medicalClock, clubWeeks: { ...snapshot.postseasonState.medicalClock.clubWeeks,
      [Object.keys(snapshot.postseasonState.medicalClock.clubWeeks)[0]]: 23 } }]) {
    const bad = structuredClone(snapshot); bad.postseasonState.medicalClock = clock;
    const before = JSON.stringify(bad);
    assert.throws(() => createSessionFromSnapshot(bad), /Invalid postseason medical clock/);
    assert.equal(inspectSnapshotCompatibility(bad).reasonCode, 'POSTSEASON_MEDICAL_CLOCK_INVALID');
    assert.equal(JSON.stringify(bad), before);
  }
});

test('legacy conference-first clocks remain club-local and staff recovery stays deterministic', () => {
  const session = fixture(); session.postseasonState.schemaVersion = '1.0';
  const club = session.postseasonState.seeds.NFC.find(row => row.seed === 1).teamId, player = practice(session, club);
  player.injury = { type: 'Out 10W', weeksRemaining: 10 };
  for (let i = 0; i < 6; i++) play(session);
  assert.equal(player.injury.weeksRemaining, 10);
  play(session, { getTeamModifiers: () => ({ extraRecoveryWeeks: 1 }) });
  assert.equal(player.injury.weeksRemaining, 8);
  assert.equal(session.postseasonState.medicalClock.clubWeeks[club], 19);
  validatePostseasonMedicalClock(session.postseasonState);
});

test('direct match refusal leaves real recovery, payroll, bracket and RNG untouched', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  for (const player of session.league.players.filter(player => player.teamId === next.homeTeamId))
    player.injury = { type: 'Out 16W', weeksRemaining: 16 };
  const before = JSON.stringify(session.toSnapshot());
  assert.throws(() => play(session), error => error.code === 'GAME_DAY_ROSTER_EMPTY');
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

test('missing clock in a mid-round legacy save resumes elapsed recovery without replaying prior periods', () => {
  const session = fixture(); session.postseasonState.schemaVersion = '1.0';
  for (let i = 0; i < 3; i++) play(session);
  delete session.postseasonState.medicalClock;
  const club = session.postseasonState.seeds.AFC.find(row => row.seed === 1).teamId, player = practice(session, club);
  player.injury = { type: 'Out 10W', weeksRemaining: 10 };
  const restored = createSessionFromSnapshot(structuredClone(session.toSnapshot()));
  assert.equal(restored.postseasonState.medicalClock, undefined);
  play(restored);
  assert.equal(restored.league.players.find(row => row.id === player.id).injury.weeksRemaining, 9);
  assert.equal(restored.postseasonState.medicalClock.clubWeeks[club], 20);
  validatePostseasonMedicalClock(restored.postseasonState);
});

test('headless and session postseason paths share the same medical staff and facility recovery', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  const club = session.postseasonState.seeds[next.conference].find(row => row.seed === 1).teamId;
  const team = session.league.teams.find(team => team.id === club), player = practice(session, club);
  team.staff.medicalDirector.discipline = 100;
  team.owner.facilities.rehab = 100;
  player.injury = { type: 'Out 10W', weeksRemaining: 10 };
  const restored = createSessionFromSnapshot(structuredClone(session.toSnapshot()));
  play(session);
  play(restored, restored.postseasonRecoveryOptions());
  assert.equal(player.injury.weeksRemaining, 7);
  assert.equal(restored.league.players.find(row => row.id === player.id).injury.weeksRemaining, 7);
  assert.deepEqual(restored.postseasonState.medicalClock, session.postseasonState.medicalClock);
});
