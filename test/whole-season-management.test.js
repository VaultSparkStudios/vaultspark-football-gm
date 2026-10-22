import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/runtime/bootstrap.js';
import {FIELDABLE_DEPTH} from '../src/config.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';

function fundedFixture() {
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  const own=session.league.players.filter(p=>p.teamId==='BUF');
  const free=own.filter(p=>p.rosterSlot==='practice');
  const active=own.filter(p=>p.rosterSlot!=='practice');
  // Existing players only: leave one mandatory OL vacancy plus all practice
  // vacancies and provide enough real cap space to fund ordinary transactions.
  free.push(active.find(p=>p.position==='OL'));
  for(const p of free){p.teamId='FA';p.rosterSlot='active';p.overall=45;p.age=22;p.accruedSeasons=0;p.creditedSeasons=0;p.experience=0;}
  session.league.teams=session.league.teams.filter(t=>t.id==='BUF');
  session.league.players=own;
  session.league.capLedger.BUF.rollover=0;
  session.league.teamCapOverride.BUF=300_000_000;
  session.rebuildLookupIndexes();
  return {session,free};
}

function driveToBackstop(session,{fail=false,nested=false,beforeBackstop=null}={}) {
  let calls=0;
  session.phase='regular-season';
  session.advanceWeek=()=>{
    if(calls++===0){session.phase='postseason';return {ok:true};}
    if(session.phase==='postseason'){session.phase='season-awards';return {ok:true,year:2026,superBowl:{championTeamId:'BUF'}};}
    if(nested){
      const advance=session.advanceWeek;
      session.advanceWeek=()=>{session.phase='season-awards';return {ok:true,year:2026,superBowl:{championTeamId:'BUF'}};};
      session.phase='postseason';
      session.simulateOneSeason({runOffseasonAfter:false});
      session.advanceWeek=advance;
    }
    if(beforeBackstop)beforeBackstop();
    session.runRosterLegalityBackstop();
    if(fail)throw new Error('controlled management failure');
    session.phase='regular-season';
    return {ok:true};
  };
}

test('explicit whole-season delegation funds controlled active and practice depth; manual maintenance preserves GM choices',()=>{
  const {session,free}=fundedFixture();
  const ownBefore=structuredClone(session.league.players);
  session.runRosterLegalityBackstop();
  assert.deepEqual(session.league.players,ownBefore,'ordinary maintenance does not manage the GM club');
  const profiles=new Map(free.map(p=>[p.id,structuredClone(p.profile)]));
  driveToBackstop(session);
  session.simulateOneSeason();
  const roster=session.league.players.filter(p=>p.teamId==='BUF');
  assert.equal(roster.filter(p=>p.rosterSlot!=='practice').length,53);
  assert.equal(roster.filter(p=>p.rosterSlot==='practice').length,16);
  for(const p of free)assert.deepEqual(p.profile,profiles.get(p.id),'delegation keeps existing identities');
  assert.equal(session.controlledTeamId,'BUF');
  assert.ok(session.league.transactionLog.some(row=>row.teamId==='BUF'&&row.type==='roster-legality-signings'));
  const chosen=roster.find(p=>p.rosterSlot==='practice');chosen.teamId='FA';
  session.runRosterLegalityBackstop();
  assert.equal(chosen.teamId,'FA','authority returns to the GM after success');
});

test('whole-season management authority is restored after failure and is not saved',async()=>{
  const {session,free}=fundedFixture();
  let during;
  driveToBackstop(session,{fail:true,beforeBackstop:()=>{during=structuredClone(session.toSnapshot());}});
  assert.throws(()=>session.simulateOneSeason(),/controlled management failure/);
  assert.equal(session.controlledTeamId,'BUF');
  const owned=free.filter(p=>p.teamId==='BUF');
  assert.equal(owned.length,17,'ordinary funded signings happened before the injected failure');
  const p=owned.find(p=>p.rosterSlot==='practice');p.teamId='FA';
  session.runRosterLegalityBackstop();assert.equal(p.teamId,'FA');
  const restored=session.constructor.fromSnapshot(await decodeSnapshot(await encodeSnapshot(during)),seed=>new session.rng.constructor(seed));
  restored.runRosterLegalityBackstop();
  assert.ok(free.every(player=>restored.league.players.find(row=>row.id===player.id).teamId==='FA'),'a compressed snapshot captured inside delegation restores interactive authority');
});

test('nested whole-season calls preserve the outer delegation scope',()=>{
  const {session}=fundedFixture();driveToBackstop(session,{nested:true});session.simulateOneSeason();
  assert.equal(session.league.players.filter(p=>p.teamId==='BUF').length,69);
});

