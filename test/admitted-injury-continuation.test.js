import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {retainAdmittedInjuryContinuation,validateSnapshotAdmittedInjuryContinuations,validateAdmittedInjuryContinuation} from '../src/domain/admittedInjuryContinuation.js';
import {inspectSnapshotCompatibility,migrateSnapshot} from '../src/runtime/snapshotMigration.js';
import {GameSession} from '../src/runtime/GameSession.js';
import {RNG} from '../src/utils/rng.js';
import {normalizeContract} from '../src/domain/contracts.js';

function fixture(){
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(player=>player.teamId==='BUF'&&player.rosterSlot==='practice'&&player.experience===0&&!player.injury?.weeksRemaining&&!player.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Qualifying football injury',weeksRemaining:20},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 return {session,league,player,game};
}
const original=fixture();
const fresh=()=>{const session=createSessionFromSnapshot(original.session.toSnapshot());return {session,league:session.league,player:session.league.players.find(p=>p.id===original.player.id),game:original.game};};
const retain=({league,player,game})=>retainAdmittedInjuryContinuation(league,{playerId:player.id,gameId:game.gameId});

test('admitted retention preserves only source-bound rights, not money, employment, service, disputes or RNG',()=>{
 const f=fresh(),before=f.session.toSnapshot();
 const result=retain(f);assert.equal(result.alreadyRetained,false);
 const right=f.league.admittedInjuryContinuations[0];
 assert.equal(right.teamId,'BUF');assert.equal(right.injuryYear,2026);assert.equal(right.term.endsAfterMedicalWeek,24);
 assert.equal(validateAdmittedInjuryContinuation(f.league,right).injuryOngoing,true);
 const after=f.session.toSnapshot();delete after.league.admittedInjuryContinuations;
 assert.deepEqual(after,before);
 result.right.term.endsAfterMedicalWeek=1;assert.equal(right.term.endsAfterMedicalWeek,24,'result is detached');
});

test('retention retries from saved authority after archive pruning and actual employment expiry',()=>{
 const f=fresh(),first=retain(f).right;
 f.league.gameArchive=[];f.league.history=[];
 f.player.teamId='FA';f.player.rosterSlot='active';f.player.contract=null;
 f.league.year=2027;f.league.financialYear=2027;
 const before=JSON.stringify(f.league),retry=retain(f);
 assert.equal(retry.alreadyRetained,true);assert.deepEqual(retry.right,first);assert.equal(JSON.stringify(f.league),before);
 assert.equal(validateAdmittedInjuryContinuation(f.league,first).employmentRequired,false);
 assert.equal(retry.right.teamId,'BUF','free agency cannot change the injury payer');
});

test('real compressed codec and session restoration retain admitted source; explicit new validator accepts it',async()=>{
 const f=fresh();retain(f);
 const saved=f.session.toSnapshot(),decoded=await decodeSnapshot(await encodeSnapshot(saved));
 const restored=createSessionFromSnapshot(decoded);
 assert.deepEqual(restored.league.admittedInjuryContinuations,saved.league.admittedInjuryContinuations);
 validateSnapshotAdmittedInjuryContinuations(restored.toSnapshot());
 assert.deepEqual(restored.league.players.find(p=>p.id===f.player.id).elevationInjuryPay,f.player.elevationInjuryPay);
});

test('unproved final, unknown source and existing dispute refuse retention atomically',()=>{
 for(const mutate of [f=>{f.league.gameArchive=[];},f=>{f.player.elevationInjuryPay.episodes[0].status='recovered';},
  f=>{f.player.injury=null;},f=>{f.league.injurySalaryClaims=[{playerId:f.player.id,gameId:f.game.gameId}];}]){
  const f=fresh();mutate(f);const before=JSON.stringify(f.league);
  assert.throws(()=>retain(f),error=>error.reasonCode==='ADMITTED_INJURY_CONTINUATION_INVALID');
  assert.equal(JSON.stringify(f.league),before);
 }
});

test('restored source rejects payer, rate, identity, term, score, version and duplicate tampering',()=>{
 const f=fresh();retain(f);
 const changes=[r=>{r.teamId='MIA';},r=>{r.weeklyRateCents++;},r=>{r.creditedSeasons++;},r=>{r.rightId='invented';},
  r=>{r.term.endsAfterMedicalWeek++;},r=>{r.termEvidence.games[0].homeScore=0;},r=>{r.version='unsupported';},
  r=>{r.authority='filed-grievance';},r=>{r.extra=1;},r=>{r.termEvidence.games[0].homeTeamId='UNKNOWN';}];
 for(const [index,change]of changes.entries()){const league=structuredClone(f.league);change(league.admittedInjuryContinuations[0]);assert.throws(()=>validateSnapshotAdmittedInjuryContinuations(league),`tamper case${index}`);}
 const duplicate=structuredClone(f.league);duplicate.admittedInjuryContinuations.push(structuredClone(duplicate.admittedInjuryContinuations[0]));
 assert.throws(()=>validateSnapshotAdmittedInjuryContinuations(duplicate));
});

test('retained result cannot conceal contradictory still-present club-term evidence',()=>{
 const f=fresh();retain(f);
 const final=f.league.gameArchive.find(g=>g.round==='super-bowl');final.homeScore=10;final.winnerId='MIA';
 assert.throws(()=>retain(f),error=>error.reasonCode==='ADMITTED_INJURY_CONTINUATION_INVALID');
});

test('recovery preserves the historical right without creating a claim or new entitlement',()=>{
 const f=fresh();const first=retain(f).right;
 f.player.injury=null;f.player.elevationInjuryPay.episodes[0].status='recovered';
 assert.equal(validateAdmittedInjuryContinuation(f.league,first).injuryOngoing,false);
 assert.equal(retain(f).alreadyRetained,true);assert.equal(f.league.admittedInjuryContinuations.length,1);
 assert.equal(f.league.injurySalaryClaims,undefined);
});

test('real import and direct transaction restoration reject forged retained rights before mutating snapshots',()=>{
 const f=fresh();retain(f);
 const saved=f.session.toSnapshot();
 const mutations=[s=>{s.league.admittedInjuryContinuations={};},
  s=>{s.league.admittedInjuryContinuations[0].teamId='MIA';},
  s=>{s.league.admittedInjuryContinuations[0].weeklyRateCents++;},
  s=>{s.league.admittedInjuryContinuations[0].term.endsAfterMedicalWeek++;},
  s=>{s.league.admittedInjuryContinuations.push(structuredClone(s.league.admittedInjuryContinuations[0]));}];
 for(const mutate of mutations){
  const invalid=structuredClone(saved);mutate(invalid);const unchanged=structuredClone(invalid);
  const verdict=inspectSnapshotCompatibility(invalid);
  assert.equal(verdict.ok,false);assert.equal(verdict.reasonCode,'ADMITTED_INJURY_CONTINUATION_INVALID');
  for(const restore of [migrateSnapshot,createSessionFromSnapshot,s=>GameSession.fromSnapshot(s,seed=>new RNG(seed))]){
   assert.throws(()=>restore(invalid),e=>e.reasonCode==='ADMITTED_INJURY_CONTINUATION_INVALID');
   assert.deepEqual(invalid,unchanged,'refused restore is atomic');
  }
 }
 assert.deepEqual(f.session.toSnapshot(),saved,'active session remains unchanged');
});

test('runtime import preserves a valid retained payer after employment expiry and archive pruning',()=>{
 const f=fresh();retain(f);f.league.gameArchive=[];f.league.history=[];
 f.player.teamId='FA';f.player.rosterSlot='active';
 // Runtime expired/free-agent contracts use an explicit zero-term record,
 // rather than the domain-only null-contract counterfactual above.
 f.player.contract=normalizeContract({salary:0,baseSalary:0,capHit:0,yearsRemaining:0,signingBonus:0,guaranteed:0,deadCapRemaining:0});
 const saved=f.session.toSnapshot();
 assert.equal(inspectSnapshotCompatibility(saved).ok,true);
 const restored=createSessionFromSnapshot(saved);
 assert.deepEqual(restored.league.admittedInjuryContinuations,f.league.admittedInjuryContinuations);
 assert.equal(restored.league.admittedInjuryContinuations[0].teamId,'BUF');
 const direct=GameSession.fromSnapshot(structuredClone(saved),seed=>new RNG(seed));
 assert.deepEqual(direct.league.admittedInjuryContinuations,f.league.admittedInjuryContinuations);
});
