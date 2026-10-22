import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedPalmBreadth,playerHandMarkup} from '../public/lib/playerHand.js';
import {buildPlayerPhysiqueSvg} from '../public/lib/playerPortrait.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

const recipe=ensurePlayerVisualIdentity({id:'relaxed-hand',name:'Hand form',age:25,heightInches:75,weightLbs:240,armLengthInches:33,handSizeInches:10,handLengthInches:8,profile:{},ratings:{speed:75,strength:80,agility:70}},{newPlayer:true});
const dto=p=>({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
const values=(svg,key)=>[...svg.matchAll(new RegExp(`data-${key}="([^"]+)"`,'g'))].map(m=>Number(m[1]));
test('relaxed palms keep spread span separate from length and join the actual wrist section',()=>{
 for(const span of [6,9,12])for(const length of [24,48,60])for(const wristWidth of [8,16,24]){
  const width=estimatedPalmBreadth(span);
  const svg=playerHandMarkup({width,length,wristWidth,fill:'#a48467',shade:'#46362d'});
  assert.match(svg,/data-palm-authority="artistic-estimate"/);
  const d=svg.match(/<path d="([^"]+)"/)[1];
  assert.ok(d.startsWith(`M${-wristWidth/2} 0 `));
  assert.ok(d.endsWith(`${wristWidth/2} 0Z`));
  const nums=d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const ys=nums.filter((_,i)=>i%2===1);
  assert.equal(Math.max(...ys),length);
  assert.equal(Math.min(...ys),0);
  assert.ok(Math.abs(values(svg,'palm-breadth')[0]-width)<.0051);
 }
 for(const invalid of [NaN,Infinity,undefined,null])assert.ok(Number.isFinite(estimatedPalmBreadth(invalid)));
});
test('all views and six motion modes use the same palm estimate without changing measured fingertip reach',()=>{
 for(const span of [7,10,12])for(const handLengthInches of [7,9]){
  const p=dto({...recipe,handSizeInches:span,handLengthInches}),before=structuredClone(p);
  const expected=Math.round(estimatedPalmBreadth(span)*100)/100;
  for(const view of ['front','side']){
   const svg=buildPlayerPhysiqueSvg(p,{view});
   assert.ok(values(svg,'palm-breadth').every(v=>v===expected));
   assert.ok(values(svg,'hand-length').every(v=>v===handLengthInches*6));
   assert.equal(values(svg,'palm-breadth').length,view==='front'?2:1);
  }
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.71]){
   const pose=solvePlayerMotion(p,{mode,phase});
   assert.equal(pose.handLength,handLengthInches*6);
   for(const arm of pose.arms)assert.ok(Math.abs(Math.hypot(arm.hand.x-arm.end.x,arm.hand.y-arm.end.y)-pose.handLength)<.01);
   const svg=buildPlayerMotionSvg(p,{mode,phase});
   assert.deepEqual(values(svg,'palm-breadth'),[expected,expected]);
   assert.deepEqual(values(svg,'hand-length'),[handLengthInches*6,handLengthInches*6]);
  }
  assert.deepEqual(p,before);
 }
});
