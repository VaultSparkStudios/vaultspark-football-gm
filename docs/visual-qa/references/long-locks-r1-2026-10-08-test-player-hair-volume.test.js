import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildHeadMesh3d} from '../public/lib/playerHead3d.js';
const source=fs.readFileSync(new URL('../docs/visual-qa/references/player-hair-volume-before-2026-10-08.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const {buildHeadMesh3d:before}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
const make=(builder,a)=>builder(a,colors,{identitySeed:'fixed-volume-person',headOnly:true});
const points=(mesh,part)=>Array.from(new Set(mesh.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount))).map(i=>Array.from(mesh.vertices.subarray(i*10,i*10+10)));
const hair=part=>part.name==='scalp-hair'||part.name.startsWith('hair-lock-');

test('modern combed volume changes hair while preserving every non-hair surface and saved input',()=>{
 for(const hairstyle of ['side-part','swept','crew','long']){
  const a={hairstyle,hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:.6,hairPart:.3,hairDensity:.8,facialHair:'full-beard'},saved=structuredClone(a),old=make(before,a),next=make(buildHeadMesh3d,a);
  assert.deepEqual(a,saved);assert.deepEqual(next.anatomy,old.anatomy);assert.deepEqual(next.eyeDepths,old.eyeDepths);
  assert.notDeepEqual(points(next,next.parts.find(p=>p.name==='scalp-hair')),points(old,old.parts.find(p=>p.name==='scalp-hair')));
  for(const part of next.parts.filter(p=>!hair(p)))assert.deepEqual(points(next,part),points(old,old.parts.find(p=>p.name===part.name)),hairstyle+' '+part.name);
  if(hairstyle!=='long'){assert.deepEqual(next.indices,old.indices);assert.equal(next.vertices.length,old.vertices.length);}
  else assert.ok(next.parts.some(p=>p.name.startsWith('hair-lock-')),'long hair has rooted occupied locks');
 }
});

test('all hair styles retain legacy geometry and changed modern styles remain within the mesh budget',()=>{
 for(const hairstyle of ['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding']){
  const a={hairstyle,hairTexture:'wavy',hairDensity:.6};assert.deepEqual(make(buildHeadMesh3d,a),make(before,a));
  const current={...a,hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:1.5,hairDensity:1,hairLength:2,hairStrandWidth:1.5},m=make(buildHeadMesh3d,current);
  assert.ok(m.vertices.every(Number.isFinite));assert.ok(m.vertices.length/10<65535);assert.ok(m.vertices.byteLength+m.indices.byteLength<1650000);
  assert.deepEqual(m,make(buildHeadMesh3d,current));
 }
});

test('part location changes the modern hair volume without changing facial anatomy',()=>{
 const a={hairstyle:'side-part',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:.4,hairDensity:.8},left=make(buildHeadMesh3d,{...a,hairPart:.15}),right=make(buildHeadMesh3d,{...a,hairPart:.85});
 assert.notDeepEqual(points(left,left.parts.find(p=>p.name==='scalp-hair')),points(right,right.parts.find(p=>p.name==='scalp-hair')));
 for(const part of left.parts.filter(p=>!hair(p)))assert.deepEqual(points(left,part),points(right,right.parts.find(p=>p.name===part.name)));
});

test('modern asymmetric support joins actual rear mesh positions and normals at every row',()=>{
 for(const hairstyle of ['side-part','swept','long'])for(const hairPart of [.15,.85])for(const hairTexturePosition of [.6,2.4]){
  const mesh=make(buildHeadMesh3d,{hairstyle,hairPart,hairTexturePosition,hairTextureVersion:'continuous-hair-texture-v1',hairLength:2,hairDensity:1});
  const part=mesh.parts.find(p=>p.name==='scalp-hair'),base=mesh.indices[part.firstIndex];
  for(let row=0;row<=32;row++){
   const start=(base+row*81)*10,end=(base+row*81+80)*10;
   const distance=Math.hypot(...[0,1,2].map(k=>mesh.vertices[start+k]-mesh.vertices[end+k]));
   assert.ok(distance<.00001,`${hairstyle} row ${row} seam ${distance}`);
   if(row>0&&row<32)assert.ok(Math.hypot(...[3,4,5].map(k=>mesh.vertices[start+k]-mesh.vertices[end+k]))<.00001,`${hairstyle} row ${row} normal seam`);
  }
 }
});
