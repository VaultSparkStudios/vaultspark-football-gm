import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerPhysiqueSvg,buildPlayerPortraitSvg,buildPlayerMotionSvg} from '../public/lib/playerPortrait.js';

test('modern static body and portrait do not change with strength; independent appearance remains varied',()=>{
 const definitions=new Set();
 for(let i=0;i<100;i++){
  const p=ensurePlayerVisualIdentity({id:`definition-${i}`,age:25,heightInches:62+i%25,weightLbs:140+i%261,ratings:{strength:40,speed:40},profile:{}},{newPlayer:true});
  const original=structuredClone(p),f=playerFrame(p),a=playerAppearance(p),high={...p,ratings:{...p.ratings,strength:99}},hf=playerFrame(high);
  assert.deepEqual(hf,f);assert.deepEqual(playerAppearance(high),a);
  definitions.add(f.muscleDefinition);assert.ok(f.muscleDefinition>=.12&&f.muscleDefinition<=.82);
  const resolved=q=>({...q,appearance:playerAppearance(q),visualFrame:playerFrame(q)});
  assert.equal(buildPlayerPortraitSvg(resolved(p)),buildPlayerPortraitSvg(resolved(high)));
  for(const view of ['front','side'])assert.equal(buildPlayerPhysiqueSvg(resolved(p),{view}),buildPlayerPhysiqueSvg(resolved(high),{view}));
  const faster={...p,ratings:{...p.ratings,speed:99,acceleration:99}};
  assert.deepEqual(playerFrame(faster),f);
  assert.notEqual(buildPlayerMotionSvg(resolved(p),{mode:'run',phase:.37}),buildPlayerMotionSvg(resolved(faster),{mode:'run',phase:.37}));
  assert.deepEqual(p,original);
 }
 assert.equal(definitions.size,100);
});

test('definition survives save restoration, trade, grooming and age without drawing football randomness',()=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),p=session.league.players[0],before=session.toSnapshot(),f=playerFrame(p);
 const restored=createSessionFromSnapshot(before),q=restored.league.players.find(q=>q.id===p.id);
 assert.deepEqual(playerFrame(q),f);
 const changed={...p,age:p.age+8,teamId:'MIA',ratings:{...p.ratings,strength:99},profile:{...p.profile,grooming:{version:'player-grooming-v3',hairstyle:'shaved',dyedHairColor:'#713629'}}};
 assert.deepEqual(playerFrame(changed),f);
 assert.deepEqual(session.toSnapshot(),before);
});
