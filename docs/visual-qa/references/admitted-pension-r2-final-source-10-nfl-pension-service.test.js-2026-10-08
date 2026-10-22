import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { generatedPlayerService, finalizeFootballServiceSeason, validateSnapshotPlayerService } from '../src/domain/playerService.js';
import { pensionServiceCount, recordPensionGameService, finalizePensionPlanYear } from '../src/domain/pensionService.js';
import { standardElevationGame, declareStandardElevation } from '../src/domain/standardElevations.js';
import { recordPracticeWeekPay } from '../src/domain/practiceContracts.js';
import { applyInjury, advanceInjuryRecovery } from '../src/engine/injurySystem.js';
import { simulateGame, simulateMatch } from '../src/engine/gameSimulator.js';
import { applyFootballPostGame } from '../src/engine/gameDayRoster.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { inspectSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';
import { RNG } from '../src/utils/rng.js';
import { expandSnapshotPensionService } from '../src/runtime/pensionServiceSnapshot.js';

const regular = week => standardElevationGame({ year: 2026, week, homeTeamId: 'BUF', awayTeamId: 'MIA' });
const player = extra => ({ id: 'p', teamId: 'BUF', status: 'active', rosterSlot: 'active', experience: 0, ...generatedPlayerService(0), ...extra });
const league = p => ({ year: 2026, players: [p], teams: [{ id: 'BUF' }, { id: 'MIA' }] });
function fixture() {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.league.teamCapOverride.BUF = 1e9;
  const p = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'practice' && p.experience === 0 && !p.injury?.weeksRemaining && !p.suspensionWeeks);
  assert.ok(p);
  return { session, p };
}
function play(session, game) {
  return simulateGame({ league: session.league, statBook: session.statBook, rng: new RNG(117), ...game });
}
function elevate(session, p, game) {
  assert.equal(declareStandardElevation({ league: session.league, player: p, teamId: p.teamId, game, capSpace: 1e8 }).ok, true);
  p.designations.gameDayInactive = true;
}

test('two regular games and one postseason game earn one pension season independently of salary and accrued service', () => {
  const p = player(), l = league(p);
  for (const result of [regular(1), regular(2), { ...regular(1), week: 0, seasonType: 'playoffs', label: 'afc-wildcard', gameId: '2026-playoffs-afc-wildcard-0-MIA-BUF' }])
    recordPensionGameService({ league: l, result });
  finalizePensionPlanYear(l, 2026);
  finalizeFootballServiceSeason(l, 2026);
  assert.equal(pensionServiceCount(p).seasons, 1);
  assert.equal(p.creditedSeasons, 0);
  assert.equal(p.accruedSeasons, 0);
  const before = JSON.stringify(l);
  finalizePensionPlanYear(l, 2026);
  recordPensionGameService({ league: l, result: regular(4) });
  assert.equal(JSON.stringify(l), before);
});

test('ordinary practice, Pro Bowl and paid preparation are not pension games; imported history stays unknown', () => {
  const p = player({ experience: 12 });
  delete p.pensionService;
  const l = league(p);
  recordPensionGameService({ league: l, result: regular(1) });
  recordPensionGameService({ league: l, result: regular(2) });
  recordPensionGameService({ league: l, result: { ...regular(3), label: 'pro-bowl' } });
  p.rosterSlot = 'practice';
  recordPensionGameService({ league: l, result: regular(3) });
  finalizePensionPlanYear(l, 2026);
  assert.deepEqual(pensionServiceCount(p), { seasons: null, observedSeasons: 0, completeHistory: false, provenance: 'unknown-prior-service' });
  assert.equal(p.pensionService.planYears[2026].games.length, 2);
});

