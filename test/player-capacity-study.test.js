import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/player-capacity-baseline-poses.json',import.meta.url)));
assert.equal(fixture.poses.length,20);
const baseline=(p,{mode,phase})=>fixture.poses.find(row=>row.mode===mode&&row.phase===phase).pose;
import {solvePlayerMotion,buildPlayerMotionSvg,playerMovementProfile} from '../public/lib/playerMotion.js';
import {enduranceStudy} from '../public/lib/playerCapacityStudy.js';
const person=(height=74,weight=225,legacy=false)=>{
 const p=ensurePlayerVisualIdentity({id:`capacity-${height}-${weight}`,name:'Capacity control',age:25,heightInches:height,weightLbs:weight,ratings:{speed:70,acceleration:70,agility:70,jumping:70,strength:70,stamina:70},profile:legacy?{regionalBodyShapeRecipe:{version:'regional-body-shape-v1',seed:`capacity-${height}-${weight}`}}:{}},{newPlayer:true});
 return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('resistance exercise retains bone lengths and floor contact through a complete rep at stature/mass extremes',()=>{
 for(const [height,weight]of[[62,160],[74,225],[86,350]]){
  const p=person(height,weight),before=JSON.stringify(p);
  for(let i=0;i<=100;i++){
   const pose=solvePlayerMotion(p,{mode:'strength',phase:i/100});
   assert.equal(pose.mode,'strength');assert.equal(pose.flight,false);
   for(const limb of pose.legs){assert.equal(limb.contact,true);assert.equal(limb.end.y,pose.floor-15);assert.ok(Math.abs(distance(limb.root,limb.joint)+distance(limb.joint,limb.end)-pose.legLength)<1e-7);}
   for(const limb of pose.arms)assert.ok(Math.abs(distance(limb.root,limb.joint)+distance(limb.joint,limb.end)-pose.armLength)<1e-7);
   assert.doesNotMatch(buildPlayerMotionSvg(p,{mode:'strength',phase:i/100,idSuffix:'control'}),/NaN|Infinity|undefined/);
  }
  assert.equal(JSON.stringify(p),before);
 }
});
test('endurance affects sustained cadence continuously without changing anatomy or baseline modes',()=>{
 const p=person(),before=JSON.stringify(p),profile=playerMovementProfile(p);
 const low={...p,ratings:{...p.ratings,stamina:40}},high={...p,ratings:{...p.ratings,stamina:99}};
 assert.deepEqual(enduranceStudy(low,profile,0),enduranceStudy(high,profile,0));
 assert.ok(enduranceStudy(low,profile,60).cadence<enduranceStudy(high,profile,60).cadence);
 for(const seconds of[8,60]){
  const a=enduranceStudy(low,profile,seconds-1e-6),b=enduranceStudy(low,profile,seconds+1e-6);
  assert.ok(Math.abs(a.cycles-b.cycles)<1e-5);
 }
 // The preserved fixture predates the v2 transverse rig. Keep its original
 // decoder; the current rig's exact 3D bones are checked separately.
 // Serialization normalizes negative zero.
 const legacy=person(74,225,true);
 for(const mode of ['run','jump','cut','acceleration'])for(const phase of [0,.2,.5,.9,1.2])assert.deepEqual(JSON.parse(JSON.stringify(solvePlayerMotion(legacy,{mode,phase}))),baseline(legacy,{mode,phase}));
 for(const phase of[0,.5,1,2]){
  const a=solvePlayerMotion(low,{mode:'endurance',phase}),b=solvePlayerMotion(high,{mode:'endurance',phase});
  assert.equal(a.legLength,b.legLength);assert.equal(a.armLength,b.armLength);assert.equal(a.mode,'endurance');
  assert.doesNotMatch(buildPlayerMotionSvg(low,{mode:'endurance',phase,idSuffix:'control'}),/NaN|Infinity|undefined/);
 }
 for(let seconds=10;seconds<65;seconds+=.37){
  const a=solvePlayerMotion(low,{mode:'endurance',phase:seconds/60}),b=solvePlayerMotion(low,{mode:'endurance',phase:(seconds+1e-5)/60});
  const stride=a.legLength*profile.strideFraction;
  for(let i=0;i<2;i++)if(a.legs[i].contact&&b.legs[i].contact){
   const position=pose=>pose.legs[i].end.x+pose.drill.cycles*stride/.58;
   assert.ok(Math.abs(position(a)-position(b))<1e-6,'planted foot stays fixed to belt while cadence changes');
  }
 }
 assert.equal(JSON.stringify(p),before);
});
