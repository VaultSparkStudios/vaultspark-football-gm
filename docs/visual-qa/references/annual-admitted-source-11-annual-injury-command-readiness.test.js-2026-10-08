import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {executeAdvanceWeekCommand,executeAdvanceWeekTransaction} from '../src/runtime/advanceWeekCommand.js';
import {assertElevationInjuryContractTransition} from '../src/domain/elevationInjuryPay.js';
import {GameSession} from '../src/runtime/GameSession.js';
import {RNG} from '../src/utils/rng.js';
import {fileElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';

function fixture(weeks){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league:session.league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Controlled qualifying injury',weeksRemaining:weeks},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 session.phase='offseason';session.currentWeek=19;delete session.league.offseasonPipeline;
 return {session,player};
}
test('explicitly elected dispute survives read-only readiness and actual annual command without pretending recovery',()=>{
 const {session,player}=fixture(16);
 fileElevationInjurySalaryClaim(session.league,{playerId:player.id,gameId:player.elevationInjuryPay.episodes[0].gameId,claimedCents:10000001});
 const before=JSON.stringify(session.toSnapshot());
 assert.equal(session.getAdvanceReadiness().ok,true);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 const result=executeAdvanceWeekTransaction(session,{count:1});
 assert.equal(result.ok,true);assert.ok(result.committedSession);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 assert.equal(executeAdvanceWeekCommand(session,{count:1}).ok,true);
 assert.ok(player.injury.weeksRemaining>0);
 assert.equal(player.elevationInjuryPay.episodes[0].status,'claim-pending');
 assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>row.week),[24]);
 const receipt=session.league.annualElevationInjuryResolutions[0],claim=session.league.injurySalaryClaims[0];
 assert.equal(receipt.term.endsAfterMedicalWeek,24);assert.equal(claim.status,'filed');
 assert.equal(receipt.claimId,claim.claimId);assert.equal(claim.injuryYear,2026);assert.equal(claim.teamId,'BUF');
 const restored=createSessionFromSnapshot(session.toSnapshot());
 assert.deepEqual(restored.league.injurySalaryClaims,session.league.injurySalaryClaims);
 const retainedBefore=JSON.stringify(restored.toSnapshot());
 assert.equal(restored.runRosterYearRollover().alreadyRun,true);
 assert.equal(JSON.stringify(restored.toSnapshot()),retainedBefore);
 const compacted=structuredClone(session.toSnapshot());
 const final=compacted.league.gameArchive.find(g=>g.label==='super-bowl');
 compacted.league.history.push({year:2026,superBowl:final});
 compacted.league.gameArchive=[];
 const archived=createSessionFromSnapshot(compacted);
 assert.deepEqual(archived.league.annualElevationInjuryResolutions,session.league.annualElevationInjuryResolutions);
 assert.doesNotThrow(()=>assertElevationInjuryContractTransition(archived.league));
 for(const corrupt of [s=>delete s.league.injurySalaryClaims,s=>delete s.league.annualElevationInjuryResolutions,
  s=>s.league.annualElevationInjuryResolutions[0].term.endsAfterMedicalWeek=27,
  s=>s.league.annualElevationInjuryResolutions[0].estimate.amountCents++,
  s=>{const term=s.league.annualElevationInjuryResolutions[0].term;term.lastGameId='2026-playoffs-afc-wildcard-0-MIA-BUF';term.lastGameMedicalWeek=19;term.endsAfterMedicalWeek=20;term.proof='playoff-elimination';},
  s=>delete s.league.annualElevationInjuryResolutions[0].termEvidence,
  s=>{const game=s.league.annualElevationInjuryResolutions[0].termEvidence.games.find(g=>g.label==='super-bowl');game.homeScore=14;game.awayScore=21;game.winnerId=game.awayTeamId;}]){
  const snapshot=structuredClone(session.toSnapshot());corrupt(snapshot);assert.throws(()=>createSessionFromSnapshot(snapshot));
 }
});
test('successful calendar readiness is read-only, then actual command pays and recovers at annual stage',()=>{
 const {session,player}=fixture(3),before=JSON.stringify(session.toSnapshot());
 assert.equal(session.getAdvanceReadiness().ok,true);assert.equal(session.getAdvanceReadiness().ok,true);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 const result=executeAdvanceWeekCommand(session,{count:1});assert.equal(result.ok,true);
 assert.equal(player.injury,null);
 assert.equal(player.elevationInjuryPay.episodes[0].status,'recovered');
 assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>row.week),[24,25,26]);
 assert.equal(session.league.injurySalaryClaims,undefined);
 assert.equal(session.league.admittedInjuryContinuations.length,1);
});
test('unproved club term and fabricated pending status cannot bypass annual protections',()=>{
 const {session,player}=fixture(16);
 session.league.gameArchive=[];
 const final=canonicalFootballGame({year:2026,homeTeamId:'DAL',awayTeamId:'NYJ',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'DAL'});
 const before=JSON.stringify(session.toSnapshot());
 const result=executeAdvanceWeekCommand(session,{count:1});
 assert.equal(result.ok,false);assert.equal(result.reasonCode,'ELEVATION_INJURY_TERM_REQUIRED');
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 player.elevationInjuryPay.episodes[0].status='claim-pending';
 const forged=JSON.stringify(session.toSnapshot());
 assert.throws(()=>assertElevationInjuryContractTransition(session.league));
 assert.equal(JSON.stringify(session.toSnapshot()),forged);
});
test('retained elimination proof cannot contradict available original scores or invent later participation',()=>{
 const {session,player}=fixture(16);session.league.gameArchive=[];
 const final=canonicalFootballGame({year:2026,homeTeamId:'DAL',awayTeamId:'NYJ',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 const wildcard=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'afc-wildcard',round:'wildcard'});
 session.league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'DAL'},{...wildcard,homeScore:14,awayScore:21,winnerId:'MIA'});
 fileElevationInjurySalaryClaim(session.league,{playerId:player.id,gameId:player.elevationInjuryPay.episodes[0].gameId,claimedCents:10000001});
 assert.equal(executeAdvanceWeekCommand(session,{count:1}).ok,true);
 const valid=session.toSnapshot();
 assert.equal(valid.league.annualElevationInjuryResolutions[0].term.endsAfterMedicalWeek,20);
 assert.deepEqual(player.elevationInjuryPay.payroll,[]);
 const forged=structuredClone(valid),receipt=forged.league.annualElevationInjuryResolutions[0];
 const retained=receipt.termEvidence.games.find(g=>g.gameId===wildcard.gameId);
 retained.homeScore=21;retained.awayScore=14;retained.winnerId='BUF';
 const division=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'NYJ',seasonType:'playoffs',label:'afc-divisional',round:'divisional'});
 receipt.termEvidence.games.push({...division,homeScore:14,awayScore:21,winnerId:'NYJ'});
 receipt.term.lastGameId=division.gameId;receipt.term.lastGameMedicalWeek=20;receipt.term.endsAfterMedicalWeek=21;
 assert.throws(()=>createSessionFromSnapshot(forged),error=>error.reasonCode==='ELEVATION_INJURY_RESOLUTION_INVALID');
 assert.throws(()=>GameSession.fromSnapshot(forged,seed=>new RNG(seed)),error=>error.reasonCode==='ELEVATION_INJURY_RESOLUTION_INVALID');
 const before=JSON.stringify(forged);
 assert.throws(()=>assertElevationInjuryContractTransition(forged.league),error=>error.reasonCode==='ELEVATION_INJURY_RESOLUTION_INVALID');
 assert.equal(JSON.stringify(forged),before);
 const pruned=structuredClone(valid);pruned.league.history.push({year:2026,superBowl:pruned.league.gameArchive.find(g=>g.label==='super-bowl')});pruned.league.gameArchive=[];
 assert.doesNotThrow(()=>createSessionFromSnapshot(pruned));
 assert.doesNotThrow(()=>GameSession.fromSnapshot(pruned,seed=>new RNG(seed)));
});
test('malformed annual pay refuses before direct command mutation',()=>{
 const {session,player}=fixture(3);player.elevationInjuryPay.payroll.push({bad:true});const before=JSON.stringify(session.toSnapshot());
 const result=executeAdvanceWeekCommand(session,{count:1});
 assert.equal(result.ok,false);assert.equal(result.status,400);assert.equal(result.reasonCode,'ELEVATION_INJURY_PAY_INVALID');
 assert.equal(JSON.stringify(session.toSnapshot()),before);
});
test('already-marked legacy rollover cannot bypass unresolved rights or obtain retroactive healing',()=>{
 const {session,player}=fixture(16);session.getOffseasonPipeline().rosterRolloverYear=session.currentYear;
 const before=JSON.stringify(session.toSnapshot());
 for(const run of [()=>session.getAdvanceReadiness(),()=>executeAdvanceWeekCommand(session,{count:1,weeklyTacticOverride:'run-heavy'})]){
  const result=run();assert.equal(result.ok,false);assert.equal(result.status,409);
  assert.equal(result.reasonCode,'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
  assert.equal(JSON.stringify(session.toSnapshot()),before);
 }
 assert.equal(player.injury.weeksRemaining,16);assert.equal(session.league.preRolloverMedicalCalendar,undefined);
});
test('expected late annual refusal keeps its domain reason while transaction preserves the source',()=>{
 const {session,player}=fixture(3),before=JSON.stringify(session.toSnapshot());
 const result=executeAdvanceWeekTransaction(session,{count:1},{afterAdvance:()=>{
  throw Object.assign(new Error('Expected annual rights refusal'),{status:409,reasonCode:'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED',playerId:player.id});
 }});
 assert.equal(result.ok,false);assert.equal(result.status,409);assert.equal(result.reasonCode,'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED');
 assert.equal(result.playerId,player.id);assert.equal(result.committedSession,undefined);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
});
