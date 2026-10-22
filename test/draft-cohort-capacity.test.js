import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { admitUndraftedFreeAgents } from '../src/domain/undraftedFreeAgency.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { draftCohortSize } from '../src/domain/draftCohort.js';

function addCompensatory(session,count){
  const year=session.currentYear+1;
  session.league.compensatoryPicks=Array.from({length:count},(_,i)=>({
    id:`CAPACITY-COMP-${year}-${i}`,year,round:7,teamId:'BUF',originalTeamId:'BUF',slot:1000+i}));
}
test('new draft completes every declared pick and retains an undrafted cohort',()=>{
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  addCompensatory(session,38);
  const draft=session.prepareDraft();
  assert.equal(draft.totalPicks,262);
  assert.ok(draft.available.length>=draft.totalPicks+32,'selection capacity cannot exhaust the undrafted cohort');
  const original=new Map(draft.available.map(p=>[p.id,structuredClone(p.profile)]));
  const result=session.runCpuDraft({untilUserPick:false});
  assert.equal(result.draft.selections.length,262);
  assert.equal(draft.currentPick,263);assert.equal(draft.completed,true);
  for(const [index,selection] of draft.selections.entries()){
    assert.equal(selection.teamId,draft.slots[index].teamId);
    assert.equal(selection.round,draft.slots[index].round);
    const player=session.league.players.find(p=>p.id===selection.playerId);
    const before=original.get(player.id),after=structuredClone(player.profile);
    before.source='drafted';assert.deepEqual(after,before);
  }
  assert.equal(draft.available.length,32);
  const admitted=admitUndraftedFreeAgents(session.league,draft,{year:2027});
  assert.equal(admitted.admitted.length,32);
  for(const player of admitted.admitted)assert.deepEqual(player.profile,original.get(player.id));
});
test('late compensatory slots expose the board capacity failure before selection',()=>{
  const session=createSession({seed:118,startYear:2026,controlledTeamId:'BUF'});
  const draft=session.prepareDraft(),before=structuredClone(draft.available);
  addCompensatory(session,40);session.refreshDraftOrder();
  assert.equal(draft.totalPicks,264);
  assert.ok(draft.available.length>=296);
  assert.deepEqual(draft.available.slice(0,before.length),before);
  const snapshot=JSON.stringify(session.toSnapshot());
  session.refreshDraftOrder();assert.equal(JSON.stringify(session.toSnapshot()),snapshot,'repeat capacity read cannot generate or reroll');
});

test('historical unmarked boards and boards after the first selection do not generate replacements',()=>{
  for(const legacy of [true,false]){
    const session=createSession({seed:119,startYear:2026,controlledTeamId:'BUF'});
    const draft=session.prepareDraft();
    if(legacy)delete draft.cohort;
    else session.runCpuDraft({picks:1,untilUserPick:false});
    addCompensatory(session,40);
    const before=structuredClone(draft),rngBefore=session.toSnapshot().rngStreams;
    session.refreshDraftOrder();
    assert.deepEqual(draft.available,before.available);assert.deepEqual(draft.selections,before.selections);
    assert.deepEqual(session.toSnapshot().rngStreams,rngBefore);
    if(!legacy)assert.deepEqual(draft,before);
  }
});
test('marked capacity survives compressed restoration and preserves scouting fog',async()=>{
  const session=createSession({seed:120,startYear:2026,controlledTeamId:'BUF'});
  const draft=session.prepareDraft(),original=structuredClone(draft.available);
  const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  addCompensatory(restored,40);restored.refreshDraftOrder();
  const next=restored.league.pendingDraft;
  assert.equal(next.available.length,296);
  assert.deepEqual(next.available.slice(0,original.length),original);
  assert.equal(new Set(next.available.map(p=>p.id)).size,next.available.length);
  for(const player of restored.getDraftState().available){
    assert.equal(player.overall,undefined);assert.equal(player.potential,undefined);
    assert.equal(typeof player.scouting.scoutedOverall,'number');
    assert.equal(typeof player.scouting.scoutedPotential,'number');
  }
});
test('invalid capacity or cohort receipts refuse before board or RNG mutation',()=>{
  for(const input of [-1,1.5,NaN,Infinity,'262',Number.MAX_SAFE_INTEGER])
    assert.throws(()=>draftCohortSize(input),TypeError);
  assert.equal(draftCohortSize(224),256);assert.equal(draftCohortSize(262),294);
  for(const patch of [{version:'unknown'},{undraftedReserve:0},{generatedCount:1}]){
    const session=createSession({seed:121,startYear:2026,controlledTeamId:'BUF'});
    const draft=session.prepareDraft();Object.assign(draft.cohort,patch);
    addCompensatory(session,40);const before=JSON.stringify(session.toSnapshot());
    assert.throws(()=>session.refreshDraftOrder(),TypeError);
    assert.equal(JSON.stringify(session.toSnapshot()),before);
  }
});
