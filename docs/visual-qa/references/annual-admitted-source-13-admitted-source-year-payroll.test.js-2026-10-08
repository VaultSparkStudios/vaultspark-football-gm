import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {recordElevationInjuryWeekPay,assertElevationInjuryContractTransition} from '../src/domain/elevationInjuryPay.js';
import {retainAdmittedInjuryContinuation} from '../src/domain/admittedInjuryContinuation.js';
import {regularElevationSalaryForSeason} from '../src/data/nflElevationSalary.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';

function fixture(weeks=3){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Qualifying injury',weeksRemaining:weeks},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 session.phase='offseason';session.currentWeek=19;
 return {session,league,player,game};
}
const original=fixture(16);
function fresh(weeks=3){
 const session=createSessionFromSnapshot(original.session.toSnapshot()),league=session.league;
 const player=league.players.find(p=>p.id===original.player.id);player.injury.weeksRemaining=weeks;
 return {session,league,player,game:original.game};
}
const advance=f=>advancePreRolloverMedicalCalendar(f.league,{completedYear:2026,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
const rate=player=>regularElevationSalaryForSeason(2026,player.elevationInjuryPay.episodes[0].creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;

test('admitted source-year calendar pays every incapacity period before recovery, without filing a dispute',()=>{
 const f=fresh(),before=f.session.toSnapshot(),service=JSON.stringify([f.player.serviceHistory,f.player.pensionService]);
 advance(f);
 assert.equal(f.player.injury,null);assert.equal(f.player.elevationInjuryPay.episodes[0].status,'recovered');
 assert.deepEqual(f.player.elevationInjuryPay.payroll.map(r=>[r.week,r.payCents,r.practiceCents,r.additionalCents]),[24,25,26].map(w=>[w,rate(f.player),0,rate(f.player)]));
 assert.equal(f.league.admittedInjuryContinuations.length,1);
 assert.equal(f.league.injurySalaryClaims,undefined);assert.equal(f.league.annualElevationInjuryResolutions,undefined);
 assert.deepEqual(f.player.contract,before.league.players.find(p=>p.id===f.player.id).contract);
 assert.equal(JSON.stringify([f.player.serviceHistory,f.player.pensionService]),service);
 assert.deepEqual(f.session.toSnapshot().rngStreams,before.rngStreams);assert.equal(f.session.toSnapshot().rngSeed,before.rngSeed);
 assert.equal(f.league.capLedger.BUF.elevationInjuryCharges.length,3);
 const once=JSON.stringify(f.session.toSnapshot());assert.equal(advance(f).alreadyRun,true);assert.equal(JSON.stringify(f.session.toSnapshot()),once);
});

test('explicit legacy claim mode remains distinct from admitted compensation',()=>{
 const legacy=fresh(),admitted=fresh();
 advancePreRolloverMedicalCalendar(legacy.league,{completedYear:2026,preservePostTermClaims:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 advance(admitted);
 assert.deepEqual(legacy.player.elevationInjuryPay.payroll.map(r=>r.week),[24]);
 assert.equal(legacy.league.injurySalaryClaims.length,1);assert.equal(legacy.player.elevationInjuryPay.episodes[0].status,'claim-pending');
 assert.deepEqual(admitted.player.elevationInjuryPay.payroll.map(r=>r.week),[24,25,26]);
 assert.equal(admitted.league.injurySalaryClaims,undefined);
});

test('ongoing rights survive the calendar without employment extension or a settlement estimate',()=>{
 const f=fresh(16),contract=structuredClone(f.player.contract);advance(f);
 assert.equal(f.player.injury.weeksRemaining,12);assert.equal(f.player.elevationInjuryPay.episodes[0].status,'active');
 assert.deepEqual(f.player.elevationInjuryPay.payroll.map(r=>r.week),[24,25,26,27]);
 assert.deepEqual(f.player.contract,contract);
 assert.doesNotThrow(()=>assertElevationInjuryContractTransition(f.league,{allowAdmittedSourceYear:true}));
 assert.throws(()=>assertElevationInjuryContractTransition(f.league),error=>error.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.equal(f.league.injurySalaryClaims,undefined);assert.equal(f.league.capLedger.BUF.injurySalaryClaimCharges,undefined);
});

test('post-term same-year payment follows the original payer after free agency or another employer',()=>{
 for(const teamId of ['FA','MIA']){
  const f=fresh(16);retainAdmittedInjuryContinuation(f.league,{playerId:f.player.id,gameId:f.game.gameId});
  f.league.preRolloverMedicalCalendar=[{version:'pre-rollover-medical-calendar-v1',year:2026,throughWeek:27,finalGameId:f.league.gameArchive.at(-1).gameId}];
  f.player.teamId=teamId;f.player.rosterSlot='active';f.player.contract=null;
  const result=recordElevationInjuryWeekPay(f.league,{year:2026,week:25});
  assert.equal(result.length,1);assert.equal(result[0].teamId,'BUF');assert.equal(result[0].practiceCents,0);
  assert.equal(result[0].additionalCents,rate(f.player));assert.equal(f.league.capLedger.BUF.elevationInjuryCharges.length,1);
  assert.equal(f.league.capLedger.MIA?.elevationInjuryCharges?.length||0,0);
  assert.equal(f.player.contract,null);assert.equal(f.player.teamId,teamId);
  const once=JSON.stringify(f.league);assert.deepEqual(recordElevationInjuryWeekPay(f.league,{year:2026,week:25}),[]);assert.equal(JSON.stringify(f.league),once);
 }
});

test('an admitted right cannot invent pre-expiry employment, a new-year interval, or closed-year pay',()=>{
 for(const [year,week,closed] of [[2026,24,false],[2027,1,false],[2026,25,true]]){
  const f=fresh(16);retainAdmittedInjuryContinuation(f.league,{playerId:f.player.id,gameId:f.game.gameId});
  f.league.preRolloverMedicalCalendar=[{version:'pre-rollover-medical-calendar-v1',year:2026,throughWeek:27,finalGameId:f.league.gameArchive.at(-1).gameId}];
  f.player.teamId='FA';f.player.contract=null;f.player.rosterSlot='active';
  if(year===2027){f.league.year=2027;f.league.financialYear=2027;}
  if(closed)f.league.capLedger.BUF.rolloverAppliedThroughYear=2026;
  const before=JSON.stringify(f.league);
  if(year===2027)assert.deepEqual(recordElevationInjuryWeekPay(f.league,{year,week}),[],'old sources are paid only by the separate earning-period ledger');
  else assert.throws(()=>recordElevationInjuryWeekPay(f.league,{year,week}),error=>error.reasonCode==='ELEVATION_INJURY_PAY_INVALID');
  assert.equal(JSON.stringify(f.league),before);
 }
});

test('bad authority, unproved terms and conflicting authority choices refuse the calendar atomically',()=>{
 for(const mutate of [f=>{retainAdmittedInjuryContinuation(f.league,{playerId:f.player.id,gameId:f.game.gameId});f.league.admittedInjuryContinuations[0].term.endsAfterMedicalWeek++;},f=>{retainAdmittedInjuryContinuation(f.league,{playerId:f.player.id,gameId:f.game.gameId});f.league.admittedInjuryContinuations[0].weeklyRateCents++;}]){
  const f=fresh(16);mutate(f);const before=JSON.stringify(f.league);
  assert.throws(()=>advance(f));assert.equal(JSON.stringify(f.league),before);
 }
 const f=fresh(),before=JSON.stringify(f.league);
 assert.throws(()=>advancePreRolloverMedicalCalendar(f.league,{completedYear:2026,preservePostTermClaims:true,preserveAdmittedRights:true}));
 assert.equal(JSON.stringify(f.league),before);
 const unplayed=fresh();unplayed.league.gameArchive=[];const untouched=JSON.stringify(unplayed.league);
 assert.equal(advance(unplayed).notApplicable,true);assert.equal(JSON.stringify(unplayed.league),untouched);
});

test('compressed save and actual restored session preserve earned admitted pay and retry identity',async()=>{
 const f=fresh(16);advance(f);const saved=f.session.toSnapshot();
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(saved)));
 assert.deepEqual(restored.league.admittedInjuryContinuations,saved.league.admittedInjuryContinuations);
 assert.deepEqual(restored.league.players.find(p=>p.id===f.player.id).elevationInjuryPay,f.player.elevationInjuryPay);
 const before=JSON.stringify(restored.toSnapshot());
 assert.equal(advancePreRolloverMedicalCalendar(restored.league,{completedYear:2026,preserveAdmittedRights:true}).alreadyRun,true);
 assert.equal(JSON.stringify(restored.toSnapshot()),before);
 const earned=structuredClone(f.player.elevationInjuryPay.payroll);
 assert.equal(restored.runRosterYearRollover().ok,true);
 assert.deepEqual(restored.league.players.find(p=>p.id===f.player.id).elevationInjuryPay.payroll,earned);
 assert.equal(restored.league.financialYear,2027);assert.equal(restored.league.offseasonMedicalCalendar[0].throughWeek,0);
 assert.equal(restored.league.injurySalaryClaims,undefined);
 const rolled=JSON.stringify(restored.toSnapshot());assert.equal(restored.runRosterYearRollover().alreadyRun,true);
 assert.equal(JSON.stringify(restored.toSnapshot()),rolled);
});
