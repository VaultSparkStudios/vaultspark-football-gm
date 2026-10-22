import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createTorsoProfile,sampleTorsoProfile} from '../public/lib/playerTorsoSurface3d.js';
import {buildPlayerBodyMesh3d,armSleeveDrawRanges} from '../public/lib/playerBody3d.js';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
import {inspectTriangleSolids} from '../test-support/appearance/triangleSolidVolume.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/player-head-pole-case.json',import.meta.url),'utf8'));
test('torso landmark interpolation is exact, bounded and tangent continuous for changing regional build',()=>{
 for(const sections of [[[0,25,16],[.28,26,17],[.65,22,19],[1,24,15]],[[0,10,5],[.3,9,8],[.7,12,4],[1,8,6]],[[0,40,30],[.28,40,30],[.65,40,30],[1,40,30]]]){
  const profile=createTorsoProfile(sections,24,5);
  for(const [y,w,d]of profile.rows)assert.deepEqual(sampleTorsoProfile(profile,y),[w,d]);
  for(let i=1;i<profile.rows.length;i++)for(let k=0;k<=100;k++){
   const a=profile.rows[i-1],b=profile.rows[i],v=sampleTorsoProfile(profile,a[0]+(b[0]-a[0])*k/100);
   v.forEach((value,j)=>assert.ok(value>=Math.min(a[j+1],b[j+1])-1e-10&&value<=Math.max(a[j+1],b[j+1])+1e-10));
  }
  for(const [y]of profile.rows.slice(1,-1)){
   const e=1e-5,a=sampleTorsoProfile(profile,y-e),b=sampleTorsoProfile(profile,y),c=sampleTorsoProfile(profile,y+e);
   for(let j=0;j<2;j++)assert.ok(Math.abs((b[j]-a[j])/e-(c[j]-b[j])/e)<.001);
  }
 }
 assert.throws(()=>createTorsoProfile([[0,2,3],[1,-1,3]],20,4),/Invalid/);
});
test('actual body emits one closed torso with exact source landmark rings and no internal shoulder cap',()=>{
 const p=structuredClone(fixture.player),saved=structuredClone(p),mesh=buildPlayerBodyMesh3d(p,{includeSkull:false}),part=mesh.parts.find(p=>p.name==='torso');
 assert.ok(!mesh.parts.some(p=>p.name.startsWith('shoulder-yoke')));
 assert.equal(inspectTriangleSolids(mesh).allComponentsClosedOriented,true);
 const f=p.visualFrame;
 for(const [i,[t,w,d]]of f.torsoSections.entries()){
  const row=(i+1)*12,start=(part.startVertex+row*33)*6;
  const left=Array.from(mesh.vertices.subarray(start+16*6,start+16*6+3)),right=Array.from(mesh.vertices.subarray(start,start+3)),front=Array.from(mesh.vertices.subarray(start+8*6,start+8*6+3)),back=Array.from(mesh.vertices.subarray(start+24*6,start+24*6+3));
  assert.ok(Math.abs(Math.hypot(...left.map((v,k)=>v-right[k]))-w)<2e-5);
  assert.ok(Math.abs(Math.hypot(...front.map((v,k)=>v-back[k]))-d)<2e-5);
  const center=right.map((v,k)=>(v+left[k])/2),expected=mesh.pose.shoulder.map((v,k)=>v+(mesh.pose.hip[k]-v)*t);
  center.forEach((v,k)=>assert.ok(Math.abs(v-expected[k])<2e-5));
 }
 assert.deepEqual(p,saved);
});
test('short sleeves follow source topology and cannot recolor a folded distal forearm',()=>{
 const p=structuredClone(fixture.player);p.heightInches=62;p.weightLbs=650;p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
 const mesh=buildPlayerBodyMesh3d(p,{includeSkull:false,mode:'jump',phase:0});
 for(const sweep of mesh.sweeps.filter(s=>s.kind==='arm')){
  const part=mesh.parts.find(p=>p.name===sweep.name),ranges=armSleeveDrawRanges(part,sweep),{times,columns,joint}=sweep.recipe;
  assert.equal(ranges.reduce((s,r)=>s+r.indexCount,0),part.indexCount);
  assert.equal(ranges[1].firstIndex,ranges[0].firstIndex+ranges[0].indexCount);
  const lastKitRow=ranges[0].indexCount/(columns*6);assert.ok(times[lastKitRow]<=joint*.26);assert.ok(times[lastKitRow+1]>joint*.26);
  const distal=times.findIndex(t=>t>=joint),distalIndex=part.firstIndex+distal*columns*6;assert.ok(distalIndex>=ranges[1].firstIndex&&distalIndex<ranges[1].firstIndex+ranges[1].indexCount);assert.equal(ranges[1].kit,false);
  assert.equal(ranges[2].kit,true);assert.equal(ranges[3].kit,false);
 }
});
