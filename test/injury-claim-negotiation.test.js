import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {fileElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';
import {previewInjuryClaimNegotiation,offerInjuryClaimSettlement,settleCpuInjuryClaims} from '../src/domain/injuryClaimNegotiation.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';

function fixture(){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});applyInjury(player,{type:'Qualifying injury',weeksRemaining:12},{gameId:game.gameId});
 const {claim}=fileElevationInjurySalaryClaim(league,{playerId:player.id,gameId:game.gameId,claimedCents:10000001});
 return {session,league,player,claim,args:{teamId:'BUF',claimId:claim.claimId,expectedPaymentYear:2026}};
}
test('preview and rejected offers preserve whole state; accepted negotiation retains medical, employment, pay and RNG',()=>{
 const {session,league,player,claim,args}=fixture(),before=JSON.stringify(session.toSnapshot()),person=structuredClone(player);
 const preview=previewInjuryClaimNegotiation(league,args);
 assert.ok(preview.requestedCents>=8000001&&preview.requestedCents<=claim.claimedCents);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 assert.equal(offerInjuryClaimSettlement(league,{...args,paidCents:preview.requestedCents-1}).accepted,false);
 assert.equal(JSON.stringify(session.toSnapshot()),before);
 assert.equal(offerInjuryClaimSettlement(league,{...args,paidCents:preview.requestedCents}).accepted,true);
 assert.deepEqual(player,person);assert.equal(league.injurySalaryClaims[0].resolution.regularGameEquivalents,0);
 const restored=createSessionFromSnapshot(session.toSnapshot()),once=JSON.stringify(restored.toSnapshot());
 assert.equal(restored.offerInjurySalaryClaim({...args,paidCents:preview.requestedCents}).alreadySettled,true);
 assert.equal(JSON.stringify(restored.toSnapshot()),once);
});
test('wrong payer, malformed amounts, stale year and closed year refuse without any mutation',()=>{
 const {session,league,args}=fixture();
 for(const change of [{teamId:'MIA'},{paidCents:-1},{paidCents:1.5},{paidCents:Infinity},{expectedPaymentYear:2027}]){
  const before=JSON.stringify(session.toSnapshot());assert.equal(offerInjuryClaimSettlement(league,{...args,paidCents:10000001,...change}).ok,false);assert.equal(JSON.stringify(session.toSnapshot()),before);
 }
 applyCapRollover(league,{completedYear:2026});const before=JSON.stringify(session.toSnapshot());
 assert.equal(offerInjuryClaimSettlement(league,{...args,paidCents:10000001}).reasonCode,'INJURY_CLAIM_FINANCIAL_YEAR_CLOSED');
 assert.equal(JSON.stringify(session.toSnapshot()),before);
});
test('CPU respects controlled clubs and uses the same offer authority after year opening; original reserve survives',()=>{
 const {session,league,player,args}=fixture();applyCapRollover(league,{completedYear:2026});league.financialYear=2027;
 const original=structuredClone(player),before=JSON.stringify(session.toSnapshot());
 assert.equal(settleCpuInjuryClaims(league,{controlledTeamId:'BUF'}).settled,0);assert.equal(JSON.stringify(session.toSnapshot()),before);
 const preview=previewInjuryClaimNegotiation(league,args);
 assert.equal(settleCpuInjuryClaims(league,{controlledTeamId:'MIA'}).settled,1);
 assert.equal(league.injurySalaryClaims[0].resolution.paidCents,preview.requestedCents);
 assert.equal(league.injurySalaryClaims[0].resolution.year,2027);assert.deepEqual(player,original);
 assert.equal(league.capLedger.BUF.injurySalaryClaimCharges[0].amountCents,preview.requestedCents-4000000);
 assert.doesNotThrow(()=>createSessionFromSnapshot(session.toSnapshot()));
 const once=JSON.stringify(session.toSnapshot());assert.equal(settleCpuInjuryClaims(league).settled,0);assert.equal(JSON.stringify(session.toSnapshot()),once);
});
