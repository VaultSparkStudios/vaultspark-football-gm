import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPracticeContract,recordPracticeWeekPay,recordPracticePostseasonPay,activatePracticePlayer} from '../src/domain/practiceContracts.js';
import {standardElevationGame,declareStandardElevation,settleStandardElevationGame,validateSnapshotStandardElevations} from '../src/domain/standardElevations.js';
import {recordElevationFootballInjury,recordElevationInjuryWeekPay,elevationInjuryReleaseRefusal} from '../src/domain/elevationInjuryPay.js';
import {applyInjury,advanceInjuryRecovery,rollGameInjuries} from '../src/engine/injurySystem.js';
import {capUsedByTeam,releaseToFreeAgency,normalizeRosterSlots,enforceRosterAndCapCompliance} from '../src/engine/capCompliance.js';
import {applyCapRollover,runOffseason,expireContracts,applyAgingProgressionAndRetirements} from '../src/engine/offseasonSimulator.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {simulateGame} from '../src/engine/gameSimulator.js';
import {RNG} from '../src/utils/rng.js';

const game=week=>standardElevationGame({year:2026,week,homeTeamId:'BUF',awayTeamId:'MIA'});
function fixture(){
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  session.league.teamCapOverride.BUF=1e9;session.phase='regular-season';
  const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
  assert.ok(player);return {session,league:session.league,player};
}
function declare(league,player,g=game(1)){
  assert.equal(declareStandardElevation({league,player,teamId:'BUF',game:g,capSpace:1e8}).ok,true);
  return g;
}
function injuredFixture(){
  const result=fixture(),g=declare(result.league,result.player);
  settleStandardElevationGame({league:result.league,result:{...g,winnerId:'BUF'}});
  applyInjury(result.player,{type:'Out 4W',weeksRemaining:4},{gameId:g.gameId});
  return result;
}

test('readiness recovery preview preserves qualifying injury pay and the whole franchise on refusal',()=>{
  const {session,league,player}=injuredFixture();
  player.injury.weeksRemaining=1;
  const blockedClub=session.seasonSchedule[session.currentWeek-1].games.flatMap(game=>[game.homeTeamId,game.awayTeamId]).find(id=>id!=='BUF');
  assert.ok(blockedClub);
  for(const candidate of league.players.filter(p=>p.teamId===blockedClub)) candidate.injury={type:'Out 16W',weeksRemaining:16};
  const before=JSON.stringify(session.toSnapshot());
  for(let attempt=0;attempt<2;attempt++) {
    assert.equal(session.getAdvanceReadiness().ok,false);
    assert.equal(JSON.stringify(session.toSnapshot()),before,'read-only recovery must not end the saved entitlement');
    assert.equal(player.elevationInjuryPay.episodes[0].status,'active');
  }
  assert.equal(session.advanceWeek().ok,false);
  assert.equal(JSON.stringify(session.toSnapshot()),before,'refused advance preserves injury, salary rights, counters and RNG');
});

test('qualifying down-pay replaces weekly compensation through a separate cents adjustment without changing practice terms',()=>{
  const {league,player}=injuredFixture(),contract=structuredClone(player.contract),before=capUsedByTeam(league,'BUF');
  assert.equal(recordElevationInjuryWeekPay(league,{year:2026,week:1}).length,0,'incident week already earns elevation up pay');
  const rows=recordPracticeWeekPay(league,{year:2026,week:2});
  const adjustment=rows.find(row=>row.playerId===player.id&&row.kind==='elevation-injury-adjustment');
  assert.ok(adjustment);assert.equal(adjustment.payCents,2_861_111);
  assert.equal(adjustment.practiceCents,contract.weeklySalary*100);
  assert.equal(adjustment.additionalCents,adjustment.payCents-adjustment.practiceCents);
  assert.equal(adjustment.capChargeCents,adjustment.additionalCents);
  assert.ok(Math.abs(capUsedByTeam(league,'BUF')-before-adjustment.additionalCents/100)<1e-7);
  const {payLedger,...paid}=player.contract,{payLedger:previousLedger,...original}=contract;
  assert.deepEqual(paid,original);assert.equal(player.contract.payLedger['2026:2'].amount*100+adjustment.additionalCents,adjustment.payCents);
  const once=JSON.stringify(league);assert.deepEqual(recordPracticeWeekPay(league,{year:2026,week:2}),[]);assert.equal(JSON.stringify(league),once);
  validateSnapshotStandardElevations({league});
});

