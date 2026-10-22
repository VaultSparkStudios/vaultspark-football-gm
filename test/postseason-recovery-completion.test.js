import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { finishPostseasonRecovery, validatePostseasonMedicalClock } from '../src/domain/postseasonMedicalClock.js';
import { standardElevationGame, declareStandardElevation, settleStandardElevationGame } from '../src/domain/standardElevations.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { inspectSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';
import { releaseToFreeAgency } from '../src/engine/capCompliance.js';

function fixture() {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.phase = 'postseason'; session.currentWeek = 19;
  session.postseasonState = createPostseasonState({ league: session.league, year: 2026 });
  return session;
}
const play = session => simulateNextPostseasonGame({ state: session.postseasonState,
  league: session.league, statBook: session.statBook, year: 2026, rng: session.rng });
const finish = session => { while (session.postseasonState.status !== 'completed') play(session); };
function specimen(session, club, weeks = 30) {
  const player = session.league.players.find(row => row.teamId === club && row.rosterSlot === 'practice' && row.experience === 0);
  assert.ok(player);
  const team = session.league.teams.find(team => team.id === club);
  team.staff.medicalDirector.discipline = 72; team.owner.facilities.rehab = 72;
  const game = standardElevationGame({ year: 2026, week: 18, homeTeamId: club,
    awayTeamId: session.league.teams.find(team => team.id !== club).id });
  assert.equal(declareStandardElevation({ league: session.league, player, teamId: club, game, capSpace: 1e8 }).ok, true);
  settleStandardElevationGame({ league: session.league, result: { ...game, winnerId: club } });
  applyInjury(player, { type: `Out ${weeks}W`, weeksRemaining: weeks }, { gameId: game.gameId });
  return player;
}
const nonQualifier = session => session.league.teams.find(team => !Object.values(session.postseasonState.seeds).flat().some(row => row.teamId === team.id)).id;

test('nonqualifiers and free agents receive five elapsed periods without inventing practice pay or pension games', () => {
  const session = fixture(), club = nonQualifier(session), player = specimen(session, club);
  const freeAgent = session.league.players.find(row => row.teamId === club && row.rosterSlot === 'active');
  releaseToFreeAgency(session.league, freeAgent, 'completion-fixture');
  assert.equal(freeAgent.teamId, 'FA'); freeAgent.injury = { type: 'Out 8W', weeksRemaining: 8 };
  const pensionBefore = structuredClone(player.pensionService);
  finish(session);
  assert.equal(player.injury.weeksRemaining, 25);
  assert.equal(freeAgent.injury.weeksRemaining, 3);
  assert.equal(player.elevationInjuryPay.payroll.length, 5);
  for (const row of player.elevationInjuryPay.payroll) {
    assert.equal(row.practiceCents, 0);
    assert.equal(row.additionalCents, row.payCents);
    assert.equal(row.capChargeCents, 0);
  }
  assert.equal(player.contract.postseasonPayLedger, undefined);
  assert.deepEqual(player.pensionService, pensionBefore);
  assert.equal(session.postseasonState.medicalRecovery.throughWeek, 23);
  validatePostseasonMedicalClock(session.postseasonState);
});

test('applied and eliminated clubs receive the same elapsed recovery and continuation offsets match paid base', () => {
  const session = fixture(), next = nextPostseasonGame(session.postseasonState, session.league);
  const players = [specimen(session, next.homeTeamId), specimen(session, next.awayTeamId)];
  finish(session);
  for (const player of players) {
    assert.equal(player.injury.weeksRemaining, 25);
    assert.deepEqual(player.elevationInjuryPay.payroll.map(row => row.week).sort((a, b) => a - b), [19, 20, 21, 22, 23]);
    for (const row of player.elevationInjuryPay.payroll) {
      const base = player.contract.postseasonPayLedger?.[`2026:postseason:${row.week}`]?.amount || 0;
      assert.equal(row.practiceCents, base * 100);
      assert.equal(base * 100 + row.additionalCents, row.payCents);
    }
  }
});

