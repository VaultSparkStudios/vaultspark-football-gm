import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildHeadMesh3d} from '../public/lib/playerHead3d.js';
const source=fs.readFileSync(new URL('../docs/visual-qa/references/long-texture-before-2026-10-08/public__lib__playerHead3d.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const {buildHeadMesh3d:before}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
const mesh=(builder,a)=>builder(a,colors,{identitySeed:'fixed-long-texture',headOnly:true});
const points=(m,p)=>[...new Set(m.indices.subarray(p.firstIndex,p.firstIndex+p.indexCount))].map(i=>[...m.vertices.subarray(i*10,i*10+10)]);
test('continuous long-hair envelope changes without changing any skin, face, pigment or saved trait',()=>{
 const widths=[],falls=[];
 for(const position of [0,1,2,3]){
  const a={hairstyle:'long',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:position,hairDensity:.6,facialHair:'full-beard'},saved=structuredClone(a),old=mesh(before,a),next=mesh(buildHeadMesh3d,a);
  assert.deepEqual(a,saved);assert.deepEqual(next.anatomy,old.anatomy);assert.deepEqual(next.eyeDepths,old.eyeDepths);
  for(const part of next.parts.filter(p=>p.name!=='hair-lock-curtain'&&!p.name.startsWith('hair-lock-')))assert.deepEqual(points(next,part),points(old,old.parts.find(p=>p.name===part.name)),part.name);
  const locks=next.parts.filter(p=>/^hair-lock-\d+$/.test(p.name));
  assert.ok(locks.length>0);assert.ok(!next.parts.some(p=>p.name==='hair-lock-curtain'),'resolved locks replace the opaque sheet');
  const occupied=locks.flatMap(part=>points(next,part));
  widths.push(Math.max(...occupied.map(p=>Math.abs(p[0]))));falls.push(Math.min(...occupied.map(p=>p[1])));
  assert.ok(next.vertices.every(Number.isFinite));
 }
 // Resolved locks include the unchanged crown roots. Test distinctive occupied
 // bounds and broader curls, rather than the removed sheet's exact increments.
 assert.equal(new Set(widths.map(w=>w.toFixed(1))).size,4);
 assert.ok(widths[2]>widths[0]+4);assert.ok(widths[3]>widths[0]+4);
 assert.ok(falls[3]>falls[0]+15,'coily groomed envelope has shorter hanging extent');
});
test('loose locks attach to the saved scalp and close into a coherent groomed tip region',()=>{
 for(const hairTexturePosition of [0,1,2,3]){
  const m=mesh(buildHeadMesh3d,{hairstyle:'long',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition,hairDensity:.6});
  const scalp=points(m,m.parts.find(p=>p.name==='scalp-hair')),tips=[];
  for(const part of m.parts.filter(p=>/^hair-lock-\d+$/.test(p.name))){
   const ids=[...new Set(m.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount))].sort((a,b)=>a-b),first=ids[0],last=ids.at(-1);
   const point=i=>[...m.vertices.subarray(i*10,i*10+3)],root=point(first),tip=point(last);
   for(let i=0;i<5;i++){assert.deepEqual(point(first+i),root);assert.deepEqual(point(last-i),tip);}
   assert.ok(Math.min(...scalp.map(p=>Math.hypot(...root.map((x,i)=>x-p[i]))))<5.5,'root remains on the same sampled scalp');tips.push(tip[1]);
  }
  assert.ok(Math.max(...tips)-Math.min(...tips)<18,'ends share the groomed region rather than scattered crown-root offsets');
 }
});
test('all other continuous hairstyles retain the immediately preceding renderer exactly',()=>{
 for(const hairstyle of ['buzz','fade','crew','short-curls','coils','locs','braids','waves','side-part','swept','shaved','receding','afro']){
  const a={hairstyle,hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:2.4,hairDensity:.4};assert.deepEqual(mesh(buildHeadMesh3d,a),mesh(before,a),hairstyle);
 }
});
test('maximum loose long hair and full facial hair fit the head budget together',()=>{
 for(const headOnly of [true,false])for(const hairTexturePosition of [0,1,2,3]){
  const a={hairstyle:'long',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition,hairDensity:1,hairLength:2,hairStrandWidth:1.5,hairCurvature:1.45,hairWaveScale:1.5,hairStrandVariation:.5,facialHair:'full-beard'};
  const m=buildHeadMesh3d(a,colors,{identitySeed:'maximum-loose-long-and-beard',headOnly});
  assert.ok(m.vertices.every(Number.isFinite));assert.ok(m.vertices.length/10<65535);assert.ok(m.vertices.byteLength+m.indices.byteLength<1650000,`${headOnly} ${hairTexturePosition}: ${m.vertices.byteLength+m.indices.byteLength}`);
 }
});
