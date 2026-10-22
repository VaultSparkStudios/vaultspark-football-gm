import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admittedPostseasonFixture.js';
import {simulateNextPostseasonGame,nextPostseasonGame} from '../src/engine/seasonSimulator.js';
import {advanceAdmittedPostseasonRecovery,validateAdmittedPostseasonClock} from '../src/domain/admittedPostseasonRecovery.js';
import {previewPostseasonGameRecovery,finishPostseasonRecovery} from '../src/domain/postseasonMedicalClock.js';
import {validateSnapshotAdmittedInjuryPayroll} from '../src/domain/admittedInjuryPayroll.js';
import {createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {executeAdvanceWeekCommand} from '../src/runtime/advanceWeekCommand.js';
const play=s=>simulateNextPostseasonGame({state:s.postseasonState,league:s.league,statBook:s.statBook,year:2027,rng:s.rng,getTeamModifiers:()=>({extraRecoveryWeeks:0})});

test('actual playoff rounds pay and heal an active free agent once despite eliminated payer and repeated games',()=>{
 const {s,l,p}=fixture(),state=s.postseasonState,service=structuredClone([p.serviceHistory,p.pensionService]);
 assert.ok(!Object.values(state.seeds).flat().some(row=>row.teamId==='BUF'));
 const before=JSON.stringify(s.toSnapshot()),preview=previewPostseasonGameRecovery({state,league:l,next:nextPostseasonGame(state,l),year:2027,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 assert.equal(JSON.stringify(s.toSnapshot()),before);assert.equal(preview.players.find(row=>row.id===p.id).injury.weeksRemaining,2);
 play(s);assert.equal(p.injury.weeksRemaining,2);assert.equal(l.admittedInjuryPayroll.length,1);
 for(let i=0;i<5;i++)play(s);
 assert.equal(p.injury.weeksRemaining,2);assert.equal(l.admittedInjuryPayroll.length,1);
 play(s);assert.equal(p.injury.weeksRemaining,1);assert.equal(l.admittedInjuryPayroll.length,2);
 for(let i=0;i<6;i++)play(s);
 assert.equal(state.status,'completed');assert.equal(state.admittedMedicalClock.throughWeek,23);
 assert.equal(p.injury,null);assert.deepEqual(l.admittedInjuryPayroll.map(row=>row.week),[19,20,21]);
 assert.ok(l.admittedInjuryPayroll.every(row=>row.teamId==='BUF'&&row.earningYear===2027&&row.injuryYear===2026&&row.amountCents===l.admittedInjuryContinuations[0].weeklyRateCents));
 assert.deepEqual([p.serviceHistory,p.pensionService],service);assert.equal(p.teamId,'FA');assert.equal(p.contract.salary,0);assert.equal(l.injurySalaryClaims,undefined);
 validateAdmittedPostseasonClock(state,{league:l});validateSnapshotAdmittedInjuryPayroll(l);
 const complete=JSON.stringify(s.toSnapshot());assert.equal(finishPostseasonRecovery({state,league:l,year:2027}).alreadyApplied,true);assert.equal(JSON.stringify(s.toSnapshot()),complete);
});

test('retired source earns both final-gap intervals before clearance; late clinical failure is atomic',()=>{
 const {s,l,p}=fixture({retired:true,weeks:20});for(let i=0;i<12;i++)play(s);
 p.injury.weeksRemaining=2;const before=JSON.stringify(s.toSnapshot());let calls=0;
 assert.throws(()=>advanceAdmittedPostseasonRecovery({state:s.postseasonState,league:l,year:2027,throughWeek:23,getTeamModifiers:(_id,player)=>{
  if(player.id===p.id&&++calls===2)throw new Error('late clinical failure');return {extraRecoveryWeeks:0};
 }}),/late clinical failure/);assert.equal(JSON.stringify(s.toSnapshot()),before);
 play(s);assert.equal(p.injury,null);assert.deepEqual(l.admittedInjuryPayroll.map(row=>row.week),[19,20,21,22,23]);
 assert.equal(p.elevationInjuryPay.episodes[0].status,'recovered');validateAdmittedPostseasonClock(s.postseasonState,{league:l});
});

test('legacy mid-round resume derives elapsed play without replaying wages or healing; compressed restore matches',async()=>{
 const {s,l,p}=fixture({retired:true,weeks:10});play(s);delete s.postseasonState.admittedMedicalClock;
 const remaining=p.injury.weeksRemaining;
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(s.toSnapshot())));
 for(let i=0;i<5;i++)play(restored);
 const person=restored.league.retiredPlayers.find(row=>row.id===p.id);
 assert.equal(person.injury.weeksRemaining,remaining);assert.deepEqual(restored.league.admittedInjuryPayroll,l.admittedInjuryPayroll);
 play(restored);assert.equal(person.injury.weeksRemaining,remaining-1);assert.deepEqual(restored.league.admittedInjuryPayroll.map(row=>row.week),[19,20]);
 const again=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(restored.toSnapshot())));
 assert.deepEqual(again.postseasonState.admittedMedicalClock,restored.postseasonState.admittedMedicalClock);
 assert.deepEqual(again.league.admittedInjuryPayroll,restored.league.admittedInjuryPayroll);
});

