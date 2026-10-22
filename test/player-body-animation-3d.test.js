import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createPlayerBodyAnimation3d} from '../test-support/appearance/playerBodyAnimation3d.js';
import {buildPlayerBodyMesh3d} from '../test-support/appearance/playerBody3d.js';
import {inspectTriangleSolids} from '../test-support/appearance/triangleSolidVolume.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/player-head-pole-case.json',import.meta.url),'utf8'));
const modes=['neutral','run','acceleration','cut','jump','strength','endurance'];
test('cached body articulates one constructed mesh through measured poses with bounded reference error',()=>{
 const p=structuredClone(fixture.player),saved=structuredClone(p),animation=createPlayerBodyAnimation3d(p,{bulkScale:fixture.bulkScale});
 const rest=animation.update(),neutral=rest.vertices.slice(),vertices=rest.vertices,indices=rest.indices,parts=rest.parts;
 let maxPositionError=0,maxNormalError=0;
 for(const mode of modes)for(const phase of[0,.17,.4,.75,.99]){
  const cached=animation.update({mode,phase}),built=buildPlayerBodyMesh3d(p,{mode,phase,bulkScale:fixture.bulkScale});
  assert.equal(cached.vertices,vertices);assert.equal(cached.indices,indices);assert.equal(cached.parts,parts);assert.deepEqual(cached.pose,built.pose);
  for(let i=0;i<vertices.length;i+=6){
   for(let j=0;j<3;j++){maxPositionError=Math.max(maxPositionError,Math.abs(vertices[i+j]-built.vertices[i+j]));maxNormalError=Math.max(maxNormalError,Math.abs(vertices[i+3+j]-built.vertices[i+3+j]));}
   assert.ok(Math.abs(Math.hypot(...vertices.subarray(i+3,i+6))-1)<2e-6);
  }
 }
 assert.ok(maxPositionError<2e-5,'rigid articulation reproduces construction positions: '+maxPositionError);
 assert.ok(maxNormalError<2e-4,'part-local normals reproduce construction including singular centers: '+maxNormalError);
 assert.deepEqual(animation.update().vertices,neutral);assert.deepEqual(p,saved);assert.equal(animation.diagnostics.constructionCount,1);
});
test('rigid component volumes and closed incidence survive articulation; union invariance is not claimed',()=>{
 const animation=createPlayerBodyAnimation3d(fixture.player,{bulkScale:fixture.bulkScale}),rest=inspectTriangleSolids(animation.update());
 for(const mode of modes)for(const phase of[0,.4,.75]){
  const posed=inspectTriangleSolids(animation.update({mode,phase}));assert.equal(posed.allComponentsClosedOriented,true,mode);
  for(let i=0;i<rest.solids.length;i++)assert.ok(Math.abs(posed.solids[i].signedVolume/rest.solids[i].signedVolume-1)<1e-4,mode+' '+rest.solids[i].name);
 }
 assert.equal(animation.diagnostics.wholeUnionMassVerified,false);
});
test('physical-state and capacity changes invalidate cached person authority; disposal is final',()=>{
 const p=structuredClone(fixture.player),animation=createPlayerBodyAnimation3d(p),initial=animation.update().vertices.slice();assert.ok(animation.matchesPlayer(p));
 for(const change of[q=>q.visualFrame.torsoSections[0][1]+=.2,q=>q.appearance.eyeColor='#abcdef',q=>q.ratings.speed++]){const q=structuredClone(p);change(q);assert.equal(animation.matchesPlayer(q),false);}
 p.ratings.speed=40;assert.equal(animation.matchesPlayer(p),false);assert.deepEqual(animation.update().vertices,initial);
 animation.dispose();animation.dispose();assert.throws(()=>animation.update(),/Disposed/);assert.throws(()=>animation.matchesPlayer(p),/Disposed/);
 assert.equal(createPlayerBodyAnimation3d({...p,visualFrame:null}),null);
});
test('singular cap and joint normals follow bone axes without changing prior vertex positions or topology',async()=>{
 const source=(await fs.readFile(new URL('../docs/visual-qa/references/body-animation-source-1-playerBody3d.js-2026-10-08',import.meta.url),'utf8')).replaceAll("from '../../public/lib/","from '"+new URL('../public/lib/',import.meta.url).href);
 const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const direction=(a,b)=>{const d=b.map((v,i)=>v-a[i]),n=Math.hypot(...d);return d.map(v=>v/n);};
 for(const mode of modes){
  const options={mode,phase:.4,bulkScale:fixture.bulkScale},mesh=buildPlayerBodyMesh3d(fixture.player,options),old=before.buildPlayerBodyMesh3d(fixture.player,options);
  assert.deepEqual(mesh.indices,old.indices);assert.deepEqual(mesh.parts,old.parts);assert.deepEqual(mesh.pose,old.pose);
  for(let i=0;i<mesh.vertices.length;i+=6)assert.deepEqual(mesh.vertices.subarray(i,i+3),old.vertices.subarray(i,i+3));
  for(const kind of['arm','leg'])for(const[i,l]of mesh.pose[kind==='arm'?'arms':'legs'].entries()){
   for(const[name,start,end]of[['upper',l.root,l.joint],['lower',l.joint,l.end]])for(const[label,sign]of[['start',-1],['end',1]]){
    const part=mesh.parts.find(p=>p.name===`${kind}-${i}-${name}-${label}`),offset=part.startVertex*6,expected=direction(start,end).map(v=>v*sign);
    for(let j=0;j<3;j++)assert.ok(Math.abs(mesh.vertices[offset+3+j]-expected[j])<1e-6,mode+' '+part.name);
   }
   const joint=mesh.parts.find(p=>p.name===`${kind}-${i}-joint`),expected=direction(l.root,l.end);
   for(let j=0;j<3;j++)assert.ok(Math.abs(mesh.vertices[joint.startVertex*6+3+j]-expected[j])<1e-6,mode+' '+joint.name);
  }
 }
});
