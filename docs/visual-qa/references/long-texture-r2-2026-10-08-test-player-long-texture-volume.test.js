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
  const curtain=points(next,next.parts.find(p=>p.name==='hair-lock-curtain'));
  widths.push(Math.max(...curtain.map(p=>Math.abs(p[0]))));falls.push(Math.min(...curtain.map(p=>p[1])));
  assert.ok(next.vertices.every(Number.isFinite));
 }
 assert.ok(widths[1]>widths[0]+2);assert.ok(widths[2]>widths[1]+4);assert.ok(widths[3]>widths[2]+1);
 assert.ok(falls[3]>falls[0]+15,'coily groomed envelope has shorter hanging extent');
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
