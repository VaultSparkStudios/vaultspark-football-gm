import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {advancePreRolloverMedicalCalendar} from '../src/domain/preRolloverMedicalCalendar.js';
import {recordElevationInjuryWeekPay,validateSnapshotElevationInjuryPay} from '../src/domain/elevationInjuryPay.js';
import {regularElevationSalaryForSeason} from '../src/data/nflElevationSalary.js';
import {runOffseason,applyCapRollover} from '../src/engine/offseasonSimulator.js';
import {capUsedByTeam,capSpaceForTeam} from '../src/engine/capCompliance.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';

function fixture(weeks=3){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league:session.league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Recorded football injury',weeksRemaining:weeks},{gameId:game.gameId});
 session.phase='offseason';session.currentWeek=19;
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 return {session,player,league:session.league};
}

test('calendar pays remaining injury weeks before expiry, without inventing football service or consuming RNG',()=>{
 const {session,player,league}=fixture();
 const contract=structuredClone(player.contract),rng=JSON.stringify({seed:session.toSnapshot().rngSeed,streams:session.toSnapshot().rngStreams});
 const service=JSON.stringify({service:player.serviceHistory,pension:player.pensionService});
 const episode=structuredClone(player.elevationInjuryPay.episodes[0]);
 const pay=regularElevationSalaryForSeason(2026,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;
 const result=advancePreRolloverMedicalCalendar(league,{completedYear:2026,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 assert.equal(result.weeksAdvanced,4);assert.equal(player.injury,null);
 assert.deepEqual(player.contract,contract);
 assert.equal(player.elevationInjuryPay.episodes[0].status,'recovered');
 assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>[row.week,row.payCents,row.practiceCents,row.capChargeCents]),[[24,pay,0,pay],[25,pay,0,pay],[26,pay,0,pay]]);
 assert.equal(JSON.stringify({service:player.serviceHistory,pension:player.pensionService}),service);
 assert.equal(JSON.stringify({seed:session.toSnapshot().rngSeed,streams:session.toSnapshot().rngStreams}),rng);
 validateSnapshotElevationInjuryPay(session.toSnapshot());
 const before=JSON.stringify(session.toSnapshot());
 assert.equal(advancePreRolloverMedicalCalendar(league,{completedYear:2026}).alreadyRun,true);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
});

test('post-final salary reduces original club cap and rollover exactly once, while actual postseason remains exempt',()=>{
 const {session,player,league}=fixture();
 const beforeCap=capUsedByTeam(league,'BUF'),beforeRoom=capSpaceForTeam(league,'BUF');
 advancePreRolloverMedicalCalendar(league,{completedYear:2026});
 const cents=player.elevationInjuryPay.payroll.reduce((sum,row)=>sum+row.additionalCents,0);
 assert.equal(Math.round((capUsedByTeam(league,'BUF')-beforeCap)*100),cents);
 assert.equal(Math.round((beforeRoom-capSpaceForTeam(league,'BUF'))*100),cents);
 assert.equal(league.capLedger.BUF.elevationInjuryCharges.filter(row=>row.week>=24).length,3);
 const expected=capSpaceForTeam(league,'BUF');
 applyCapRollover(league,{completedYear:2026});
 assert.equal(league.capLedger.BUF.rollover,Math.max(0,Math.round(expected)));
 assert.deepEqual(league.capLedger.BUF.elevationInjuryCharges,[]);
 const once=JSON.stringify(session.toSnapshot());applyCapRollover(league,{completedYear:2026});
 assert.equal(JSON.stringify(session.toSnapshot()),once);
 const restored=createSessionFromSnapshot(session.toSnapshot());
 assert.deepEqual(restored.league.capLedger.BUF,league.capLedger.BUF);
});

test('new post-final receipts reject missing or changed cap charges; older policy records remain readable without rewriting money',()=>{
 const {session,player,league}=fixture();advancePreRolloverMedicalCalendar(league,{completedYear:2026});
 for(const corrupt of [s=>s.league.capLedger.BUF.elevationInjuryCharges.pop(),s=>s.league.players.find(p=>p.id===player.id).elevationInjuryPay.payroll[0].capChargeCents=0,
  s=>s.league.players.find(p=>p.id===player.id).elevationInjuryPay.payroll[0].capTreatmentVersion='unsupported']){
  const snapshot=session.toSnapshot();corrupt(snapshot);assert.throws(()=>createSessionFromSnapshot(snapshot));
 }
 const legacy=session.toSnapshot();
 for(const row of legacy.league.players.find(p=>p.id===player.id).elevationInjuryPay.payroll){delete row.capTreatmentVersion;row.capChargeCents=0;}
 legacy.league.capLedger.BUF.elevationInjuryCharges=legacy.league.capLedger.BUF.elevationInjuryCharges.filter(row=>row.week<=18);
 const restored=createSessionFromSnapshot(legacy);
 assert.deepEqual(restored.league.players.find(p=>p.id===player.id).elevationInjuryPay,legacy.league.players.find(p=>p.id===player.id).elevationInjuryPay);
 assert.deepEqual(restored.league.capLedger.BUF,legacy.league.capLedger.BUF);
});

test('actual rollover expires the practice term, retaining admitted rights and earned pay through restore and retry',()=>{
 const {session,player}=fixture();
 assert.equal(session.runRosterYearRollover().ok,true);
 assert.equal(player.elevationInjuryPay.episodes[0].status,'recovered');
 assert.equal(player.injury,null);assert.equal(session.league.injurySalaryClaims,undefined);
 assert.equal(session.league.admittedInjuryContinuations.length,1);
 assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>row.week),[24,25,26]);
 assert.ok(player.practiceContractHistory.length);
 const receipts=structuredClone(player.elevationInjuryPay.payroll);
 const restored=createSessionFromSnapshot(session.toSnapshot());
 assert.deepEqual(restored.league.players.find(p=>p.id===player.id).elevationInjuryPay.payroll,receipts);
 assert.equal(restored.runRosterYearRollover().alreadyRun,true);
 assert.deepEqual(restored.league.players.find(p=>p.id===player.id).elevationInjuryPay.payroll,receipts);
});

