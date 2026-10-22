import test from 'node:test';import assert from 'node:assert/strict';
import {buildHeadMesh3d,headAnatomy3d,headPoint3d,eyeLidPoint3d} from '../public/lib/playerHead3d.js';
import fs from 'node:fs/promises';
import {buildPlayerBodyMesh3d} from '../test-support/appearance/playerBody3d.js';
import {estimateTriangleUnionVolume,inspectTriangleSolids} from '../test-support/appearance/triangleSolidVolume.js';
const source=(await fs.readFile(new URL('../docs/visual-qa/references/player-head-before-pole-repair-2026-10-08.js',import.meta.url),'utf8')).replaceAll("from './","from '"+new URL('../public/lib/',import.meta.url).href);
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
test('modern top and bottom poles collapse to a single point at every angle and preserve measured skull span',()=>{
 for(const faceLength of[.92,1,1.09])for(const faceWidth of[.88,1,1.10]){
  const a={fineFaceVersion:'fine-face-v1',faceLength,faceWidth},g=headAnatomy3d(a);assert.deepEqual(g,before.headAnatomy3d(a));
  for(const y of[g.crownY,g.chinY])for(let i=0;i<=96;i++)assert.deepEqual(headPoint3d(a,(i/96-.5)*Math.PI*2,y),headPoint3d(a,0,y));
  for(const [rings,slices]of[[16,24],[32,48],[64,96]]){const m=buildHeadMesh3d(a,colors,{rings,slices,headOnly:true});for(const row of[0,rings]){const p=Array.from(m.vertices.subarray(row*(slices+1)*10,row*(slices+1)*10+3));for(let c=0;c<=slices;c++){const offset=(row*(slices+1)+c)*10;assert.deepEqual(Array.from(m.vertices.subarray(offset,offset+3)),p);assert.deepEqual(Array.from(m.vertices.subarray(offset+3,offset+6)),[0,row===0?1:-1,0]);}}assert.ok(m.vertices.every(Number.isFinite));}
 }
});
test('facial sculpt retains the pole collars and legacy decoding while modern lids still meet',()=>{
 for(const faceLength of[.92,1.09]){
  const a={fineFaceVersion:'fine-face-v1',faceLength},g=headAnatomy3d(a);
  for(const y of[g.crownY+faceLength,g.chinY-faceLength,g.crownY-2,g.chinY+2])for(const angle of[-Math.PI,-1,0,1,Math.PI])assert.deepEqual(headPoint3d(a,angle,y),before.headPoint3d(a,angle,y));
  // The subsequent face/eye overhaul deliberately changes modern relief and
  // upper opening. Keep the pole and legacy promises, rather than updating a
  // historical golden to disguise the new face as an unchanged one.
  assert.notDeepEqual(headPoint3d(a,0,180),before.headPoint3d(a,0,180));
  for(const side of[-1,1])for(const u of[0,.5,1])assert.deepEqual(eyeLidPoint3d(a,side,-1,u,0,1),eyeLidPoint3d(a,side,1,u,0,1));
  const legacy={faceLength};for(const side of[-1,1])for(const lid of[-1,1])for(const blink of[0,.5,1])for(const u of[0,.5,1])for(const v of[0,.5,1])assert.deepEqual(eyeLidPoint3d(legacy,side,lid,u,v,blink),before.eyeLidPoint3d(legacy,side,lid,u,v,blink));
 }
 for(const hairstyle of['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding']){const a={hairstyle,facialHair:'full-beard'};assert.deepEqual(buildHeadMesh3d(a,colors,{rings:16,slices:24}),before.buildHeadMesh3d(a,colors,{rings:16,slices:24}));}
});
test('previous negative skull ray is repaired without changing the ray estimator or measured pose',async()=>{
 const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/player-head-pole-case.json',import.meta.url),'utf8')),p=structuredClone(fixture.player),saved=structuredClone(p);
 for(const mode of['neutral','run','acceleration','cut','jump','strength','endurance']){
  const m=buildPlayerBodyMesh3d(p,{mode,phase:.4,bulkScale:fixture.bulkScale});assert.equal(inspectTriangleSolids(m).allComponentsClosedOriented,true);
  const r=estimateTriangleUnionVolume(m,{resolution:128});assert.equal(r.invalidRays,0,mode);assert.equal(r.negativeWindingRays,0,mode);
 }
 assert.deepEqual(p,saved);
});
