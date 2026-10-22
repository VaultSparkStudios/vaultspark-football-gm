import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {buildHeadMesh3d,headAnatomy3d,headPoint3d,eyeLidPoint3d,scalpNormal3d} from '../public/lib/playerHead3d.js';
const source=fs.readFileSync(new URL('../docs/visual-qa/references/player-crown-surface-before-2026-10-08.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const acceptedSource=fs.readFileSync(new URL('../docs/visual-qa/references/person-material-2026-10-08-public-lib-playerHead3d.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const accepted=await import('data:text/javascript;base64,'+Buffer.from(acceptedSource).toString('base64'));
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'},make=(m,a)=>m.buildHeadMesh3d(a,colors,{identitySeed:'crown-person',headOnly:true});
const digest=(m,p)=>crypto.createHash('sha256').update(Buffer.from(new Float32Array(Array.from(new Set(m.indices.subarray(p.firstIndex,p.firstIndex+p.indexCount))).flatMap(i=>Array.from(m.vertices.subarray(i*10,i*10+10)))).buffer)).digest('hex');
test('historical accepted crown retained exact lower face/eyes, and current sculpt preserves that crown',()=>{
 for(const faceLength of [.92,1.09])for(const faceWidth of [.88,1.10]){
  const a={fineFaceVersion:'fine-face-v1',faceLength,faceWidth},g=headAnatomy3d(a),old=before.headAnatomy3d(a);
  assert.equal(g.stations[1][1],g.width*.78);assert.equal(old.stations[1][1],old.width*.65);assert.deepEqual(g.stations.slice(2),old.stations.slice(2));
  // Matched tangents localize the change above108: sockets and lower face
  // retain the exact attachment surface used by the saved eyelids/globes.
  for(const ny of [109,130,141,150,163,180,204,228])for(const angle of [-1.4,-.5,0,.5,1.4])assert.deepEqual(accepted.headPoint3d(a,angle,141+(ny-141)*faceLength),before.headPoint3d(a,angle,141+(ny-141)*faceLength));
  for(const side of [-1,1])for(const lid of [-1,1])for(const blink of [0,.5,1])for(const u of [0,.25,.5,.75,1])for(const v of [0,.5,1])assert.deepEqual(accepted.eyeLidPoint3d(a,side,lid,u,v,blink),before.eyeLidPoint3d(a,side,lid,u,v,blink));
  for(const ny of [65,82,108,109,130,132])for(const angle of [-Math.PI,-1.4,-.5,0,.5,1.4,Math.PI])assert.deepEqual(headPoint3d(a,angle,141+(ny-141)*faceLength),accepted.headPoint3d(a,angle,141+(ny-141)*faceLength));
  assert.notDeepEqual(headPoint3d(a,0,141+(180-141)*faceLength),accepted.headPoint3d(a,0,141+(180-141)*faceLength));
 }
});
test('categorical older faces retain exact mesh across all supported hair and facial grooming',()=>{
 for(const hairstyle of ['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding'])for(const facialHair of ['clean','stubble','mustache','goatee','short-beard','full-beard']){
  // The old fixture mixed legacy faces with modern loose hair, whose long
  // locks were deliberately replaced after the crown milestone. Keep true
  // categorical hair against the original source, and mixed modern grooming
  // against its frozen accepted source. Neither frozen golden is rewritten.
  for(const [a,reference]of [[{hairstyle,facialHair,facialPigmentVersion:'facial-pigment-v1'},before],[{hairstyle,facialHair,facialPigmentVersion:'facial-pigment-v1',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:1.5},accepted]]){
   const current=make({buildHeadMesh3d},a),old=make(reference,a);
   const signature=m=>crypto.createHash('sha256').update(Buffer.from(m.vertices.buffer,m.vertices.byteOffset,m.vertices.byteLength)).update(Buffer.from(m.indices.buffer,m.indices.byteOffset,m.indices.byteLength)).update(JSON.stringify({...m,vertices:undefined,indices:undefined})).digest('hex');
   assert.equal(signature(current),signature(old),hairstyle+' '+facialHair+' '+(reference===before?'categorical':'modern grooming'));
  }
 }
});
test('modern crown grooming never changes the saved face or unrelated visible surfaces',()=>{
 const base={fineFaceVersion:'fine-face-v1',facialPigmentVersion:'facial-pigment-v1',hairstyle:'afro',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:3,hairLength:2,hairDensity:1,hairStrandWidth:1.5,facialHair:'clean'},clean=make({buildHeadMesh3d},base);
 for(const facialHair of ['clean','stubble','mustache','goatee','short-beard','full-beard']){
  const a={...base,facialHair},original=structuredClone(a),m=make({buildHeadMesh3d},a);assert.deepEqual(a,original);assert.deepEqual(m.anatomy,clean.anatomy);assert.deepEqual(m.eyeDepths,clean.eyeDepths);
  for(const p of m.parts.filter(p=>!p.name.startsWith('beard-')&&!p.name.startsWith('mustache-')))assert.equal(digest(m,p),digest(clean,clean.parts.find(q=>q.name===p.name)),facialHair+' '+p.name);
  assert.ok(m.vertices.every(Number.isFinite));assert.ok(m.vertices.length/10<65535);assert.ok(m.vertices.byteLength+m.indices.byteLength<1650000);
 }
});
test('rounded crown retains continuous station normals and bounded extreme modern hair',()=>{
 for(const faceLength of [.92,1.09])for(const faceWidth of [.88,1.10]){
  const a={fineFaceVersion:'fine-face-v1',faceLength,faceWidth},g=headAnatomy3d(a);
  for(const ny of [82,108])for(const angle of [-Math.PI,-1.2,0,1.2,Math.PI]){
   const y=141+(ny-141)*faceLength,left=scalpNormal3d(a,angle,y-.0001),right=scalpNormal3d(a,angle,y+.0001);
   assert.ok(Math.hypot(...left.map((v,i)=>v-right[i]))<.0001,`station ${ny} tangent joins`);
  }
 }
 for(const hairstyle of ['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding'])for(const hairTexturePosition of [0,3]){
  const a={fineFaceVersion:'fine-face-v1',hairstyle,hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition,hairDensity:1,hairLength:2,hairStrandWidth:1.5},m=make({buildHeadMesh3d},a);
  assert.ok(m.vertices.every(Number.isFinite));assert.ok(m.vertices.length/10<65535);assert.ok(m.vertices.byteLength+m.indices.byteLength<1650000);
 }
});
