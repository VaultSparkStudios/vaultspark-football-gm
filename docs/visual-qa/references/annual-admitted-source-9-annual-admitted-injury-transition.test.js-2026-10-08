import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {fixture} from './helpers/annualAdmittedFixture.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {assertAnnualElevationInjuryContractTransition} from '../src/domain/elevationInjuryPay.js';
import {executeAdvanceWeekCommand} from '../src/runtime/advanceWeekCommand.js';
import {expireContracts,applyAgingProgressionAndRetirements,runOffseason} from '../src/engine/offseasonSimulator.js';
import {fileElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {validateSnapshotAdmittedInjuryPayroll} from '../src/domain/admittedInjuryPayroll.js';

const people=l=>[...l.players,...l.retiredPlayers];
const pensionGames=p=>Object.values(p.pensionService?.planYears||{}).flatMap(row=>row.games||[]);

test('public annual readiness stays read-only and the actual command admits ongoing rights without a grievance',()=>{
 const{s,l,p}=fixture(),before=JSON.stringify(s.toSnapshot()),identity=structuredClone(p.profile),games=structuredClone(pensionGames(p));
 assert.equal(s.getAdvanceReadiness().ok,true);assert.equal(s.getAdvanceReadiness().ok,true);
 assert.equal(JSON.stringify(s.toSnapshot()),before);
 assert.equal(executeAdvanceWeekCommand(s,{count:1}).ok,true);
 const current=people(l).find(row=>row.id===p.id);
 assert.equal(l.financialYear,2027);assert.equal(l.offseasonMedicalCalendar[0].throughWeek,0);
 assert.equal(l.admittedInjuryContinuations.length,1);assert.equal(l.injurySalaryClaims,undefined);assert.equal(l.annualElevationInjuryResolutions,undefined);
 assert.deepEqual(current.elevationInjuryPay.payroll.map(row=>row.week),[24,25,26,27]);
 assert.equal(current.injury.weeksRemaining,12);assert.equal(current.elevationInjuryPay.episodes[0].status,'active');
 assert.deepEqual(current.profile,identity);assert.deepEqual(pensionGames(current),games);
 assert.doesNotThrow(()=>assertAnnualElevationInjuryContractTransition(l));
 const once=JSON.stringify(s.toSnapshot());assert.equal(s.runRosterYearRollover().alreadyRun,true);assert.equal(JSON.stringify(s.toSnapshot()),once);
});

test('partial legacy cap boundary refuses live annual paths and readiness without payroll or recovery mutation',()=>{
 for(const paidCalendar of[false,true])for(const mode of['interactive','headless','public']){
  const{s,l}=fixture(paidCalendar?16:2);
  if(paidCalendar)advancePreRolloverMedicalCalendar(l,{completedYear:2026,preserveAdmittedRights:true});
  l.capLedger.MIA.rolloverAppliedThroughYear=2026;
  const before=JSON.stringify(s.toSnapshot());
  assert.equal(s.getAdvanceReadiness().ok,false);assert.equal(s.getAdvanceReadiness().reasonCode,'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.equal(JSON.stringify(s.toSnapshot()),before);
  if(mode==='public')assert.equal(executeAdvanceWeekCommand(s,{count:1}).ok,false);
  else assert.throws(()=>mode==='interactive'?s.runRosterYearRollover():runOffseason({league:l,year:2026,rng:s.rng,skipDraft:true}),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.equal(JSON.stringify(s.toSnapshot()),before,`${mode}: paidCalendar=${paidCalendar}`);
 }
});

test('restored retired admitted sources also require every elapsed wage before annual transition',()=>{
 const{s,l,p}=fixture();advancePreRolloverMedicalCalendar(l,{completedYear:2026,preserveAdmittedRights:true});
 l.players=l.players.filter(row=>row.id!==p.id);p.status='retired';p.teamId='FA';l.retiredPlayers.push(p);
 p.elevationInjuryPay.payroll=p.elevationInjuryPay.payroll.filter(row=>row.week!==26);
 l.capLedger.BUF.elevationInjuryCharges=l.capLedger.BUF.elevationInjuryCharges.filter(row=>row.playerId!==p.id||row.week!==26);
 const restored=createSessionFromSnapshot(s.toSnapshot()),before=JSON.stringify(restored.toSnapshot());
 assert.throws(()=>assertAnnualElevationInjuryContractTransition(restored.league),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.equal(restored.getAdvanceReadiness().ok,false);
 assert.throws(()=>restored.runRosterYearRollover(),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.equal(JSON.stringify(restored.toSnapshot()),before);
});

test('headless default pays pre-boundary and summer incapacity, then stops at clinical clearance',()=>{
 const{s,l,p}=fixture();runOffseason({league:l,year:2026,rng:s.rng,skipDraft:true});
 const current=people(l).find(row=>row.id===p.id),right=l.admittedInjuryContinuations[0],pay=l.admittedInjuryPayroll.filter(row=>row.rightId===right.rightId);
 assert.equal(current.injury,null);assert.equal(current.elevationInjuryPay.episodes[0].status,'recovered');
 assert.equal(l.injurySalaryClaims,undefined);assert.equal(l.annualElevationInjuryResolutions,undefined);
 assert.deepEqual(current.elevationInjuryPay.payroll.map(row=>row.week),[24,25,26,27]);
 assert.deepEqual(pay.map(row=>row.week),Array.from({length:12},(_,i)=>i+1));
 assert.ok(pay.every(row=>row.teamId==='BUF'&&row.earningYear===2027&&row.phase==='offseason'&&row.amountCents===right.weeklyRateCents));
 assert.equal(l.offseasonMedicalCalendar[0].throughWeek,25);validateSnapshotAdmittedInjuryPayroll(l);
 assert.doesNotThrow(()=>createSessionFromSnapshot(s.toSnapshot()));
});

test('missing earned source-year interval refuses expiry, aging and annual commands before mutation',()=>{
 const{s,l,p}=fixture();advancePreRolloverMedicalCalendar(l,{completedYear:2026,preserveAdmittedRights:true});
 p.elevationInjuryPay.payroll=p.elevationInjuryPay.payroll.filter(row=>row.week!==26);
 l.capLedger.BUF.elevationInjuryCharges=l.capLedger.BUF.elevationInjuryCharges.filter(row=>row.playerId!==p.id||row.week!==26);
 const before=JSON.stringify(s.toSnapshot());
 for(const run of[()=>expireContracts(l),()=>applyAgingProgressionAndRetirements(l,2026,s.rng),()=>s.runRosterYearRollover()]){
  assert.throws(run,e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');assert.equal(JSON.stringify(s.toSnapshot()),before);
 }
 assert.equal(s.getAdvanceReadiness().reasonCode,'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.equal(executeAdvanceWeekCommand(s,{count:1}).ok,false);assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('a retained right alone cannot bypass the annual calendar or fabricate rollover authority',()=>{
 for(const mutate of[l=>delete l.offseasonMedicalCalendar,l=>{l.capLedger.MIA.rolloverAppliedThroughYear=2025;}]){
  const{s,l}=fixture();s.runRosterYearRollover();mutate(l);const before=JSON.stringify(s.toSnapshot());
  assert.throws(()=>expireContracts(l),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.throws(()=>s.runRosterYearRollover(),e=>e.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.equal(JSON.stringify(s.toSnapshot()),before);
 }
});

test('an explicit original dispute keeps its claim amount and authority instead of becoming an admission',()=>{
 const{s,l,p,game}=fixture();const claimedCents=10000001;
 fileElevationInjurySalaryClaim(l,{playerId:p.id,gameId:game.gameId,claimedCents});
 assert.equal(executeAdvanceWeekCommand(s,{count:1}).ok,true);
 assert.equal(l.admittedInjuryContinuations,undefined);assert.equal(l.injurySalaryClaims.length,1);
 assert.equal(l.injurySalaryClaims[0].claimedCents,claimedCents);assert.equal(l.injurySalaryClaims[0].status,'filed');
 assert.equal(l.annualElevationInjuryResolutions[0].estimate.kind,'existing-disputed-claim');
 assert.equal(p.elevationInjuryPay.episodes[0].status,'claim-pending');
 assert.doesNotThrow(()=>createSessionFromSnapshot(s.toSnapshot()));
});

test('filing a conflicting grievance cannot corrupt an already admitted source',()=>{
 const{s,l,p,game}=fixture();s.runRosterYearRollover();const before=JSON.stringify(s.toSnapshot());
 assert.throws(()=>fileElevationInjurySalaryClaim(l,{playerId:p.id,gameId:game.gameId,claimedCents:10000001}),e=>e.reasonCode==='INJURY_SALARY_CLAIM_INVALID');
 assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('completed admission, earned wages and summer anchor survive compressed restore and inert annual retry',async()=>{
 const{s,l,p}=fixture();s.runRosterYearRollover();const saved=s.toSnapshot();
 const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(saved)));
 assert.deepEqual(restored.league.admittedInjuryContinuations,l.admittedInjuryContinuations);
 assert.deepEqual(restored.league.players.find(row=>row.id===p.id).elevationInjuryPay,saved.league.players.find(row=>row.id===p.id).elevationInjuryPay);
 assert.deepEqual(restored.league.offseasonMedicalCalendar,l.offseasonMedicalCalendar);
 const once=JSON.stringify(restored.toSnapshot());assert.equal(restored.runRosterYearRollover().alreadyRun,true);assert.equal(JSON.stringify(restored.toSnapshot()),once);
});