test('actual zero-snap elevation and two injury-continuation games qualify once; previews and recovery add no service', async () => {
  const { session, p } = fixture();
  const first = regular(1);
  elevate(session, p, first);
  const before = JSON.stringify(session.toSnapshot());
  simulateMatch({ league: session.league, statBook: session.statBook, rng: new RNG(117), ...first });
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  play(session, first);
  assert.equal(p.pensionService.planYears[2026].games[0].reason, 'standard-elevation');
  assert.equal(p.serviceLedger.seasons[2026].active, 0);
  applyInjury(p, { type: 'Out 4W', weeksRemaining: 4 }, { gameId: first.gameId });
  // A paid week without an applied club game cannot add pension credit.
  recordPracticeWeekPay(session.league, { year: 2026, week: 2 });
  assert.equal(p.pensionService.planYears[2026].games.length, 1);
  const second = play(session, regular(2));
  const once = JSON.stringify(p.pensionService);
  applyFootballPostGame({ league: session.league, result: second });
  assert.equal(JSON.stringify(p.pensionService), once);
  play(session, regular(3));
  assert.deepEqual(p.pensionService.planYears[2026].games.map(row => row.reason), ['standard-elevation', 'elevation-injury-continuation', 'elevation-injury-continuation']);
  p.injury = { ...p.injury, weeksRemaining: 1 };
  advanceInjuryRecovery(session.league);
  play(session, regular(4));
  assert.equal(p.pensionService.planYears[2026].games.length, 3);
  finalizePensionPlanYear(session.league, 2026);
  assert.equal(pensionServiceCount(p).seasons, 1);
  const snap = session.toSnapshot(), seed = session.rng.seed;
  const restored = createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(snap)));
  assert.deepEqual(restored.getPlayerById(p.id).pensionService, p.pensionService);
  assert.deepEqual(restored.getPlayerProfile(p.id).player.service.pension, pensionServiceCount(p));
  assert.equal(session.rng.seed, seed);
});

test('pension proof depends on continuation entitlement rather than positive additional adjustment', () => {
  const { session, p } = fixture();
  elevate(session, p, regular(1));
  play(session, regular(1));
  applyInjury(p, { type: 'Out 4W', weeksRemaining: 4 }, { gameId: regular(1).gameId });
  const played = play(session, regular(2));
  // An isolated compensation counterfactual, not a claim that scheduled
  // 2026 practice salary ranges produce this offset. Preserve the actual
  // elevation/injury/game references and the adjustment arithmetic.
  const pay = p.elevationInjuryPay.payroll[0];
  pay.practiceCents = pay.payCents;
  pay.additionalCents = pay.capChargeCents = 0;
  session.league.capLedger.BUF.elevationInjuryCharges[0].amountCents = 0;
  p.pensionService.planYears[2026].games.pop();
  recordPensionGameService({ league: session.league, result: played });
  assert.equal(p.elevationInjuryPay.payroll[0].additionalCents, 0);
  assert.equal(p.pensionService.planYears[2026].games.length, 2);
  assert.equal(p.pensionService.planYears[2026].games[1].reason, 'elevation-injury-continuation');
  assert.equal(inspectSnapshotCompatibility(session.toSnapshot()).ok, true);
});

test('native football reserve qualifies while unknown/nonfootball reserve is not silently credited', () => {
  const p = player({ rosterSlot: 'reserve', designations: { ir: true }, reserveStatus: { kind: 'ir', year: 2026 }, injury: { origin: 'football' } });
  const l = league(p);
  recordPensionGameService({ league: l, result: regular(1) });
  assert.equal(p.pensionService.planYears[2026].games[0].reason, 'football-reserve');
  p.injury.origin = 'nonfootball';
  recordPensionGameService({ league: l, result: regular(2) });
  assert.equal(p.pensionService.planYears[2026].games.length, 1);
});

test('malformed pension evidence refuses restore and match before state or RNG changes', () => {
  const { session, p } = fixture();
  p.pensionService.version = 'future-unsupported';
  const snapshot = expandSnapshotPensionService(session.toSnapshot()), before = JSON.stringify(snapshot), seed = session.rng.seed;
  assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode, 'PENSION_SERVICE_INVALID');
  assert.throws(() => createSessionFromSnapshot(snapshot), error => error.reasonCode === 'PENSION_SERVICE_INVALID');
  assert.throws(() => simulateMatch({ league: session.league, statBook: session.statBook, rng: session.rng, ...regular(1) }), error => error.reasonCode === 'PENSION_SERVICE_INVALID');
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(session.rng.seed, seed);
});

test('label aliases cannot turn one physical game into three pension proofs', () => {
  const p = player(), l = league(p);
  recordPensionGameService({ league: l, result: regular(1) });
  const before = JSON.stringify(l);
  for (const label of ['other-label', 'duplicate-label']) {
    assert.throws(() => recordPensionGameService({ league: l, result: { ...regular(1), label,
      gameId: `2026-regular-${label}-1-MIA-BUF` } }), error => error.reasonCode === 'PENSION_SERVICE_INVALID');
    assert.equal(JSON.stringify(l), before);
  }
  for (const label of ['afc-wildcard', 'nfc-wildcard']) recordPensionGameService({ league: l,
    result: { ...regular(1), week: 0, seasonType: 'playoffs', label, gameId: `2026-playoffs-${label}-0-MIA-BUF` } });
  assert.equal(p.pensionService.planYears[2026].games.length, 2);
});

