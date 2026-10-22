import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {applyInjury,advanceInjuryRecovery} from '../src/engine/injurySystem.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {recordPracticeWeekPay,recordPracticePostseasonPay} from '../src/domain/practiceContracts.js';
import {recordReserveGameAbsences} from '../src/domain/reserveLists.js';
import {capUsedByTeam,normalizeRosterSlots} from '../src/engine/capCompliance.js';
function fixture({elevated=false}={}){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const p=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 assert.ok(p);session.league.teamCapOverride.BUF=1e9;
 if(elevated){const game=standardElevationGame({year:2026,week:1,homeTeamId:'BUF',awayTeamId:'MIA'});
  assert.equal(declareStandardElevation({league:session.league,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
  settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
  applyInjury(p,{type:'Out 6W',weeksRemaining:6},{gameId:game.gameId});
 }else applyInjury(p,{type:'Out 6W',weeksRemaining:6});
 const designate=options=>session.setPlayerDesignation({teamId:'BUF',playerId:p.id,designation:'ps-injured',...options});
 return {session,p,designate};
}
test('Practice Squad/Injured preserves practice terms and cap while freeing only a practice place',()=>{
 const {session,p,designate}=fixture();const terms=structuredClone(p.contract),seed=session.rng.seed,cap=capUsedByTeam(session.league,'BUF');
 const active=session.league.players.filter(q=>q.teamId==='BUF'&&q.rosterSlot==='active').length;
 assert.equal(designate().ok,true);assert.equal(p.rosterSlot,'reserve');assert.equal(p.reserveStatus.kind,'ps-injured');
 assert.deepEqual(p.contract,terms);assert.equal(capUsedByTeam(session.league,'BUF'),cap);assert.equal(session.rng.seed,seed);
 assert.equal(session.league.players.filter(q=>q.teamId==='BUF'&&q.rosterSlot==='active').length,active);
 const once=JSON.stringify(session.toSnapshot());assert.equal(designate().unchanged,true);assert.equal(JSON.stringify(session.toSnapshot()),once);
 assert.equal(createSessionFromSnapshot(session.toSnapshot()).getPlayerById(p.id).reserveStatus.kind,'ps-injured');
 normalizeRosterSlots(session.league);assert.equal(p.rosterSlot,'reserve');
});
test('reserve practice payroll preserves ordinary weekly pay and qualifying elevation continuation',()=>{
 for(const elevated of [false,true]){
  const {session,p,designate}=fixture({elevated});assert.equal(designate().ok,true);
  const rows=recordPracticeWeekPay(session.league,{year:2026,week:2});
  assert.ok(rows.some(r=>r.playerId===p.id&&r.amount===p.contract.weeklySalary));
  assert.equal(rows.some(r=>r.playerId===p.id&&r.kind==='elevation-injury-adjustment'),elevated);
  const once=JSON.stringify(session.toSnapshot());assert.deepEqual(recordPracticeWeekPay(session.league,{year:2026,week:2}),[]);assert.equal(JSON.stringify(session.toSnapshot()),once);
  const post=recordPracticePostseasonPay(session.league,{year:2026,week:19,teamIds:['BUF']});
  assert.ok(post.some(r=>r.playerId===p.id&&r.kind==='practice-postseason-benefit-v1'));
  assert.equal(post.some(r=>r.playerId===p.id&&r.kind==='elevation-injury-adjustment'),elevated);
  assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
  if(elevated){assert.equal(session.releasePlayer({teamId:'BUF',playerId:p.id}).reasonCode,'ELEVATION_INJURY_SETTLEMENT_REQUIRED');
   const before=JSON.stringify(session.toSnapshot());assert.throws(()=>session.runRosterYearRollover(),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');assert.equal(JSON.stringify(session.toSnapshot()),before);}
 }
});
test('return uses practice capacity and eligibility, preserves contract, and charges designation once',()=>{
 const {session,p,designate}=fixture();assert.equal(designate().ok,true);
 for(let week=1;week<=4;week++)recordReserveGameAbsences({league:session.league,result:{year:2026,week,seasonType:'regular',homeTeamId:'BUF',awayTeamId:'MIA'}});
 for(let i=0;i<6;i++)advanceInjuryRecovery(session.league);
 session.currentWeek=5;const terms=structuredClone(p.contract);
 assert.equal(session.getRoster('BUF').find(q=>q.id===p.id).reserveStatus.activation.ok,true,'full active roster does not prevent practice return');
 assert.equal(designate({active:false,beginPractice:true}).ok,true);assert.equal(session.league.reserveReturnHistory.length,1);
 assert.equal(designate({active:false}).ok,true);assert.equal(p.rosterSlot,'practice');assert.deepEqual(p.contract,terms);assert.equal(session.league.reserveReturnHistory.length,1);
 assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
});
test('practice return and invalid placement refuse without changing the saved franchise',()=>{
 const {session,p,designate}=fixture();const refused=opts=>{const before=JSON.stringify(session.toSnapshot());assert.equal(designate(opts).ok,false);assert.equal(JSON.stringify(session.toSnapshot()),before);};
 p.injury=null;refused();applyInjury(p,{type:'Out 4W',weeksRemaining:4});
 assert.equal(designate().ok,true);refused({active:false});
 for(let week=1;week<=4;week++)recordReserveGameAbsences({league:session.league,result:{year:2026,week,seasonType:'regular',homeTeamId:'BUF',awayTeamId:'MIA'}});
 for(let i=0;i<4;i++)advanceInjuryRecovery(session.league);session.currentWeek=5;
 const replacement=session.league.players.find(q=>q.teamId==='BUF'&&q.rosterSlot==='active'&&q.experience===0);assert.ok(replacement);replacement.rosterSlot='practice';
 assert.equal(session.getRoster('BUF').find(q=>q.id===p.id).reserveStatus.activation.reasonCode,'PRACTICE_SQUAD_FULL');refused({active:false});
 const bad=session.toSnapshot();bad.league.players.find(q=>q.id===p.id).reserveStatus.countsAgainstReturnLimit=false;
 assert.throws(()=>createSessionFromSnapshot(bad),/Invalid reserve receipt/);
});
test('actual weekly play cannot turn ordinary Practice Squad/Injured salary into active service',()=>{
 const {session,p,designate}=fixture();p.injury.weeksRemaining=9;assert.equal(designate().ok,true);
 const before=structuredClone(p.contract);assert.notEqual(session.advanceWeek().ok,false);
 const row=p.serviceLedger?.seasons?.[2026];assert.ok(row);assert.notEqual(row.seen,0);
 assert.equal(row.accrued,0);assert.equal(row.credited,0);assert.equal(row.active,0);
 assert.ok(p.contract.payLedger['2026:1']);assert.equal(p.contract.kind,before.kind);
 assert.equal(p.pensionService?.planYears?.[2026]?.games.length||0,0);
 assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
});
