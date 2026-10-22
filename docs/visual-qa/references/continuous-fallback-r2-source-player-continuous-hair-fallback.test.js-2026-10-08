import test from 'node:test';
import assert from 'node:assert/strict';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {continuousHairCoordinate,continuousHairStrandPath,continuousHairStrandUse} from '../public/lib/continuousHairTexture.js';
const p=ensurePlayerVisualIdentity({id:'continuous-fallback',age:28,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});
const appearance=playerAppearance(p),frame=playerFrame(p);
const paths=svg=>[...svg.matchAll(/\bd="([^"]+)"/g)].map(m=>m[1]);
const draw=(style,position,label)=>{const q={...p,appearance:{...appearance,hairstyle:style,hairTexturePosition:position,hairTexture:label},visualFrame:frame};return[buildPlayerPortraitSvg(q,{headOnly:true}),buildPlayerSideHead(q)];};
test('every modern loose-hair fallback uses the continuous coordinate independently of displayed texture label',()=>{
 for(const style of ['buzz','fade','waves','crew','short-curls','coils','afro','side-part','swept','long']){
  for(const position of [0,.5,1,1.5,2,2.5,3]){
   const a=draw(style,position,'straight'),b=draw(style,position,'coily');
   for(let i=0;i<2;i++)assert.deepEqual(paths(a[i]),paths(b[i]),style+' '+position+' projection '+i);
  }
  assert.notDeepEqual(paths(draw(style,.5,'wavy')[0]),paths(draw(style,2.5,'wavy')[0]),style+' must show coordinate variation');
 }
});
test('fallback paths retain topology and small coordinate changes across label boundaries',()=>{
 for(const style of ['buzz','crew','afro','side-part','long'])for(const boundary of [1,2]){
  const a=draw(style,boundary-.0001,'straight'),b=draw(style,boundary+.0001,'coily');
  for(let i=0;i<2;i++){
   const numbers=svg=>paths(svg).flatMap(d=>[...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0])));
   const x=numbers(a[i]),y=numbers(b[i]);assert.equal(x.length,y.length);
   let delta=0;for(let j=0;j<x.length;j++)delta=Math.max(delta,Math.abs(x[j]-y[j]));assert.ok(delta<.03,style+' '+boundary+' '+i+' '+delta);
  }
 }
});
test('arranged and absent hair conceal the continuous coordinate; malformed controls use bounded fallback',()=>{
 for(const style of ['locs','braids','shaved'])for(let i=0;i<2;i++)assert.deepEqual(paths(draw(style,0,'coily')[i]),paths(draw(style,3,'coily')[i]));
 for(const value of [null,undefined,NaN,Infinity,'2',{}]){const a={hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:value};assert.equal(continuousHairCoordinate(a),null);assert.equal(continuousHairStrandPath(a,0,0,10),null);}
 for(const position of [-1e30,1e30])assert.doesNotMatch(continuousHairStrandPath({...appearance,hairTexturePosition:position},0,0,10),/NaN|Infinity|undefined/);
 assert.deepEqual(playerAppearance(p),appearance);
});
test('instanced close and cropped fibers resolve their resources within the fallback document budget',()=>{
 for(const hairstyle of ['buzz','crew','afro','long','side-part']){
  const q={...p,appearance:{...appearance,hairstyle,hairTexturePosition:3,hairCurvature:1.45,hairWaveScale:1.5},visualFrame:frame};
  const svg=buildPlayerPortraitSvg(q,{headOnly:true}),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);assert.ok(Buffer.byteLength(svg)<1200000,hairstyle+' '+Buffer.byteLength(svg));
  const references=[...svg.matchAll(/<use[^>]* href="#([^"]+)"/g)].map(m=>m[1]);
  if(['buzz','crew','afro'].includes(hairstyle))assert.ok(references.length>1000);
  for(const id of references)assert.ok(ids.includes(id));
 }
});
test('instancing preserves direct strand geometry and endpoints without applying longitudinal residual twice',()=>{
 const points=d=>[...d.matchAll(/(?:M|L)(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 for(const position of [0,.5,1.5,2.5,3])for(const scale of [.5,.8,1,1.5]){
  const a={...appearance,hairTexturePosition:position},unit=points(continuousHairStrandPath(a,0,0,1)),direct=points(continuousHairStrandPath(a,5,7,10,scale));
  const use=continuousHairStrandUse('strand',5,7,10,scale),transform=use.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  assert.deepEqual(direct.at(-1),[5,17]);
  for(let i=0;i<unit.length;i++)for(let k=0;k<2;k++)assert.ok(Math.abs(unit[i][k]*transform[k+2]+transform[k]-direct[i][k])<.001);
 }
});
test('supported continuous saves without optional fine-face details retain nonempty fallback fibers',()=>{
 for(const version of ['portrait-identity-v2','portrait-identity-v3']){
  const person=structuredClone(p);person.profile.appearanceRecipe.version=version;delete person.profile.fineFaceRecipe;
  const natural=playerAppearance(person);
  for(const hairstyle of ['buzz','crew','afro']){
   const svg=buildPlayerPortraitSvg({...person,appearance:{...natural,hairstyle,hairTexturePosition:2.5},visualFrame:frame},{headOnly:true});
   assert.doesNotMatch(svg,/\bd=""/);
   if(version==='portrait-identity-v3'){assert.match(svg,/data-(?:close|cropped)-strands="true"/);assert.ok(paths(svg).length>300);}
   else {assert.match(svg,/class="portrait-scalp-hair"/);assert.ok(paths(svg).length>10);}
  }
 }
});