test('corrupt elapsed authority and payroll refuse imports and actual commands before dashboard/GM effects',()=>{
 const {s}=fixture({retired:true,weeks:10});play(s);const saved=s.toSnapshot();
 for(const mutate of [x=>{x.postseasonState.admittedMedicalClock=null;},x=>{x.postseasonState.admittedMedicalClock.throughWeek=23;},x=>{x.postseasonState.admittedMedicalClock.year=2026;},x=>{x.postseasonState.admittedMedicalClock.version='unknown';}]){
  const bad=structuredClone(saved);mutate(bad);const before=JSON.stringify(bad);
  assert.equal(inspectSnapshotCompatibility(bad).ok,false);assert.throws(()=>createSessionFromSnapshot(bad));assert.equal(JSON.stringify(bad),before);
 }
 s.postseasonState.admittedMedicalClock.throughWeek=23;const before=JSON.stringify(s.toSnapshot());s.getDashboardState=()=>{throw new Error('dashboard must not read');};
 const result=executeAdvanceWeekCommand(s,{count:1});assert.equal(result.ok,false);assert.equal(result.reasonCode,'ADMITTED_POSTSEASON_CLOCK_INVALID');assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('actual session command completes retired continuation and retains completed clock in latest projection',async()=>{
 const {s,l,p}=fixture({retired:true,weeks:5});const result=s.advanceWeek();assert.equal(result.ok,true);
 assert.equal(p.injury,null);assert.deepEqual(l.admittedInjuryPayroll.map(row=>row.week),[19,20,21,22,23]);
 assert.equal(s.latestPostseason.admittedMedicalClock.throughWeek,23);
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(s.toSnapshot())));
 assert.deepEqual(restored.latestPostseason.admittedMedicalClock,s.latestPostseason.admittedMedicalClock);
 assert.deepEqual(restored.league.admittedInjuryPayroll,l.admittedInjuryPayroll);
});

test('inherited or malformed archived rounds refuse before any clock, medical, wage or RNG mutation',()=>{
 for(const round of ['constructor','toString','__proto__','unknown',null]){
  const {s,l}=fixture({retired:true,weeks:3});s.postseasonState.gameArchiveEntries.push({round});
  const before=JSON.stringify(s.toSnapshot());
  assert.throws(()=>advanceAdmittedPostseasonRecovery({state:s.postseasonState,league:l,year:2027,throughWeek:19}),e=>e.reasonCode==='ADMITTED_POSTSEASON_CLOCK_INVALID');
  assert.equal(JSON.stringify(s.toSnapshot()),before);
 }
 for(const archive of [null,{},[null]]){
  const {s,l}=fixture({retired:true,weeks:3});s.postseasonState.gameArchiveEntries=archive;const before=JSON.stringify(s.toSnapshot());
  assert.throws(()=>advanceAdmittedPostseasonRecovery({state:s.postseasonState,league:l,year:2027,throughWeek:19}),e=>e.reasonCode==='ADMITTED_POSTSEASON_CLOCK_INVALID');
  assert.equal(JSON.stringify(s.toSnapshot()),before);
 }
});