test('delegated retention and bidding include the owned club while ordinary calls exclude it',()=>{
  const {session,free}=fundedFixture();
  // This authority fixture funds the upcoming owned class as well as the
  // existing depth vacancies; retention must not raid the rookie budget.
  session.league.teamCapOverride.BUF += session.getCpuRosterSpendingPlan('BUF').rookieReserve;
  const incumbent=free.find(p=>p.position==='QB');incumbent.lastTeamId='BUF';
  const premium=free.find(p=>p.position==='OL');premium.overall=95;
  session.rng.chance=()=>true;
  const manual=session.constructor.fromSnapshot(structuredClone(session.toSnapshot()),seed=>new session.rng.constructor(seed));
  manual.rng.chance=()=>true;
  manual.runRetentionWindow();assert.equal(manual.league.players.find(p=>p.id===incumbent.id).teamId,'FA');
  assert.equal(manual.submitCpuFreeAgencyOffers().submitted,0);
  driveToBackstop(session,{beforeBackstop:()=>{
    session.runRetentionWindow();assert.equal(incumbent.teamId,'BUF');
    assert.ok(session.submitCpuFreeAgencyOffers().submitted>0);
    assert.ok(session.league.freeAgencyMarket.offers.some(offer=>offer.teamId==='BUF'&&offer.playerId===premium.id));
  }});
  session.simulateOneSeason();
});

test('whole-season delegation does not bypass no-free-agency challenge restrictions',()=>{
  const {session,free}=fundedFixture();session.league.settings.allowUserFreeAgency=false;
  free.forEach(p=>p.lastTeamId='BUF');session.rng.chance=()=>true;
  driveToBackstop(session,{beforeBackstop:()=>{
    session.runRetentionWindow();assert.equal(session.submitCpuFreeAgencyOffers().submitted,0);
  }});
  session.simulateOneSeason();
  assert.ok(free.every(p=>p.teamId==='FA'));
  assert.equal(session.controlledTeamId,'BUF');
});

test('actual complete season delegates management without changing controlled ownership',()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  session.league.teamCapOverride.BUF=600_000_000;
  const before=new Map(session.league.players.map(p=>[p.id,structuredClone(p.profile)]));
  const summary=session.simulateOneSeason();
  assert.ok(summary.superBowl?.championTeamId);
  assert.equal(session.phase,'regular-season');assert.equal(session.currentYear,2027);assert.equal(session.controlledTeamId,'BUF');
  const roster=session.league.players.filter(p=>p.status==='active'&&p.teamId==='BUF');
  const active=roster.filter(p=>p.rosterSlot!=='practice');
  assert.equal(active.length,53);assert.equal(roster.filter(p=>p.rosterSlot==='practice').length,16);
  for(const [position,band] of Object.entries(FIELDABLE_DEPTH))assert.ok(active.filter(p=>p.position===position).length>=band.min,position);
  for(const p of roster)if(before.has(p.id))assert.deepEqual(p.profile,before.get(p.id));
});

test('whole-season continuation from awards preserves the completed result without replaying games',()=>{
 const {session}=fundedFixture();session.phase='season-awards';
 const superBowl={championTeamId:'BUF',runnerUpTeamId:'CPU',homeScore:24,awayScore:20};
 session.pendingSeasonWrap={year:2026,superBowl};session.latestPostseason={superBowl};
 session.advanceWeek=()=>{throw new Error('awards must not advance when offseason is disabled');};
 const summary=session.simulateOneSeason({runOffseasonAfter:false});
 assert.equal(summary.year,2026);assert.deepEqual(summary.superBowl,superBowl);
 assert.equal(summary.championTeamId,'BUF');assert.equal(session.phase,'season-awards');
});

test('whole-season continuation captures offseason result before next-year initialization clears it',()=>{
 const {session}=fundedFixture();session.phase='offseason';
 const superBowl={championTeamId:'BUF',runnerUpTeamId:'CPU'};
 session.latestPostseason={superBowl};session.pendingSeasonWrap=null;
 session.advanceWeek=()=>{session.currentYear=2027;session.phase='regular-season';session.latestPostseason=null;return {ok:true};};
 const summary=session.simulateOneSeason();
 assert.equal(summary.year,2026);assert.deepEqual(summary.superBowl,superBowl);
 assert.equal(session.currentYear,2027);assert.equal(summary.championTeamId,'BUF');
});

test('restored actual awards season completes its offseason without repeating championship or statistics',async()=>{
 const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
 session.league.teamCapOverride.BUF=600_000_000;
 const completed=session.simulateOneSeason({runOffseasonAfter:false});
 const saved=await decodeSnapshot(await encodeSnapshot(session.toSnapshot()));
 const restored=session.constructor.fromSnapshot(saved,seed=>new session.rng.constructor(seed));
 const champions=structuredClone(restored.league.champions);
 // Table identity/age/ratings are live metadata; compare recorded performance
 // separately from the deliberate offseason aging and development updates.
 const recordedStats=()=>restored.statBook.getPlayerSeasonTable('passing',{year:2026,position:'QB',seasonType:'regular'})
  .map(({age,ovr,pot,pos,tm,player,...stats})=>stats).sort((a,b)=>a.playerId.localeCompare(b.playerId));
 const stats=structuredClone(recordedStats());
 const result=restored.simulateOneSeason();
 assert.equal(result.year,completed.year);assert.deepEqual(result.superBowl,completed.superBowl);
 assert.deepEqual(restored.league.champions,champions);assert.equal(restored.currentYear,2027);
 assert.equal(restored.phase,'regular-season');assert.equal(restored.controlledTeamId,'BUF');
 assert.deepEqual(recordedStats(),stats);
});
