import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/runtime/bootstrap.js';

function fixture(position,{upgrade=false,missing=false,only=false}={}){
 const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
 session.phase='offseason';const draft=session.prepareDraft();
 draft.currentPick=1;draft.order[0]='MIA';
 const incumbent=session.league.players.find(p=>p.teamId==='MIA'&&p.position===position&&p.rosterSlot==='active');
 incumbent.overall=90;
 if(missing)incumbent.teamId='FA';
 const source=draft.available.find(p=>p.position===position);
 const specialist={...structuredClone(source),id:`candidate-${position}`,overall:upgrade?96:70,potential:99,
  scouting:{...source.scouting,projectedRound:7}};
 const sourceWr=draft.available.find(p=>p.position==='WR');
 const wr={...structuredClone(sourceWr),id:'candidate-WR',overall:upgrade?80:70,potential:99,
  scouting:{...sourceWr.scouting,projectedRound:7}};
 draft.available=only?[specialist]:[specialist,wr];
 if(!missing){
  const backup={...structuredClone(source),id:`held-${position}`,teamId:'MIA',status:'active',rosterSlot:'practice',overall:62,potential:70};
  session.league.players.push(backup);
 }
 session.rebuildLookupIndexes();return {session,draft,specialist,wr};
}
for(const position of ['K','P'])test(`CPU draft sees retained ${position} depth rather than repeatedly taking inferior specialists`,()=>{
 const {session,draft,wr}=fixture(position);
 const held=session.league.players.filter(p=>p.teamId==='MIA').map(p=>structuredClone(p));
 const result=session.runCpuDraft({picks:1,untilUserPick:false});
 assert.equal(result.ok,true);assert.equal(draft.selections[0].playerId,wr.id);
 for(const player of held)assert.deepEqual(session.league.players.find(p=>p.id===player.id),player,'drafting never edits incumbents');
});
test('a genuine specialist upgrade remains draftable despite a filled room',()=>{
 const {session,draft,specialist}=fixture('K',{upgrade:true});
 session.runCpuDraft({picks:1,untilUserPick:false});
 assert.equal(draft.selections[0].playerId,specialist.id);
});
test('an empty specialist room retains its active need priority',()=>{
 const {session,draft,specialist}=fixture('P',{missing:true});
 session.runCpuDraft({picks:1,untilUserPick:false});
 assert.equal(draft.selections[0].playerId,specialist.id);
});
test('depth preference is not an eligibility ban when only specialists remain',()=>{
 const {session,draft,specialist}=fixture('K',{only:true});
 session.runCpuDraft({picks:1,untilUserPick:false});
 assert.equal(draft.selections[0].playerId,specialist.id);
 assert.equal(draft.completed,true);
});
test('retained practice depth changes replacement value while an open development place does not',()=>{
 for(const keepPractice of [true,false]){
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  session.phase='offseason';const draft=session.prepareDraft();draft.currentPick=1;draft.order[0]='BUF';
  const held=session.league.players.filter(p=>p.teamId==='BUF'&&p.position==='WR');
  held.forEach(p=>p.overall=90);
  if(!keepPractice)for(const player of held.filter(p=>p.rosterSlot==='practice'))player.teamId='FA';
  const candidates=['WR','OL'].map(position=>{
   const source=draft.available.find(p=>p.position===position);
   return {...structuredClone(source),id:`development-${position}`,overall:position==='WR'?70:69,
    scouting:{...source.scouting,projectedRound:7}};
  });
  draft.available=candidates;session.rebuildLookupIndexes();
  // Explicit owned-pick delegation avoids persona tilt; remove event-day
  // jitter to isolate only whether held development depth is counted.
  session.rng.int=()=>0;
  const result=session.runCpuDraft({picks:1,untilUserPick:false});
  assert.equal(result.ok,true);
  assert.equal(draft.selections[0].playerId,keepPractice?'development-OL':'development-WR');
 }
});
