import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury,advanceInjuryRecovery} from '../src/engine/injurySystem.js';
import {previewRegularInjuryAccrual,commitRegularInjuryAccrual} from '../src/domain/regularInjuryAccrual.js';
import {recordPracticeWeekPay} from '../src/domain/practiceContracts.js';
import {releaseToFreeAgency,capUsedByTeam} from '../src/engine/capCompliance.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';

function fixture(){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const matchup=session.seasonSchedule[0].games.find(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'));
 const game=standardElevationGame({...matchup,year:2026,week:1});
 assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Controlled clearance',weeksRemaining:1},{gameId:game.gameId});session.currentWeek=2;
 return {session,league,player};
}
const source=fixture();
function fresh(){const session=createSessionFromSnapshot(source.session.toSnapshot());return {session,league:session.league,player:session.league.players.find(p=>p.id===source.player.id)};}
const preview=f=>previewRegularInjuryAccrual(f.league,{year:2026,week:2});
const commit=(f,receipts)=>commitRegularInjuryAccrual(f.league,{year:2026,week:2,receipts});

test('eligibility preview is pure; actual weekly advance retains the clearance interval and cap',async()=>{
 const f=fresh(),before=JSON.stringify(f.session.toSnapshot()),receipts=preview(f);
 assert.equal(JSON.stringify(f.session.toSnapshot()),before);assert.equal(receipts.length,1);
 assert.equal(f.session.advanceWeek().ok,true);
 assert.equal(f.player.injury,null);assert.equal(f.player.elevationInjuryPay.episodes[0].status,'recovered');
 const row=f.player.elevationInjuryPay.payroll.find(r=>r.week===2);
 assert.equal(row.additionalCents,1486111);assert.equal(row.practiceCents,1375000);
 assert.equal(row.payCents,row.practiceCents+row.additionalCents);
 assert.equal(f.league.capLedger.BUF.elevationInjuryCharges.find(r=>r.playerId===f.player.id&&r.week===2).amountCents,row.additionalCents);
 const without=structuredClone(f.league);
 without.capLedger.BUF.elevationInjuryCharges=without.capLedger.BUF.elevationInjuryCharges.filter(r=>r.playerId!==f.player.id||r.week!==2);
 assert.equal(Math.round((capUsedByTeam(f.league,'BUF')-capUsedByTeam(without,'BUF'))*100),row.additionalCents);
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(f.session.toSnapshot())));
 assert.deepEqual(restored.league.players.find(p=>p.id===f.player.id).elevationInjuryPay,f.player.elevationInjuryPay);
});

