import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
import {resolvePlayerMeasurements,estimatePlayerSkeleton} from '../src/domain/playerMeasurements.js';
import {measuredBodyRig} from '../public/lib/physiqueGeometryContract.js';
import {buildPlayerPhysiqueSvg,buildPlayerMotionSvg} from '../public/lib/playerPortrait.js';
import {solvePlayerMotion} from '../public/lib/playerMotion.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
const make=(heightInches,weightLbs,version='regional-body-shape-v3')=>ensurePlayerVisualIdentity({
 id:'tail-control',age:24,heightInches,weightLbs,ratings:{speed:80,acceleration:75,agility:70,jumping:70,strength:70,stamina:70},
 profile:{regionalBodyShapeRecipe:{version,seed:'tail-seed'}}},{newPlayer:true});
const dto=p=>({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));

test('modern stature/mass tails and endpoints remain consistent through frame, rig and six movements',()=>{
 for(const h of [62,74,87,96])for(const mass of [100,130,225,410,650]){
  const p=make(h,mass),before=structuredClone(p),d=dto(p),f=d.visualFrame,m=resolvePlayerMeasurements(p),rig=measuredBodyRig(f);
  assert.equal(f.heightInches,m.values.heightInches);assert.equal(f.weightLbs,m.values.weightLbs);assert.equal(rig.height,h);
  assert.equal(f.measurementFit.status,'supported');assert.equal(f.measurementFit.scope,'stature-and-mass');
  assert.equal(f.shoulderSpanInches,estimatePlayerSkeleton(p).shoulderSpanInches);
  assert.equal(f.armLengthInches,estimatePlayerSkeleton(p).armLengthInches);
  assert.ok(Math.abs(f.volumeBudgetInches3*16.387064/1000/.45359237-mass)<1e-10);
  for(const view of ['front','side']){
   const svg=buildPlayerPhysiqueSvg(d,{view});assert.match(svg,new RegExp(`data-height="${h}"`));assert.match(svg,new RegExp(`data-weight="${mass}"`));
   assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
   const box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
   assert.ok(box[1]<570-h*6);assert.equal(box[1]+box[3],620);
  }
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.75]){
   const pose=solvePlayerMotion(d,{mode,phase});assert.ok(pose);assert.equal(pose.skull,rig.skull);assert.equal(pose.torso,rig.torso);
   for(const arm of pose.arms)assert.ok(Math.abs(distance(arm.root,arm.joint)+distance(arm.joint,arm.end)-f.armSegmentLengthInches*6)<1e-7);
   for(const leg of pose.legs)assert.ok(Math.abs(distance(leg.root,leg.joint)+distance(leg.joint,leg.end)-f.legLengthInches*6)<1e-7);
   assert.doesNotMatch(buildPlayerMotionSvg(d,{mode,phase}),/NaN|Infinity|undefined/);
  }
  assert.deepEqual(p,before);
 }
});

test('older body recipes retain clamps and modern unsupported observations are disclosed, never overwritten',()=>{
 for(const version of ['regional-body-shape-v1','regional-body-shape-v2']){
  assert.equal(playerFrame(make(87,410,version)).heightInches,86);assert.equal(playerFrame(make(87,410,version)).weightLbs,400);
  assert.equal(playerFrame(make(74,130,version)).weightLbs,140);
  assert.equal(playerFrame(make(0,0,version)).heightInches,62);
 }
 for(const [h,mass]of [[61,225],[97,225],[74,99],[74,651]]){
  const p=make(h,mass),before=structuredClone(p),d=dto(p),fit=d.visualFrame.measurementFit;
  assert.equal(fit.status,'unsupported');assert.equal(fit.unsupported.length,1);assert.equal(fit.unsupported[0].rendered,null);
  assert.equal(resolvePlayerMeasurements(p).values.heightInches,h);assert.equal(resolvePlayerMeasurements(p).values.weightLbs,mass);
  assert.equal(measuredBodyRig(d.visualFrame),null);assert.equal(solvePlayerMotion(d),null);
  assert.match(buildPlayerPhysiqueSvg(d),/Physique unavailable/);assert.match(buildPlayerMotionSvg(d),/unavailable/i);
  assert.deepEqual(p,before);
 }
});

test('new default and amended tail observations persist through actual session restoration',()=>{
 const session=createSession({seed:20261008,startYear:2026,controlledTeamId:'BUF'}),p=session.league.players[0];
 assert.equal(p.profile.regionalBodyShapeRecipe.version,'regional-body-shape-v5');
 p.heightInches=87;p.weightLbs=410;
 const before=structuredClone(session.rng),f=playerFrame(p),restored=createSessionFromSnapshot(session.toSnapshot()),q=restored.league.players.find(x=>x.id===p.id);
 assert.deepEqual(playerFrame(q),f);assert.equal(q.heightInches,87);assert.equal(q.weightLbs,410);
 assert.deepEqual(structuredClone(session.rng),before);
});