test('legacy calendar mode refuses long rights, and malformed payroll refuses actual annual paths atomically',()=>{
 const {session,league}=fixture(16);delete league.offseasonPipeline;const before=JSON.stringify(session.toSnapshot());
 for(const run of [()=>advancePreRolloverMedicalCalendar(league,{completedYear:2026})]){
  assert.throws(run,error=>error.reasonCode==='ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.equal(JSON.stringify(session.toSnapshot()),before);
 }
 const f=fixture();f.player.elevationInjuryPay.payroll.push({bad:true});
 const corrupt=JSON.stringify(f.session.toSnapshot());
 for(const run of [()=>advancePreRolloverMedicalCalendar(f.league,{completedYear:2026}),()=>f.session.runRosterYearRollover(),()=>runOffseason({league:f.league,year:2026,rng:f.session.rng})]){
  assert.throws(run,/Invalid elevation injury pay/);
  assert.equal(JSON.stringify(f.session.toSnapshot()),corrupt);
 }
});

test('calendar provenance is mandatory for extra periods, rejects duplicate/altered receipts on restore',()=>{
 const {session,player,league}=fixture();
 assert.throws(()=>recordElevationInjuryWeekPay(league,{year:2026,week:24}),/unproved pre-rollover/);
 advancePreRolloverMedicalCalendar(league,{completedYear:2026});
 for(const corrupt of [s=>delete s.league.preRolloverMedicalCalendar,s=>s.league.preRolloverMedicalCalendar.push({...s.league.preRolloverMedicalCalendar[0]}),s=>s.league.preRolloverMedicalCalendar[0].throughWeek=28,s=>s.league.preRolloverMedicalCalendar[0].year=2199,s=>s.league.preRolloverMedicalCalendar[0].finalGameId='2026-regular-regular-season-1-MIA-BUF']){
  const snapshot=session.toSnapshot();corrupt(snapshot);
  assert.throws(()=>createSessionFromSnapshot(snapshot));
 }
 assert.ok(player.elevationInjuryPay.payroll.length);
});

test('a regular-season setup cannot obtain offseason healing from a supplied year; historical starts remain supported',()=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='active');
 player.injury={type:'Out 4W',weeksRemaining:4};const before=JSON.stringify(session.toSnapshot());
 assert.equal(advancePreRolloverMedicalCalendar(session.league,{completedYear:2026}).notApplicable,true);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 const forged=session.toSnapshot();
 forged.league.preRolloverMedicalCalendar=[{version:'pre-rollover-medical-calendar-v1',year:2026,throughWeek:27,finalGameId:null}];
 assert.throws(()=>createSessionFromSnapshot(forged),error=>error.reasonCode==='ELEVATION_INJURY_PAY_INVALID');
 const historic=createSession({seed:117,startYear:2004,controlledTeamId:'BUF'});
 assert.doesNotThrow(()=>runOffseason({league:historic.league,year:2004,rng:historic.rng,skipDraft:true}));
 assert.equal(historic.league.preRolloverMedicalCalendar,undefined);
});