test('actual match settles a pregame elevated-practice injury, and the next payroll continues salary',()=>{
  const {session,league,player}=fixture(),g=declare(league,player);
  applyInjury(player,{type:'Out 3W',weeksRemaining:3},{gameId:g.gameId,origin:'elevated-practice'});
  assert.equal(player.elevationInjuryPay.episodes[0].origin,'elevated-practice');
  const source=JSON.stringify(league);
  assert.throws(()=>recordElevationInjuryWeekPay(league,{year:2026,week:2}),/unsettled injury source/);assert.equal(JSON.stringify(league),source);
  simulateGame({league,statBook:session.statBook,rng:new RNG(117),...g});
  assert.equal(player.standardElevations.games[0].status,'reverted');
  assert.equal(recordElevationInjuryWeekPay(league,{year:2026,week:2}).length,1);
});

test('ordinary practice and non-incapacitating game injuries cannot create continuation entitlements',()=>{
  const {league,player}=fixture();
  applyInjury(player,{type:'Out 3W',weeksRemaining:3});assert.equal(player.elevationInjuryPay,undefined);
  assert.equal(recordElevationFootballInjury(player,{gameId:'unknown'}),null);
  assert.deepEqual(recordElevationInjuryWeekPay(league,{year:2026,week:2}),[]);
  player.injury=null;const g=declare(league,player);settleStandardElevationGame({league,result:{...g,winnerId:'BUF'}});
  applyInjury(player,{type:'Questionable',weeksRemaining:0},{gameId:g.gameId});assert.equal(player.elevationInjuryPay,undefined);
});

test('native game injury roller records elevation evidence and deduplicates event retries',()=>{
  const {league,player}=fixture(),g=declare(league,player);settleStandardElevationGame({league,result:{...g,winnerId:'BUF'}});
  let calls=0;const rng={next:()=>calls++===0?0:.95};
  const events=rollGameInjuries([player],[],rng,1,{gameId:g.gameId});
  assert.equal(events.length,1);assert.ok(player.injury.weeksRemaining>0);
  const before=JSON.stringify(player.elevationInjuryPay);
  recordElevationFootballInjury(player,{gameId:g.gameId});assert.equal(JSON.stringify(player.elevationInjuryPay),before);
});

test('recovery ends continuation; later unrelated injuries cannot revive the same entitlement',()=>{
  const {league,player}=injuredFixture();recordPracticeWeekPay(league,{year:2026,week:2});
  player.injury.weeksRemaining=1;advanceInjuryRecovery(league);
  assert.equal(player.injury,null);assert.equal(player.elevationInjuryPay.episodes[0].status,'recovered');
  const cap=capUsedByTeam(league,'BUF');recordPracticeWeekPay(league,{year:2026,week:3});
  assert.equal(capUsedByTeam(league,'BUF'),cap);assert.equal(player.elevationInjuryPay.payroll.length,1);
  applyInjury(player,{type:'Out 3W',weeksRemaining:3});recordPracticeWeekPay(league,{year:2026,week:4});
  assert.equal(player.elevationInjuryPay.payroll.length,1);
});

test('postseason continuation follows participating-club pay weeks, remains a benefit and deduplicates byes',()=>{
  const {league,player}=fixture(),g=declare(league,player,game(18));
  settleStandardElevationGame({league,result:{...g,winnerId:'BUF'}});
  applyInjury(player,{type:'Out 5W',weeksRemaining:5},{gameId:g.gameId});
  const cap=capUsedByTeam(league,'BUF');
  assert.deepEqual(recordPracticePostseasonPay(league,{year:2026,week:19,teamIds:['MIA']}).filter(row=>row.playerId===player.id),[]);
  for(const week of [19,20,21,22,23]){
    const rows=recordPracticePostseasonPay(league,{year:2026,week,teamIds:['BUF']});
    assert.equal(rows.filter(row=>row.playerId===player.id&&row.kind==='elevation-injury-adjustment').length,1);
    assert.equal(player.elevationInjuryPay.payroll.at(-1).capChargeCents,0);
    assert.deepEqual(recordPracticePostseasonPay(league,{year:2026,week,teamIds:['BUF']}),[]);
  }
  assert.equal(capUsedByTeam(league,'BUF'),cap);assert.equal(player.elevationInjuryPay.payroll.length,5);
  validateSnapshotStandardElevations({league});
});

