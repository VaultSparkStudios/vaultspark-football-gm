import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury,advanceInjuryRecovery} from '../src/engine/injurySystem.js';
import {fileElevationInjurySalaryClaim,settleElevationInjurySalaryClaim,validateSnapshotInjurySalaryClaims,retainedInjurySalaryClaimCap} from '../src/domain/injurySalaryClaims.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';
import {capUsedByTeam} from '../src/engine/capCompliance.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';

function fixture(){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Qualifying long injury',weeksRemaining:12},{gameId:game.gameId});
 return {session,league,player,options:{playerId:player.id,gameId:game.gameId,claimedCents:10000001}};
}
const agree={paidCents:7000000,regularGameEquivalents:3,clubAccepted:true,playerAccepted:true,statutoryRightsPreserved:true};

test('filing reserves only 40% once, preserving original pay, contract, medical state and RNG through actual restoration',()=>{
 const {session,league,player,options}=fixture(),before=structuredClone(player),rng=session.toSnapshot().rngStreams,cap=capUsedByTeam(league,'BUF');
 const result=fileElevationInjurySalaryClaim(league,options);
 assert.equal(result.claim.reservedCents,4000000);assert.equal(capUsedByTeam(league,'BUF')-cap,40000);
 assert.deepEqual(player,before);assert.deepEqual(session.toSnapshot().rngStreams,rng);
 const restored=createSessionFromSnapshot(session.toSnapshot()),snapshot=restored.toSnapshot();
 assert.equal(fileElevationInjurySalaryClaim(restored.league,options).alreadyFiled,true);
 assert.deepEqual(restored.toSnapshot(),snapshot);assert.deepEqual(restored.league.injurySalaryClaims,league.injurySalaryClaims);
});

test('same-year mutually agreed settlement replaces reserve with actual cash; it cannot heal or invent physical/pension service',()=>{
 const {session,league,player,options}=fixture(),before=structuredClone(player),cap=capUsedByTeam(league,'BUF');
 const {claim}=fileElevationInjurySalaryClaim(league,options);
 const result=settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree});
 assert.equal(capUsedByTeam(league,'BUF')-cap,70000);
 assert.equal(result.claim.resolution.pensionTreatment,'separate-review-required');assert.deepEqual(player,before);
 const restored=createSessionFromSnapshot(session.toSnapshot()),snapshot=restored.toSnapshot();
 assert.equal(settleElevationInjurySalaryClaim(restored.league,{claimId:claim.claimId,...agree}).alreadySettled,true);
 assert.deepEqual(restored.toSnapshot(),snapshot);
});

test('later-year greater award charges only excess over original attribution after closing that year exactly once',()=>{
 const {session,league,options}=fixture();const {claim}=fileElevationInjurySalaryClaim(league,options);
 applyCapRollover(league,{completedYear:2026});const rollover=league.capLedger.BUF.rollover;
 assert.equal(retainedInjurySalaryClaimCap(league.capLedger.BUF),0);
 league.financialYear=2027;
 const restored=createSessionFromSnapshot(session.toSnapshot());
 settleElevationInjurySalaryClaim(restored.league,{claimId:claim.claimId,...agree});
 assert.equal(retainedInjurySalaryClaimCap(restored.league.capLedger.BUF),30000);
 assert.equal(restored.league.capLedger.BUF.rollover,rollover);
 assert.equal(restored.league.injurySalaryClaims[0].injuryYear,2026);
 const before=restored.toSnapshot();settleElevationInjurySalaryClaim(restored.league,{claimId:claim.claimId,...agree});
 assert.deepEqual(restored.toSnapshot(),before);
});

