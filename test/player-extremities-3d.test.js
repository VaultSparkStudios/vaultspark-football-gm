import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildPlayerBodyMesh3d,createBodyDrawPlan} from '../public/lib/playerBody3d.js';import {createPlayerBodyAnimation3d} from '../public/lib/playerBodyAnimation3d.js';
import {inspectTriangleSolids} from '../test-support/appearance/triangleSolidVolume.js';import {estimatedPalmBreadth} from '../public/lib/playerHand.js';import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
const fixture=JSON.parse(await fs.readFile('test/fixtures/player-head-pole-case.json','utf8')).player;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('hands retain wrist, palm breadth and fingertip authority while soles retain footprint and floor contact',()=>{
 for(const [height,weight]of [[62,100],[62,650],[96,100],[96,650],[80,350]]){
  const p=structuredClone(fixture);p.heightInches=height;p.weightLbs=weight;p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);const saved=structuredClone(p),mesh=buildPlayerBodyMesh3d(p,{includeSkull:false}),f=p.visualFrame;
  for(let side=0;side<2;side++){
   const palm=mesh.parts.find(p=>p.name===`hand-${side}-palm`),middle=mesh.parts.find(p=>p.name===`hand-${side}-finger-1`),point=i=>Array.from(mesh.vertices.subarray(i*6,i*6+3));
   const start=palm.startVertex;
   assert.ok(Math.abs(distance(point(start),point(start+16))-f.armSections.at(-1)[1])<2e-5);
   assert.ok(Math.abs(distance(point(start+8),point(start+24))-f.armSections.at(-1)[2])<2e-5);
   assert.ok(Math.abs(distance(point(start+16*33),point(start+16*33+16))-estimatedPalmBreadth(f.handSizeInches,1))<2e-5);
   assert.ok(distance(point(middle.startVertex+24*25),mesh.pose.arms[side].hand)<2e-5);
   const sole=mesh.parts.find(p=>p.name===`foot-${side}-sole`),vertices=Array.from({length:sole.vertexCount},(_,i)=>point(sole.startVertex+i)),ankle=mesh.pose.legs[side].end;
   assert.ok(Math.abs(Math.min(...vertices.map(v=>v[1]))-(ankle[1]-2.5))<2e-5);
   assert.ok(Math.abs(Math.min(...vertices.map(v=>v[2]))-(ankle[2]-f.footLengthInches*.27))<2e-5);
   assert.ok(Math.abs(Math.max(...vertices.map(v=>v[2]))-(ankle[2]+f.footLengthInches*.73))<2e-5);
   const ranges=createBodyDrawPlan(mesh).filter(r=>r.firstIndex>=sole.firstIndex&&r.firstIndex<sole.firstIndex+sole.indexCount+192);assert.ok(ranges.some(r=>r.material==='sole'));
  }
  assert.equal(inspectTriangleSolids(mesh).allComponentsClosedOriented,true);assert.deepEqual(p,saved);
 }
});
test('new palm and footwear surfaces retain cached/reference correspondence and closed incidence through movement',()=>{
 const a=createPlayerBodyAnimation3d(fixture,{includeSkull:false}),vertices=a.update().vertices,indices=a.update().indices;
 for(const mode of ['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.4,.75]){
  const mesh=a.update({mode,phase}),direct=buildPlayerBodyMesh3d(fixture,{mode,phase,includeSkull:false});assert.equal(mesh.vertices,vertices);assert.equal(mesh.indices,indices);assert.deepEqual(mesh.parts,direct.parts);
  for(let i=0;i<vertices.length;i++)assert.ok(Math.abs(vertices[i]-direct.vertices[i])<2e-5);
  assert.equal(inspectTriangleSolids(mesh).allComponentsClosedOriented,true);
 }
 a.dispose();
});