test('career restores retain injury/cap receipts and reject fabricated or removed payroll evidence',()=>{
  const {session,league,player}=injuredFixture();recordPracticeWeekPay(league,{year:2026,week:2});
  const snapshot=session.toSnapshot();assert.equal(inspectSnapshotCompatibility(snapshot).ok,true);
  const restored=createSessionFromSnapshot(snapshot),after=restored.getPlayerById(player.id);
  assert.deepEqual(after.elevationInjuryPay,player.elevationInjuryPay);
  assert.ok(Number.isFinite(restored.getTeamCapSummary('BUF').usedCap));
  assert.equal(restored.getTeamCapSummary('BUF').usedCap,session.getTeamCapSummary('BUF').usedCap);
  for(const modify of [
    (p,s)=>delete s.league.capLedger.BUF.elevationInjuryCharges,
    p=>p.elevationInjuryPay.payroll[0].payCents++,
    p=>p.elevationInjuryPay.episodes[0].gameId='unknown',
    p=>p.elevationInjuryPay.payroll.push(structuredClone(p.elevationInjuryPay.payroll[0]))
  ]){
    const invalid=structuredClone(snapshot);modify(invalid.league.players.find(p=>p.id===player.id),invalid);
    assert.equal(inspectSnapshotCompatibility(invalid).ok,false);assert.throws(()=>createSessionFromSnapshot(invalid),/elevation injury pay/);
  }
});

test('unresolved injured practice releases and trades refuse before mutation; CPU compliance preserves authority',()=>{
  const {session,league,player}=injuredFixture();
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(elevationInjuryReleaseRefusal(player).reasonCode,'ELEVATION_INJURY_SETTLEMENT_REQUIRED');
  assert.equal(session.releasePlayer({teamId:'BUF',playerId:player.id}).reasonCode,'ELEVATION_INJURY_SETTLEMENT_REQUIRED');
  assert.throws(()=>releaseToFreeAgency(league,player),/salary continuation/);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  assert.equal(session.evaluateTradePackage({teamA:'BUF',teamB:'MIA',teamAPlayerIds:[player.id],teamBPlayerIds:[],teamAPickIds:[],teamBPickIds:[]}).reasonCode,'ELEVATION_INJURY_SETTLEMENT_REQUIRED');
  const contract=structuredClone(player.contract);normalizeRosterSlots(league);enforceRosterAndCapCompliance(league);
  assert.deepEqual(player.contract,contract);assert.equal(player.rosterSlot,'practice');
});

test('permanent active contract supersedes practice continuation while original-club earned charges remain',()=>{
  const {league,player}=injuredFixture();recordPracticeWeekPay(league,{year:2026,week:2});
  const charges=structuredClone(league.capLedger.BUF.elevationInjuryCharges);
  assert.equal(activatePracticePlayer(league,player).ok,true);
  assert.equal(player.elevationInjuryPay.episodes[0].status,'active-contract');
  assert.deepEqual(recordElevationInjuryWeekPay(league,{year:2026,week:3}),[]);
  assert.deepEqual(league.capLedger.BUF.elevationInjuryCharges,charges);validateSnapshotStandardElevations({league});
});

test('annual rollover banks earned injury charges before clearing them; unresolved cross-year pay refuses atomically',()=>{
  const {session,league,player}=injuredFixture();recordPracticeWeekPay(league,{year:2026,week:2});
  const forecast=session.getTeamCapSummary('BUF').rolloverNextYearEstimate;
  applyCapRollover(league,{completedYear:2026});assert.equal(league.capLedger.BUF.rollover,forecast);
  assert.deepEqual(league.capLedger.BUF.elevationInjuryCharges,[]);validateSnapshotStandardElevations({league});
  const before=JSON.stringify(league);
  assert.throws(()=>recordElevationInjuryWeekPay(league,{year:2027,week:1}),/unresolved injury contract transition/);
  assert.equal(JSON.stringify(league),before);
  assert.throws(()=>recordElevationInjuryWeekPay(league,{year:2026,week:3}),/injury payroll year closed/);
  assert.equal(JSON.stringify(league),before);
});

test('actual interactive and headless annual transitions refuse unresolved injuries before cap, RNG, expiry or retirement changes',()=>{
  const {session,league,player}=injuredFixture();player.injury.weeksRemaining=16;
  const before=JSON.stringify(session.toSnapshot());
  for(const operation of [
    ()=>session.runRosterYearRollover(),
    ()=>runOffseason({league,year:2026,rng:session.rng}),
    ()=>expireContracts(league),
    ()=>applyAgingProgressionAndRetirements(league,2026,session.rng)
  ]){
    assert.throws(operation,error=>error.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
    assert.equal(JSON.stringify(session.toSnapshot()),before);
  }
  player.injury.weeksRemaining=1;advanceInjuryRecovery(league);
  assert.equal(session.runRosterYearRollover().ok,true,'normal offseason resumes after recorded recovery');
});
