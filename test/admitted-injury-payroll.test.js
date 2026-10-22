import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury,advanceInjuryRecovery} from '../src/engine/injurySystem.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {recordAdmittedInjuryPeriodPay,validateSnapshotAdmittedInjuryPayroll,retainedAdmittedInjuryCap,prepareAdmittedInjuryCapCharges,ADMITTED_PAYROLL_VERSION} from '../src/domain/admittedInjuryPayroll.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';
import {openNextFinancialYear} from '../src/data/nflSalaryCap.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
applyInjury(player,{type:'Qualifying injury',weeksRemaining:20},{gameId:game.gameId});
const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
advancePreRolloverMedicalCalendar(league,{completedYear:2026,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
applyCapRollover(league,{completedYear:2026});openNextFinancialYear(league,2026);
// Use the production expiry representation; null is not a runtime contract.
player.practiceContractHistory=[structuredClone(player.contract)];
player.teamId='FA';player.rosterSlot='active';player.contract={salary:0,yearsRemaining:0,capHit:0,baseSalary:0,signingBonus:0,guaranteed:0,deadCapRemaining:0,restructureCount:0};
session.phase='offseason';session.currentWeek=19;
const saved=session.toSnapshot(),id=player.id;
function fresh(){const s=createSessionFromSnapshot(saved);return {session:s,league:s.league,player:s.league.players.find(p=>p.id===id)};}
const pay=(l,overrides={})=>recordAdmittedInjuryPeriodPay(l,{earningYear:2027,phase:'offseason',week:1,...overrides});

test('legacy snapshots without admitted wages need no financial clock and orphan charges still fail',()=>{
 const legacy={teams:[{id:'BUF'}],players:[]};
 assert.doesNotThrow(()=>validateSnapshotAdmittedInjuryPayroll({league:legacy}));
 assert.doesNotThrow(()=>validateSnapshotAdmittedInjuryPayroll({league:{...legacy,admittedInjuryPayroll:[]}}));
 assert.throws(()=>validateSnapshotAdmittedInjuryPayroll({league:{...legacy,admittedInjuryPayroll:{}}}),/payroll/);
 const charge={version:ADMITTED_PAYROLL_VERSION,payId:'orphan',year:2027,amountCents:100};
 assert.throws(()=>validateSnapshotAdmittedInjuryPayroll({league:{...legacy,capLedger:{BUF:{admittedInjuryCharges:[charge]}}}}),/unmatched cap attribution/);
 assert.throws(()=>validateSnapshotAdmittedInjuryPayroll({league:{...legacy,capLedger:{BUF:{admittedInjuryCharges:{}}}}}),/cap charges/);
 const actual=fresh();pay(actual.league);actual.league.financialYear=NaN;
 assert.throws(()=>validateSnapshotAdmittedInjuryPayroll(actual.league),/financial year/,'actual wages still require their financial authority');
});

test('whole-payer cap arithmetic preflight refuses aggregate overflow without changing either payer',()=>{
 // Bounded arithmetic boundary, not a fabricated high-rate admitted source or
 // a claim that ordinary franchise populations reach this limit.
 const charge=(payId,amountCents)=>({version:ADMITTED_PAYROLL_VERSION,payId,year:2027,amountCents});
 const ledger={BUF:{admittedInjuryCharges:[charge('old-buf',100)]},MIA:{admittedInjuryCharges:[charge('old-mia',Number.MAX_SAFE_INTEGER-1)]}};
 const rows=[{teamId:'BUF',payId:'new-buf',earningYear:2027,amountCents:1},{teamId:'MIA',payId:'new-mia',earningYear:2027,amountCents:1}];
 const before=structuredClone({ledger,rows});
 const proposed=prepareAdmittedInjuryCapCharges(ledger,rows);
 assert.equal(retainedAdmittedInjuryCap({admittedInjuryCharges:proposed.get('MIA')}),Number.MAX_SAFE_INTEGER/100);
 assert.deepEqual({ledger,rows},before);
 rows[1].amountCents=2;const invalid=structuredClone({ledger,rows});
 assert.throws(()=>prepareAdmittedInjuryCapCharges(ledger,rows),/cap sum/);
 assert.deepEqual({ledger,rows},invalid,'a later payer failure cannot commit the earlier payer');
 assert.throws(()=>prepareAdmittedInjuryCapCharges(ledger,[rows[0],rows[0]]),/cap charge/,'duplicate proposed charges refuse');
});

test('post-source wages retain original payer/rate and charge the open earning year in the actual cap summary',()=>{
 const f=fresh(),before=f.session.getTeamCapSummary('BUF'),rng=structuredClone(f.session.toSnapshot().rngStreams),service=structuredClone([f.player.serviceHistory,f.player.pensionService]);
 f.player.experience=12;
 const row=pay(f.league)[0],right=f.league.admittedInjuryContinuations[0];
 assert.equal(row.injuryYear,2026);assert.equal(row.earningYear,2027);assert.equal(row.teamId,'BUF');assert.equal(row.amountCents,right.weeklyRateCents);
 assert.equal(f.player.contract.yearsRemaining,0);assert.equal(f.player.contract.salary,0);assert.equal(f.player.teamId,'FA');assert.equal(f.league.injurySalaryClaims,undefined);
 assert.equal(Math.round((before.capSpace-f.session.getTeamCapSummary('BUF').capSpace)*100),row.amountCents);
 assert.deepEqual([f.player.serviceHistory,f.player.pensionService],service);assert.deepEqual(f.session.toSnapshot().rngStreams,rng);
 validateSnapshotAdmittedInjuryPayroll(f.league);
 row.amountCents=0;assert.equal(f.league.admittedInjuryPayroll[0].amountCents,right.weeklyRateCents);
});
test('phase-qualified periods do not confuse offseason week1 with regular week1, and exact retries are inert',()=>{
 const f=fresh(),rate=f.league.admittedInjuryContinuations[0].weeklyRateCents;
 pay(f.league);f.league.year=2027;pay(f.league,{phase:'regular-season'});
 pay(f.league,{phase:'postseason',week:19});
 assert.equal(f.league.admittedInjuryPayroll.length,3);assert.equal(retainedAdmittedInjuryCap(f.league.capLedger.BUF),3*rate/100);
 const before=JSON.stringify(f.league);assert.deepEqual(pay(f.league),[]);assert.equal(JSON.stringify(f.league),before);
});
test('closed, pre-source and invalid periods refuse atomically',()=>{
 for(const overrides of [{earningYear:2026},{earningYear:2028},{week:26},{phase:'postseason',week:1},{phase:'regular-season',week:19},{phase:'regular-season',week:1}]){
  const f=fresh(),before=JSON.stringify(f.league);assert.throws(()=>pay(f.league,overrides));assert.equal(JSON.stringify(f.league),before);
 }
 const f=fresh();f.league.capLedger.BUF.rolloverAppliedThroughYear=2027;const before=JSON.stringify(f.league);
 assert.throws(()=>pay(f.league));assert.equal(JSON.stringify(f.league),before);
});
test('retired injured people retain wages independently of roster membership; recovery stops new earnings',()=>{
 const f=fresh();f.league.players=f.league.players.filter(p=>p.id!==id);f.player.status='retired';f.league.retiredPlayers.push(f.player);
 assert.equal(pay(f.league).length,1);
 f.player.injury.weeksRemaining=1;
 advanceInjuryRecovery({...f.league,players:[...f.league.players,...f.league.retiredPlayers]},{getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 assert.equal(f.player.injury,null);assert.equal(pay(f.league,{week:2}).length,0);
 const before=JSON.stringify(f.league);assert.deepEqual(pay(f.league),[]);assert.equal(JSON.stringify(f.league),before);
});
test('later rollover clears current attribution while retaining historical wages and original rate',()=>{
 const f=fresh(),rate=pay(f.league)[0].amountCents;f.league.year=2027;
 applyCapRollover(f.league,{completedYear:2027});openNextFinancialYear(f.league,2027);
 assert.deepEqual(f.league.capLedger.BUF.admittedInjuryCharges,[]);
 assert.deepEqual(pay(f.league),[],'old earned retry remains inert');
 assert.throws(()=>pay(f.league,{week:2}),'late new old-year earning refuses');
 assert.equal(pay(f.league,{earningYear:2028}).at(0).amountCents,rate);
 assert.equal(retainedAdmittedInjuryCap(f.league.capLedger.BUF),rate/100);
 assert.equal(f.league.admittedInjuryPayroll.length,2);validateSnapshotAdmittedInjuryPayroll(f.league);
});
test('source, amount, period, duplicate, missing and stray cap tampering are rejected before import',()=>{
 const f=fresh();pay(f.league);const base=f.session.toSnapshot();
 for(const mutate of [s=>{s.league.admittedInjuryPayroll=null;},s=>{s.league.admittedInjuryPayroll[0].amountCents++;},
  s=>{s.league.admittedInjuryPayroll[0].teamId='MIA';},s=>{s.league.admittedInjuryPayroll[0].injuryYear++;},
  s=>{s.league.admittedInjuryPayroll[0].earningYear=2025;},s=>{s.league.admittedInjuryPayroll[0].phase='arbitrary';},
  s=>{s.league.admittedInjuryPayroll.push(structuredClone(s.league.admittedInjuryPayroll[0]));},
  s=>{s.league.capLedger.BUF.admittedInjuryCharges=[];},s=>{s.league.capLedger.MIA.admittedInjuryCharges=structuredClone(s.league.capLedger.BUF.admittedInjuryCharges);},
  s=>{s.league.admittedInjuryPayroll[0].extra=1;}]){
  const invalid=structuredClone(base);mutate(invalid);const before=structuredClone(invalid);
  assert.equal(inspectSnapshotCompatibility(invalid).reasonCode,'ADMITTED_INJURY_PAYROLL_INVALID');
  assert.throws(()=>createSessionFromSnapshot(invalid));assert.deepEqual(invalid,before);
 }
});
test('compressed actual session restore preserves earning wages and cap attribution without a claim',async()=>{
 const f=fresh();pay(f.league);const before=f.session.toSnapshot();
 const after=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(before)));
 assert.deepEqual(after.league.admittedInjuryPayroll,f.league.admittedInjuryPayroll);
 assert.deepEqual(after.getTeamCapSummary('BUF'),f.session.getTeamCapSummary('BUF'));
 assert.equal(after.league.injurySalaryClaims,undefined);
 const original=JSON.stringify(after.league);assert.deepEqual(pay(after.league),[]);assert.equal(JSON.stringify(after.league),original);
});