test('a lower later award creates an explicit signed credit; recovery preserves the filed claim until agreement',()=>{
 const {session,league,player,options}=fixture();const {claim}=fileElevationInjurySalaryClaim(league,options);
 player.injury.weeksRemaining=1;advanceInjuryRecovery(league);
 assert.equal(league.injurySalaryClaims[0].status,'filed');
 applyCapRollover(league,{completedYear:2026});league.financialYear=2027;
 settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree,paidCents:1000000,regularGameEquivalents:0});
 assert.equal(retainedInjurySalaryClaimCap(league.capLedger.BUF),-30000);
 assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
});

test('unsigned, invalid and conflicting commands preserve the whole franchise; closed-year filing refuses',()=>{
 const {session,league,options}=fixture();
 const before=session.toSnapshot();assert.throws(()=>fileElevationInjurySalaryClaim(league,{...options,claimedCents:-1}));assert.deepEqual(session.toSnapshot(),before);
 const {claim}=fileElevationInjurySalaryClaim(league,options),filed=session.toSnapshot();
 for(const override of [{playerAccepted:false},{clubAccepted:false},{statutoryRightsPreserved:false},{paidCents:-1},{regularGameEquivalents:19}]){
  assert.throws(()=>settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree,...override}));assert.deepEqual(session.toSnapshot(),filed);
 }
 assert.throws(()=>fileElevationInjurySalaryClaim(league,{...options,claimedCents:10}));assert.deepEqual(session.toSnapshot(),filed);
 settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree});const settled=session.toSnapshot();
 assert.throws(()=>settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree,paidCents:1}));assert.deepEqual(session.toSnapshot(),settled);
 const other=fixture();applyCapRollover(other.league,{completedYear:2026});const closed=other.session.toSnapshot();
 assert.throws(()=>fileElevationInjurySalaryClaim(other.league,other.options));assert.deepEqual(other.session.toSnapshot(),closed);
});

test('tampered sources, amounts, dates, consent and missing/duplicate/cross-club cap receipts reject actual save import',()=>{
 const {session,league,options}=fixture();const {claim}=fileElevationInjurySalaryClaim(league,options);
 settleElevationInjurySalaryClaim(league,{claimId:claim.claimId,...agree});
 const changes=[s=>s.league.injurySalaryClaims=null,s=>s.league.injurySalaryClaims[0].injuryYear++,s=>s.league.injurySalaryClaims[0].reservedCents++,
  s=>s.league.injurySalaryClaims[0].resolution.playerAccepted=false,s=>s.league.injurySalaryClaims[0].resolution.year++,
  s=>s.league.capLedger.BUF.injurySalaryClaimCharges.pop(),s=>s.league.capLedger.BUF.injurySalaryClaimCharges.push(s.league.capLedger.BUF.injurySalaryClaimCharges[0]),
  s=>{s.league.capLedger.MIA.injurySalaryClaimCharges=s.league.capLedger.BUF.injurySalaryClaimCharges;delete s.league.capLedger.BUF.injurySalaryClaimCharges;}];
 for(const change of changes){const snapshot=structuredClone(session.toSnapshot());change(snapshot);assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'INJURY_SALARY_CLAIM_INVALID');assert.throws(()=>createSessionFromSnapshot(snapshot));}
 assert.doesNotThrow(()=>validateSnapshotInjurySalaryClaims(league));
});

test('matching but noncanonical source IDs and malformed original injury evidence cannot file or mutate the franchise',()=>{
 for(const tamper of [
  player=>{player.standardElevations.games[0].game.gameId='not-a-game';player.elevationInjuryPay.episodes[0].gameId='not-a-game';},
  player=>player.elevationInjuryPay.episodes[0].creditedSeasons++,
  player=>player.standardElevations.games[0].game.awayTeamId='UNKNOWN'
 ]){
  const {session,league,player,options}=fixture();tamper(player);
  options.gameId=player.elevationInjuryPay.episodes[0].gameId;
  const before=session.toSnapshot();
  assert.throws(()=>fileElevationInjurySalaryClaim(league,options),error=>error.reasonCode==='INJURY_SALARY_CLAIM_INVALID');
  assert.deepEqual(session.toSnapshot(),before);
 }
});
