import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {applyCapRollover,runOffseason} from '../src/engine/offseasonSimulator.js';
import {openNextFinancialYear} from '../src/data/nflSalaryCap.js';
import {startOffseasonMedicalCalendar,advanceOffseasonMedicalCalendar,validateSnapshotOffseasonMedicalCalendar} from '../src/domain/offseasonMedicalCalendar.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {executeAdvanceWeekCommand} from '../src/runtime/advanceWeekCommand.js';
const finalFor=year=>({...canonicalFootballGame({year,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'}),homeScore:21,awayScore:14,winnerId:'BUF'});
function admitted(){
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league:l,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:l,result:{...game,winnerId:'BUF'}});applyInjury(p,{type:'Qualifying injury',weeksRemaining:9},{gameId:game.gameId});
 l.gameArchive.push(finalFor(2026));advancePreRolloverMedicalCalendar(l,{completedYear:2026,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 applyCapRollover(l,{completedYear:2026});openNextFinancialYear(l,2026);
 p.practiceContractHistory=[structuredClone(p.contract)];p.teamId='FA';p.rosterSlot='active';p.contract={salary:0,yearsRemaining:0,capHit:0,baseSalary:0,signingBonus:0,guaranteed:0,deadCapRemaining:0,restructureCount:0};
 s.phase='offseason';s.currentWeek=19;
 return {s,l,p};
}
const advance=(l,stage,options={})=>advanceOffseasonMedicalCalendar(l,{completedYear:2026,stage,getTeamModifiers:()=>({extraRecoveryWeeks:0}),...options});

test('elapsed offseason pays before the clearance interval and never creates employment, service or a dispute',()=>{
 const {s,l,p}=admitted(),service=structuredClone([p.serviceHistory,p.pensionService]),rng=s.toSnapshot().rngStreams;
 startOffseasonMedicalCalendar(l,{completedYear:2026});
 assert.equal(advance(l,'combine').weeksAdvanced,0);assert.equal(p.injury.weeksRemaining,5);
 const result=advance(l,'free-agency');assert.equal(result.weeksAdvanced,6);assert.equal(result.recovered,1);
 assert.equal(p.injury,null);assert.equal(l.admittedInjuryPayroll.length,5,'clearance week paid; subsequent healthy week unpaid');
 assert.deepEqual(l.admittedInjuryPayroll.map(row=>row.week),[1,2,3,4,5]);
 assert.ok(l.admittedInjuryPayroll.every(row=>row.teamId==='BUF'&&row.earningYear===2027&&row.injuryYear===2026));
 assert.equal(l.injurySalaryClaims,undefined);assert.equal(p.contract.salary,0);assert.equal(p.teamId,'FA');
 assert.deepEqual([p.serviceHistory,p.pensionService],service);assert.deepEqual(s.toSnapshot().rngStreams,rng);
 const before=JSON.stringify(l);assert.equal(advance(l,'free-agency').alreadyRun,true);assert.equal(JSON.stringify(l),before);
 validateSnapshotOffseasonMedicalCalendar(l);
});
test('retired sources recover and earn through the same elapsed periods',()=>{
 const {l,p}=admitted();p.injury.weeksRemaining=7;l.players=l.players.filter(row=>row.id!==p.id);p.status='retired';l.retiredPlayers.push(p);
 startOffseasonMedicalCalendar(l,{completedYear:2026});advance(l,'free-agency');assert.equal(p.injury.weeksRemaining,1);
 advance(l,'draft');assert.equal(p.injury,null);assert.equal(l.admittedInjuryPayroll.length,7);
 advance(l,'camp-cuts');assert.equal(l.admittedInjuryPayroll.length,7);assert.equal(l.offseasonMedicalCalendar[0].throughWeek,25);
});
test('late recovery failure leaves all wages, cap, medical and calendar state unchanged',()=>{
 const {l,p}=admitted();startOffseasonMedicalCalendar(l,{completedYear:2026});const before=JSON.stringify(l);let calls=0;
 assert.throws(()=>advance(l,'free-agency',{getTeamModifiers:(_id,player)=>{if(player.id===p.id&&++calls===2)throw new Error('late clinical refusal');return {extraRecoveryWeeks:0};}}),/late clinical refusal/);
 assert.equal(JSON.stringify(l),before);advance(l,'free-agency');assert.equal(l.admittedInjuryPayroll.length,5);
});
test('legacy resumes without an anchored calendar receive no retroactive healing or wages',()=>{
 const {l,p}=admitted(),before=JSON.stringify(l);
 assert.equal(advance(l,'camp-cuts').notApplicable,true);assert.equal(JSON.stringify(l),before);assert.equal(p.injury.weeksRemaining,5);
});
test('calendar tampering refuses actual imports and compressed restores retain elapsed authority',async()=>{
 const {s,l}=admitted();startOffseasonMedicalCalendar(l,{completedYear:2026});advance(l,'free-agency');const saved=s.toSnapshot();
 for(const mutate of [x=>{x.league.offseasonMedicalCalendar=null;},x=>{x.league.offseasonMedicalCalendar[0].version='unknown';},x=>{x.league.offseasonMedicalCalendar[0].throughWeek=0;},x=>{x.league.offseasonMedicalCalendar[0].sourceYear=2025;},x=>{x.league.offseasonMedicalCalendar.push(structuredClone(x.league.offseasonMedicalCalendar[0]));},x=>{x.league.offseasonMedicalCalendar[0].earningYear=2028;}]){
  const bad=structuredClone(saved);mutate(bad);const before=structuredClone(bad);
  assert.equal(inspectSnapshotCompatibility(bad).ok,false);assert.throws(()=>createSessionFromSnapshot(bad));assert.deepEqual(bad,before);
 }
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(saved)));
 assert.deepEqual(restored.league.offseasonMedicalCalendar,l.offseasonMedicalCalendar);assert.deepEqual(restored.league.admittedInjuryPayroll,l.admittedInjuryPayroll);
 assert.equal(advance(restored.league,'free-agency').alreadyRun,true);
});
test('actual interactive stages anchor the new rollover, pause without healing, then complete all elapsed weeks',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(row=>row.teamId==='BUF'&&row.rosterSlot==='active'&&row.age<25);applyInjury(p,{type:'Ordinary long injury',weeksRemaining:50});
 l.gameArchive.push(finalFor(2026));s.phase='offseason';s.currentWeek=19;
 s.advanceOffseasonPipeline();assert.equal(l.offseasonMedicalCalendar[0].throughWeek,0);const afterRollover=p.injury.weeksRemaining;
 for(let i=0;i<3;i++)s.advanceOffseasonPipeline();assert.equal(l.offseasonPipeline.stage,'free-agency');
 const first=s.advanceOffseasonPipeline();
 if(first.userActionRequired){assert.equal(l.offseasonMedicalCalendar[0].throughWeek,0);assert.equal(p.injury.weeksRemaining,afterRollover);}
 for(let i=0;i<8&&l.offseasonPipeline.stage==='free-agency';i++)s.advanceOffseasonPipeline();
 assert.equal(l.offseasonPipeline.stage,'draft');assert.equal(l.offseasonMedicalCalendar[0].throughWeek,6);
 const held=s.advanceOffseasonPipeline();if(held.userActionRequired){assert.equal(l.offseasonMedicalCalendar[0].throughWeek,6);s.runCpuDraft({untilUserPick:false});}
 for(let i=0;i<5&&!l.offseasonPipeline.completed;i++){const result=s.advanceOffseasonPipeline();assert.equal(result.userActionRequired,undefined);}
 assert.equal(l.offseasonPipeline.completed,true);assert.equal(l.offseasonMedicalCalendar[0].throughWeek,25);
 const remaining=p.injury.weeksRemaining;const closed=s.advanceOffseasonPipeline();assert.equal(closed.completed,true);assert.equal(p.injury.weeksRemaining,remaining);
 validateSnapshotOffseasonMedicalCalendar(l);
});
test('actual headless offseason advances the same 25 intervals after a newly applied boundary',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:null}),l=s.league;
 const p=l.players.find(row=>row.teamId==='BUF'&&row.rosterSlot==='active'&&row.age<25);applyInjury(p,{type:'Ordinary long injury',weeksRemaining:50});l.gameArchive.push(finalFor(2026));
 runOffseason({league:l,year:2026,rng:s.rng,skipDraft:true});assert.equal(l.offseasonMedicalCalendar[0].throughWeek,25);assert.ok(p.injury.weeksRemaining<=21);
 const restored=createSessionFromSnapshot(s.toSnapshot());assert.deepEqual(restored.league.offseasonMedicalCalendar,l.offseasonMedicalCalendar);
});
test('actual command readiness rejects bad interval authority before dashboard/GM effects',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});s.league.gameArchive.push(finalFor(2026));s.phase='offseason';s.currentWeek=19;
 s.advanceOffseasonPipeline();s.league.offseasonMedicalCalendar[0].throughWeek=5;
 const before=JSON.stringify(s.toSnapshot());s.getDashboardState=()=>{throw new Error('dashboard must not read');};
 const result=executeAdvanceWeekCommand(s,{count:1});assert.equal(result.ok,false);assert.equal(result.reasonCode,'OFFSEASON_MEDICAL_CALENDAR_INVALID');
 assert.equal(JSON.stringify(s.toSnapshot()),before);
});
test('headless malformed calendar refuses before any roster, medical, market or RNG mutation',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});s.league.gameArchive.push(finalFor(2026));s.phase='offseason';s.currentWeek=19;s.advanceOffseasonPipeline();
 s.league.offseasonMedicalCalendar[0].throughWeek=5;const before=JSON.stringify(s.toSnapshot());
 assert.throws(()=>runOffseason({league:s.league,year:2026,rng:s.rng,skipDraft:true}),e=>e.reasonCode==='OFFSEASON_MEDICAL_CALENDAR_INVALID');
 assert.equal(JSON.stringify(s.toSnapshot()),before);
});
test('partially preclosed legacy club ledgers cannot start historical summer recovery in either annual path',()=>{
 for(const mode of ['interactive','headless']){
  const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
  const p=l.players.find(row=>row.teamId==='BUF'&&row.rosterSlot==='active'&&row.age<25);applyInjury(p,{type:'Legacy remaining injury',weeksRemaining:20});l.gameArchive.push(finalFor(2026));
  advancePreRolloverMedicalCalendar(l,{completedYear:2026,preservePostTermClaims:true});
  l.capLedger.BUF.rolloverAppliedThroughYear=2026;const remaining=p.injury.weeksRemaining;
  s.phase='offseason';s.currentWeek=19;
  if(mode==='interactive')s.runRosterYearRollover();else runOffseason({league:l,year:2026,rng:s.rng,skipDraft:true});
  assert.equal(l.offseasonMedicalCalendar,undefined);assert.equal(p.injury.weeksRemaining,remaining,mode);
 }
});