test('headless annual path applies the same calendar and retains injury payments',()=>{
 const {session,player,league}=fixture();
 runOffseason({league,year:2026,rng:session.rng,skipDraft:true});
 const retained=[...league.players,...league.retiredPlayers].find(p=>p.id===player.id);
 assert.equal(retained.elevationInjuryPay.episodes[0].status,'recovered');
 assert.equal(league.injurySalaryClaims,undefined);
 assert.equal(league.admittedInjuryContinuations.length,1);
 assert.ok(retained.elevationInjuryPay.payroll.some(row=>row.week===24));
 assert.equal(league.preRolloverMedicalCalendar[0].throughWeek,27);
});

test('noncontrolled club retains admitted compensation through expiry and summer recovery without a dispute',()=>{
 const {session,player,league}=fixture(16);session.controlledTeamId='MIA';
 const oldPay=structuredClone(player.elevationInjuryPay.payroll);
 runOffseason({league,year:2026,rng:session.rng,skipDraft:true});
 const retained=[...league.players,...league.retiredPlayers].find(p=>p.id===player.id);
 assert.equal(retained.injury,null,'newly anchored summer intervals continue recovery after the source-year calendar');
 assert.equal(league.offseasonMedicalCalendar[0].throughWeek,25);
 assert.equal(retained.elevationInjuryPay.episodes[0].status,'recovered');
 assert.deepEqual(retained.elevationInjuryPay.payroll.slice(0,oldPay.length),oldPay);
 assert.deepEqual(retained.elevationInjuryPay.payroll.slice(oldPay.length).map(row=>row.week),[24,25,26,27]);
 assert.equal(league.injurySalaryClaims,undefined);
 assert.equal(league.annualElevationInjuryResolutions,undefined);
 assert.equal(league.admittedInjuryContinuations[0].teamId,'BUF');
 assert.equal(league.admittedInjuryContinuations[0].term.endsAfterMedicalWeek,24);
 assert.deepEqual(league.admittedInjuryPayroll.filter(row=>row.playerId===player.id).map(row=>row.week),Array.from({length:12},(_,i)=>i+1));
 assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
});

test('retrying a legacy already-completed rollover does not apply retroactive calendar recovery',()=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='active');
 player.injury={type:'Recorded injury after legacy rollover',weeksRemaining:3};
 session.phase='offseason';session.getOffseasonPipeline().rosterRolloverYear=2026;
 assert.equal(session.runRosterYearRollover().alreadyRun,true);
 assert.equal(player.injury.weeksRemaining,3);
 assert.equal(session.league.preRolloverMedicalCalendar,undefined);
});
