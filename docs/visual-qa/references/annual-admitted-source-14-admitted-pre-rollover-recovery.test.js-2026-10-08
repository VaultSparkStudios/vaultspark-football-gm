import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admittedPreRolloverFixture.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {assertElevationInjuryContractTransition} from '../src/domain/elevationInjuryPay.js';
import {ADMITTED_PAYROLL_VERSION,LEGACY_ADMITTED_PAYROLL_VERSION,validateSnapshotAdmittedInjuryPayroll,recordAdmittedInjuryPeriodPay} from '../src/domain/admittedInjuryPayroll.js';
import {createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {executeAdvanceWeekCommand} from '../src/runtime/advanceWeekCommand.js';
import {runOffseason} from '../src/engine/offseasonSimulator.js';
const advance=l=>advancePreRolloverMedicalCalendar(l,{completedYear:2027,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
const annualRows=l=>l.admittedInjuryPayroll.filter(row=>row.phase==='pre-rollover');

for(const weeks of [1,3,4])test(`retired admitted source earns ${weeks} later-year annual intervals before clearance without new employment or dispute`,()=>{
 const {s,l,p}=fixture({retired:true,weeks}),service=structuredClone([p.serviceHistory,p.pensionService]),rng=structuredClone(s.toSnapshot().rngStreams);
 assert.equal(p.injury.weeksRemaining,weeks);assert.equal(advance(l).weeksAdvanced,4);assert.equal(p.injury,null);
 assert.deepEqual(annualRows(l).map(row=>row.week),Array.from({length:weeks},(_,i)=>24+i));
 assert.ok(annualRows(l).every(row=>row.version===ADMITTED_PAYROLL_VERSION&&row.teamId==='BUF'&&row.injuryYear===2026&&row.earningYear===2027&&row.amountCents===l.admittedInjuryContinuations[0].weeklyRateCents));
 assert.equal(l.injurySalaryClaims,undefined);assert.equal(p.teamId,'FA');assert.equal(p.contract.salary,0);
 assert.deepEqual([p.serviceHistory,p.pensionService],service);assert.deepEqual(s.toSnapshot().rngStreams,rng);
 validateSnapshotAdmittedInjuryPayroll(l);const before=JSON.stringify(s.toSnapshot());assert.equal(advance(l).alreadyRun,true);assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('active long source completes medical intervals in explicit admitted mode while default annual contract transition still refuses',()=>{
 const {s,l,p}=fixture({weeks:8});advance(l);assert.equal(p.injury.weeksRemaining,4);assert.equal(annualRows(l).length,4);
 assert.throws(()=>assertElevationInjuryContractTransition(l),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.doesNotThrow(()=>assertElevationInjuryContractTransition(l,{allowAdmittedEarningCalendar:true}));
 const before=JSON.stringify(s.toSnapshot());assert.equal(advance(l).alreadyRun,true);assert.equal(JSON.stringify(s.toSnapshot()),before);
 const incomplete=structuredClone(l);const pay=incomplete.admittedInjuryPayroll.find(row=>row.phase==='pre-rollover'&&row.week===27);
 incomplete.admittedInjuryPayroll=incomplete.admittedInjuryPayroll.filter(row=>row!==pay);
 incomplete.capLedger.BUF.admittedInjuryCharges=incomplete.capLedger.BUF.admittedInjuryCharges.filter(row=>row.payId!==pay.payId);
 assert.throws(()=>assertElevationInjuryContractTransition(incomplete,{allowAdmittedEarningCalendar:true}),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
});

test('actual interactive/headless annual paths preserve old admissions without electing new disputes',()=>{
 for(const mode of ['interactive','headless']){
  const {s,l,p}=fixture({weeks:8}),rights=structuredClone(l.admittedInjuryContinuations),oldPay=structuredClone(l.admittedInjuryPayroll);
  if(mode==='interactive'){
   const result=executeAdvanceWeekCommand(s,{count:1});assert.equal(result.ok,true);
  }else assert.doesNotThrow(()=>runOffseason({league:l,year:2027,rng:s.rng,skipDraft:true}));
  assert.deepEqual(l.admittedInjuryContinuations,rights);assert.deepEqual(l.admittedInjuryPayroll.slice(0,oldPay.length),oldPay);
  assert.deepEqual(annualRows(l).map(row=>row.week),[24,25,26,27]);assert.equal(l.financialYear,2028);assert.equal(l.injurySalaryClaims,undefined);
  assert.equal(p.elevationInjuryPay.episodes[0].status,mode==='interactive'?'active':'recovered');
 }
});

test('legacy v1 wages/cap stay byte-for-byte intact while fresh v2 annual wages survive compressed restoration',async()=>{
 const {s,l}=fixture({retired:true,weeks:3});
 for(const row of l.admittedInjuryPayroll)row.version=LEGACY_ADMITTED_PAYROLL_VERSION;
 for(const row of l.capLedger.BUF.admittedInjuryCharges)row.version=LEGACY_ADMITTED_PAYROLL_VERSION;
 const legacy=structuredClone(l.admittedInjuryPayroll);validateSnapshotAdmittedInjuryPayroll(l);advance(l);
 assert.deepEqual(l.admittedInjuryPayroll.slice(0,legacy.length),legacy);
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(s.toSnapshot())));
 assert.deepEqual(restored.league.admittedInjuryPayroll,l.admittedInjuryPayroll);assert.deepEqual(restored.league.capLedger.BUF.admittedInjuryCharges,l.capLedger.BUF.admittedInjuryCharges);
 const bad=restored.toSnapshot();bad.league.capLedger.BUF.admittedInjuryCharges.at(-1).version=LEGACY_ADMITTED_PAYROLL_VERSION;
 assert.equal(inspectSnapshotCompatibility(bad).reasonCode,'ADMITTED_INJURY_PAYROLL_INVALID');
});

test('late clinical failure commits neither older wages nor active/retired medical changes',()=>{
 const {s,l,p}=fixture({retired:true,weeks:3}),before=JSON.stringify(s.toSnapshot());let calls=0;
 assert.throws(()=>advancePreRolloverMedicalCalendar(l,{completedYear:2027,preserveAdmittedRights:true,getTeamModifiers:(_id,player)=>{
  if(player.id===p.id&&++calls===2)throw new Error('late clinical failure');return {extraRecoveryWeeks:0};
 }}),/late clinical failure/);assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('annual wages require completed calendar authority and legacy v1 cannot claim the new phase',()=>{
 const {s,l}=fixture({retired:true,weeks:3}),before=JSON.stringify(s.toSnapshot());
 assert.throws(()=>recordAdmittedInjuryPeriodPay(l,{earningYear:2027,phase:'pre-rollover',week:24}),e=>e.reasonCode==='ADMITTED_INJURY_PAYROLL_INVALID');assert.equal(JSON.stringify(s.toSnapshot()),before);
 advance(l);const saved=s.toSnapshot();
 for(const mutate of [x=>{x.league.preRolloverMedicalCalendar=x.league.preRolloverMedicalCalendar.filter(row=>row.year!==2027);},x=>{x.league.admittedInjuryPayroll.at(-1).version=LEGACY_ADMITTED_PAYROLL_VERSION;x.league.capLedger.BUF.admittedInjuryCharges.at(-1).version=LEGACY_ADMITTED_PAYROLL_VERSION;},x=>{x.league.admittedInjuryPayroll.at(-1).week=28;}]){
  const bad=structuredClone(saved);mutate(bad);const unchanged=JSON.stringify(bad);assert.equal(inspectSnapshotCompatibility(bad).ok,false);assert.throws(()=>createSessionFromSnapshot(bad));assert.equal(JSON.stringify(bad),unchanged);
 }
});