test('the scheduled bye pays clearance without inventing participation or pension service',()=>{
 const f=fresh();f.session.currentWeek=f.session.seasonSchedule.find(w=>!w.games.some(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'))).week;
 const week=f.session.currentWeek,pension=structuredClone(f.player.pensionService),service=structuredClone(f.player.serviceHistory);
 assert.equal(f.session.advanceWeek().ok,true);assert.equal(f.player.injury,null);
 assert.equal(f.player.elevationInjuryPay.payroll.find(r=>r.week===week).additionalCents,1486111);
 assert.deepEqual(f.player.pensionService,pension);assert.deepEqual(f.player.serviceHistory,service);
});

test('ongoing injury ordinary payroll and delayed accrual reconcile once without double pay',()=>{
 const f=fresh();f.player.injury.weeksRemaining=3;const receipts=preview(f);
 advanceInjuryRecovery(f.league);recordPracticeWeekPay(f.league,{year:2026,week:2});
 const before=JSON.stringify(f.league);assert.deepEqual(commit(f,receipts),{applied:0,coveredByElevation:0});
 assert.equal(JSON.stringify(f.league),before);assert.equal(f.player.elevationInjuryPay.payroll.length,1);
});

test('clearance plus release preserves original payer and offsets only an actually paid base',()=>{
 const f=fresh(),receipts=preview(f);advanceInjuryRecovery(f.league);
 releaseToFreeAgency(f.league,f.player);assert.equal(f.player.teamId,'FA');
 recordPracticeWeekPay(f.league,{year:2026,week:2});commit(f,receipts);
 const row=f.player.elevationInjuryPay.payroll[0];assert.equal(row.teamId,'BUF');assert.equal(row.practiceCents,0);
 assert.equal(row.additionalCents,2861111);assert.equal(row.capChargeCents,row.additionalCents);
 assert.equal(f.player.teamId,'FA');assert.equal(f.player.injury,null);
 const once=JSON.stringify(f.league);assert.equal(commit(f,receipts).applied,0);assert.equal(JSON.stringify(f.league),once);
});

test('settled same-club elevation covers weekly minimum without a second top-up',()=>{
 const f=fresh(),receipts=preview(f);advanceInjuryRecovery(f.league);
 const matchup=f.session.seasonSchedule[1].games.find(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'));
 const game=standardElevationGame({...matchup,year:2026,week:2});
 assert.equal(declareStandardElevation({league:f.league,player:f.player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:f.league,result:{...game,winnerId:'BUF'}});recordPracticeWeekPay(f.league,{year:2026,week:2});
 const before=JSON.stringify(f.league);assert.deepEqual(commit(f,receipts),{applied:0,coveredByElevation:1});
 assert.equal(JSON.stringify(f.league),before);assert.equal(f.player.elevationInjuryPay.payroll.length,0);
});

test('malformed preflight, late bad receipts and conflicts leave their respective input state intact',()=>{
 const f=fresh(),receipts=preview(f);advanceInjuryRecovery(f.league);recordPracticeWeekPay(f.league,{year:2026,week:2});
 const before=JSON.stringify(f.league);
 for(const changed of [[...receipts,{...receipts[0],playerId:'missing'}],[{...receipts[0],payCents:receipts[0].payCents+1}],receipts.concat(receipts)]){
  assert.throws(()=>commit(f,changed));assert.equal(JSON.stringify(f.league),before);
 }
 const bad=fresh();bad.player.elevationInjuryPay.payroll.push({bad:true});const untouched=JSON.stringify(bad.session.toSnapshot());
 assert.throws(()=>bad.session.advanceWeek(),e=>e.reasonCode==='ELEVATION_INJURY_PAY_INVALID');
 assert.equal(JSON.stringify(bad.session.toSnapshot()),untouched);
});

test('actual readiness refusal does not pay or heal the clearance fixture',()=>{
 const f=fresh(),club=f.session.seasonSchedule[1].games.flatMap(g=>[g.homeTeamId,g.awayTeamId]).find(id=>id!=='BUF');
 for(const p of f.league.players.filter(p=>p.teamId===club))p.injury={type:'Out 16W',weeksRemaining:16};
 const before=JSON.stringify(f.session.toSnapshot());assert.equal(f.session.advanceWeek().ok,false);
 assert.equal(JSON.stringify(f.session.toSnapshot()),before);assert.equal(f.player.elevationInjuryPay.payroll.length,0);
});

test('uncommitted late accrual refuses closed-year writes while an exact earned retry remains inert',()=>{
 const unpaid=fresh(),pending=preview(unpaid);advanceInjuryRecovery(unpaid.league);recordPracticeWeekPay(unpaid.league,{year:2026,week:2});
 unpaid.league.financialYear=2027;unpaid.league.year=2027;unpaid.league.capLedger.BUF.rolloverAppliedThroughYear=2026;
 const before=JSON.stringify(unpaid.league);assert.throws(()=>commit(unpaid,pending),/financial year closed/);
 assert.equal(JSON.stringify(unpaid.league),before);
 const paid=fresh(),receipts=preview(paid);advanceInjuryRecovery(paid.league);recordPracticeWeekPay(paid.league,{year:2026,week:2});commit(paid,receipts);
 applyCapRollover(paid.league,{completedYear:2026});paid.league.financialYear=2027;paid.league.year=2027;
 const once=JSON.stringify(paid.league);assert.equal(commit(paid,receipts).applied,0);assert.equal(JSON.stringify(paid.league),once);
});