test('end-season clearance pays the elapsed injured interval before recovery and repeated completion is inert', () => {
  const session = fixture(), player = specimen(session, nonQualifier(session), 3);
  finish(session);
  assert.equal(player.injury, null);
  assert.equal(player.elevationInjuryPay.episodes[0].status, 'recovered');
  assert.deepEqual(player.elevationInjuryPay.payroll.map(row => row.week), [19, 20, 21]);
  const before = JSON.stringify(session.toSnapshot());
  assert.deepEqual(finishPostseasonRecovery({ state: session.postseasonState, league: session.league, year: 2026 }),
    { ok: true, alreadyApplied: true });
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

for (const injuredWeeks of [1, 3, 5]) test(`nonqualifier earns all ${injuredWeeks} elapsed injured weeks, without added practice base or service, across restore`, () => {
  const session = fixture(), player = specimen(session, nonQualifier(session), injuredWeeks);
  const source = structuredClone(player.elevationInjuryPay.episodes[0]);
  const pension = structuredClone(player.pensionService);
  const contract = structuredClone(player.contract);
  finish(session);
  assert.equal(player.injury, null);
  assert.equal(player.elevationInjuryPay.episodes[0].status, 'recovered');
  assert.deepEqual(player.elevationInjuryPay.payroll.map(row => row.week),
    Array.from({length: injuredWeeks}, (_,i) => 19 + i));
  for (const row of player.elevationInjuryPay.payroll) {
    assert.equal(row.gameId, source.gameId); assert.equal(row.teamId, source.teamId);
    assert.equal(row.practiceCents, 0); assert.equal(row.additionalCents, row.payCents);
  }
  assert.deepEqual(player.contract, contract);
  assert.deepEqual(player.pensionService, pension);
  const snapshot = session.toSnapshot();
  assert.equal(inspectSnapshotCompatibility(snapshot).ok, true);
  const restored = createSessionFromSnapshot(structuredClone(snapshot));
  assert.deepEqual(restored.getPlayerById(player.id).elevationInjuryPay, player.elevationInjuryPay);
  const before = JSON.stringify(restored.toSnapshot());
  assert.equal(finishPostseasonRecovery({state:restored.postseasonState,league:restored.league,year:2026}).alreadyApplied,true);
  assert.equal(JSON.stringify(restored.toSnapshot()), before);
});

test('staff-accelerated clearance preserves the one elapsed payable period rather than projected remaining weeks', () => {
  const session = fixture(), player = specimen(session, nonQualifier(session), 3);
  const pension = structuredClone(player.pensionService);
  while(session.postseasonState.status !== 'completed') simulateNextPostseasonGame({
    state:session.postseasonState,league:session.league,statBook:session.statBook,year:2026,rng:session.rng,
    getTeamModifiers:()=>({extraRecoveryWeeks:2})
  });
  assert.equal(player.injury,null);
  assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>row.week),[19]);
  assert.equal(player.elevationInjuryPay.payroll[0].practiceCents,0);
  assert.deepEqual(player.pensionService,pension);
  assert.deepEqual(createSessionFromSnapshot(session.toSnapshot()).getPlayerById(player.id).elevationInjuryPay,player.elevationInjuryPay);
});

test('invalid deferred payroll refuses before final-game RNG, stats, bracket or recovery changes', () => {
  const session = fixture(), player = specimen(session, nonQualifier(session));
  for (let i = 0; i < 12; i++) play(session);
  session.league.capLedger[player.teamId].rolloverAppliedThroughYear = 2026;
  const before = JSON.stringify(session.toSnapshot());
  assert.throws(() => play(session), /injury payroll year closed/);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
});

test('completion receipt survives actual phase transition and both restore seams reject forged markers', () => {
  const session = fixture(); finish(session);
  assert.equal(session.advanceWeek().ok, true);
  assert.equal(session.phase, 'season-awards');
  assert.equal(session.postseasonState, null);
  assert.equal(session.latestPostseason.medicalRecovery.throughWeek, 23);
  const snapshot = session.toSnapshot(), restored = createSessionFromSnapshot(structuredClone(snapshot));
  assert.deepEqual(restored.latestPostseason.medicalRecovery, session.latestPostseason.medicalRecovery);
  for (const change of [{ version: 'unknown' }, { year: 2027 }, { throughWeek: 24 }]) {
    const bad = structuredClone(snapshot); Object.assign(bad.latestPostseason.medicalRecovery, change);
    const before = JSON.stringify(bad);
    assert.equal(inspectSnapshotCompatibility(bad).reasonCode, 'POSTSEASON_MEDICAL_CLOCK_INVALID');
    assert.throws(() => createSessionFromSnapshot(bad), /Invalid postseason medical clock/);
    assert.equal(JSON.stringify(bad), before);
  }
});

test('ordinary injured practice players recover without a fabricated elevation entitlement', () => {
  const session = fixture(), club = nonQualifier(session);
  const player = session.league.players.find(row => row.teamId === club && row.rosterSlot === 'practice');
  const team = session.league.teams.find(team => team.id === club);
  team.staff.medicalDirector.discipline = 72; team.owner.facilities.rehab = 72;
  player.injury = { type: 'Out 8W', weeksRemaining: 8 };
  finish(session);
  assert.equal(player.injury.weeksRemaining, 3);
  assert.equal(player.elevationInjuryPay, undefined);
  assert.equal(player.contract.postseasonPayLedger, undefined);
});