test('future years, unknown clubs and fabricated membership references fail both restore seams and match preflight', () => {
  const { session, p } = fixture();
  for (const variation of ['future', 'unknown-club', 'invented-id', 'unrelated-source', 'duplicate-physical']) {
    const snapshot = expandSnapshotPensionService(session.toSnapshot()), target = snapshot.league.players.find(row => row.id === p.id);
    const year = variation === 'future' ? 2035 : 2026;
    const games = [1, 2, 3].map(week => {
      const gameId = `${year}-regular-regular-season-${week}-MIA-BUF`;
      return { gameId, teamId: 'BUF', seasonType: 'regular', week, reason: 'active-inactive', sourceRef: gameId };
    });
    if (variation === 'unknown-club') for (const game of games) {
      game.teamId = 'UNKNOWN'; game.gameId = game.sourceRef = game.gameId.replace(/BUF$/, 'UNKNOWN');
    }
    if (variation === 'invented-id') for (const game of games) game.gameId = game.sourceRef = `invented-${game.week}`;
    if (variation === 'unrelated-source') games[0].sourceRef = 'unrelated';
    if (variation === 'duplicate-physical') games[2] = structuredClone(games[0]);
    target.pensionService.planYears = { [year]: { games, finalized: true, awarded: true } };
    const before = JSON.stringify(snapshot), seed = session.rng.seed;
    assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode, 'PENSION_SERVICE_INVALID', variation);
    assert.throws(() => createSessionFromSnapshot(snapshot), error => error.reasonCode === 'PENSION_SERVICE_INVALID', variation);
    assert.throws(() => simulateMatch({ league: snapshot.league, statBook: session.statBook, rng: session.rng, ...regular(1) }),
      error => error.reasonCode === 'PENSION_SERVICE_INVALID', variation);
    assert.equal(JSON.stringify(snapshot), before);
    assert.equal(session.rng.seed, seed);
  }
});

test('ordinary historical games do not inherit modern elevation eligibility year limits', () => {
  for (const year of [2004, 2021, 2022]) {
    const session = createSession({ seed: 117, startYear: year, controlledTeamId: 'BUF' });
    const result = simulateGame({ league: session.league, statBook: session.statBook, rng: session.rng,
      year, week: 1, homeTeamId: 'BUF', awayTeamId: 'MIA', seasonType: 'regular', label: 'regular-season' });
    assert.equal(result.year, year);
    const p = session.league.players.find(p => p.teamId === 'BUF' && p.pensionService?.planYears[year]?.games.length);
    assert.ok(p, `actual ${year} game records observed service`);
    assert.equal(p.pensionService.planYears[year].games[0].gameId, `${year}-regular-regular-season-1-MIA-BUF`);
    // Other pre-existing historical-year ledger restrictions are outside this
    // compatibility regression. Assert pension authority, not whole-save support.
    assert.doesNotThrow(() => validateSnapshotPlayerService(session.toSnapshot()));
  }
});

test('a standalone tactical game cannot create pension evidence', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  const before = session.league.players.map(p => JSON.stringify(p.pensionService));
  const result = simulateGame({ league: session.league, statBook: session.statBook, rng: session.rng,
    year: 2026, week: 1, homeTeamId: 'BUF', awayTeamId: 'MIA', seasonType: 'regular', label: 'situational-calls' });
  assert.equal(result.label, 'situational-calls');
  assert.deepEqual(session.league.players.map(p => JSON.stringify(p.pensionService)), before);
});

test('interactive league financial-year authority permits observed games after the opening year', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.simulateOneSeason();
  assert.equal(session.currentYear, 2027);
  session.advanceWeek();
  const observed = session.league.players.filter(p => p.pensionService?.planYears[2027]?.games.length);
  assert.ok(observed.length > 1000);
  assert.equal(inspectSnapshotCompatibility(session.toSnapshot()).ok, true);
  assert.deepEqual(createSessionFromSnapshot(session.toSnapshot()).getPlayerById(observed[0].id).pensionService, observed[0].pensionService);
});
