import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildHeadMesh3d} from '../public/lib/playerHead3d.js';
const source=fs.readFileSync(new URL('../docs/visual-qa/references/player-facial-hair-before-2026-10-08.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const {buildHeadMesh3d:before}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const acceptedSource=fs.readFileSync(new URL('../docs/visual-qa/references/person-material-2026-10-08-public-lib-playerHead3d.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
const {buildHeadMesh3d:acceptedBeforeSculpt}=await import('data:text/javascript;base64,'+Buffer.from(acceptedSource).toString('base64'));
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
const make=(builder,a)=>builder(a,colors,{identitySeed:'facial-hair-person',headOnly:true});
const beard=p=>p.name.startsWith('beard-')||p.name.startsWith('mustache-');
const digest=(mesh,part)=>{const data=new Float32Array(Array.from(new Set(mesh.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount))).flatMap(i=>Array.from(mesh.vertices.subarray(i*10,i*10+10))));return crypto.createHash('sha256').update(Buffer.from(data.buffer)).digest('hex');};
const styles=['clean','stubble','mustache','goatee','short-beard','full-beard'];

test('modern facial grooming preserves the saved person, every other mesh surface and the resource budget',()=>{
 for(const facialHair of styles){
  // The modern crown now has its own anatomy change and preservation tests.
  // This historical beard comparison retains the older crown on both sides.
  const a={facialPigmentVersion:'facial-pigment-v1',hairstyle:'afro',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:3,hairLength:2,hairDensity:1,hairStrandWidth:1.5,facialHair},saved=structuredClone(a),old=make(before,a),next=make(buildHeadMesh3d,a);
  assert.deepEqual(a,saved);assert.deepEqual(next.anatomy,old.anatomy);assert.deepEqual(next.eyeDepths,old.eyeDepths);assert.deepEqual(next.indices,old.indices);
  for(const part of next.parts.filter(p=>!beard(p)))assert.equal(digest(next,part),digest(old,old.parts.find(q=>q.name===part.name)),facialHair+' '+part.name);
  assert.ok(next.vertices.every(Number.isFinite));assert.ok(next.vertices.length/10<65535);assert.ok(next.vertices.byteLength+next.indices.byteLength<1650000);
 }
});

test('categorical facial pigment remains exact; frozen accepted modern grooming retains its historical preservation proof',()=>{
 for(const facialHair of styles)for(const fineFaceVersion of [undefined,'fine-face-v1']){
  const a={facialHair,fineFaceVersion,hairstyle:'side-part',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:.6};
  // The accepted crown/grooming milestone predates the deliberate modern
  // eye and face sculpt. Preserve its original byte comparison against the
  // immutable accepted source; current categorical faces still use production.
  // Current modern eyes and crown have separate attachment/preservation tests.
  const old=make(before,a),next=make(fineFaceVersion?acceptedBeforeSculpt:buildHeadMesh3d,a);
  if(!fineFaceVersion)assert.equal(crypto.createHash('sha256').update(Buffer.from(next.vertices.buffer)).digest('hex'),crypto.createHash('sha256').update(Buffer.from(old.vertices.buffer)).digest('hex'));
  else for(const part of next.parts.filter(p=>p.name!=='skin'&&!p.name.startsWith('scalp-')&&!p.name.startsWith('hair-')))assert.equal(digest(next,part),digest(old,old.parts.find(q=>q.name===part.name)),facialHair+' '+part.name);
  assert.deepEqual(next.indices,old.indices);assert.deepEqual(next.parts,old.parts);
 }
});

test('modern beard and relocated mustache vertices clear the actual curved lip mask',()=>{
 const step=(lo,hi,x)=>{const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
 for(const facialHair of ['mustache','goatee','short-beard','full-beard'])for(const faceLength of [.92,1.09])for(const lipWidth of [.85,1.15])for(const lipCurve of [-1,1]){
  const a={facialPigmentVersion:'facial-pigment-v1',fineFaceVersion:'fine-face-v1',hairstyle:'shaved',facialHair,faceLength,lipWidth,lipCurve,lipFullness:1.25,upperLipScale:1.4,lowerLipScale:1.4},m=make(buildHeadMesh3d,a);
  for(const part of m.parts.filter(beard))for(const i of new Set(m.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount))){
   const x=m.vertices[i*10],worldY=m.vertices[i*10+1],ratio=x/m.anatomy.mouthWidth;
   const y=141+((151-worldY)-141)/faceLength-204-lipCurve*ratio*ratio*2;
   const cupid=.66+.30*Math.exp(-(((Math.abs(ratio)-.26)/.23)**2));
   const height=4.5*1.25*1.4*.72*Math.sqrt(Math.max(0,1-ratio*ratio))*(y<0?cupid:1);
   const mask=(1-step(Math.max(0,height-.65),height+.25,Math.abs(y)))*(1-step(.88,1,Math.abs(ratio)));
   assert.ok(mask<.25,`${facialHair} ${part.name} lip mask ${mask}`);
  }
 }
});
