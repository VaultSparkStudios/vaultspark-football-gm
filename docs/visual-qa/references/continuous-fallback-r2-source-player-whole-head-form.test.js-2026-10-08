import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {longHairFlowPath,longHairWave} from '../public/lib/longHairFlow.js';
import {croppedHairVolume} from '../public/lib/croppedHairVolume.js';
import {fineFaceEyeContours} from '../public/lib/fineFaceGeometry.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {HAIR_STYLE_RULES} from '../public/lib/portraitAppearanceContract.js';
const cubic=(p,t)=>p[0]*(1-t)**3+3*p[1]*(1-t)**2*t+3*p[2]*(1-t)*t*t+p[3]*t**3;

test('actual cubic hair paths follow continuous waves, including the tightest curls and reversed flow',()=>{
 for(const hairTexture of ['straight','wavy','curly','coily'])for(const hairCurvature of [.65,1,1.45])for(const hairWaveScale of [.65,1.5])for(const reverse of [false,true]){
  const a={hairTexture,hairCurvature,hairWaveScale},seed='curve-proof',fiber='flow:-1:17';
  const x0=90,x1=85,y0=reverse?225:112,y1=reverse?112:225;
  const d=longHairFlowPath(a,seed,fiber,x0,y0,x1,y1);
  assert.doesNotMatch(d,/[QL]|NaN|Infinity/);
  const values=[...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
  let p=values.splice(0,2),previous=null;
  const count=values.length/6;
  assert.ok(count>=24&&count<=125,'bounded sampling cost');
  for(let i=0;i<count;i++){
   const [cx1,cy1,cx2,cy2,x,y]=values.slice(i*6,i*6+6);
   if(previous)assert.ok(Math.abs((cx1-p[0])/(cy1-p[1])-previous)<.002,'C1 continuity at shared endpoints');
   for(const t of [.25,.5,.75]){
    const actualX=cubic([p[0],cx1,cx2,x],t),actualY=cubic([p[1],cy1,cy2,y],t);
    const progress=(actualY-y0)/(y1-y0);
    const expectedX=x0+(x1-x0)*progress+longHairWave(a,seed,fiber,progress);
    assert.ok(Math.abs(actualX-expectedX)<.04,`${hairTexture}: actual curve deviates from wave`);
   }
   previous=(x-cx2)/(y-cy2);p=[x,y];
  }
  assert.ok(Math.abs(p[0]-(x1+longHairWave(a,seed,fiber,1)))<.0001);
  assert.equal(p[1],y1);
 }
});

test('grouped cropped locks share bounded recipe controls without changing the saved person',()=>{
 const p=ensurePlayerVisualIdentity({id:'cropped-volume',age:27,heightInches:76,weightLbs:260,profile:{}},{newPlayer:true});
 const a={...playerAppearance(p),hairstyle:'afro',hairTexture:'coily',hairTexturePosition:3},before=structuredClone(a);
 const options={id:'locks',clip:'scalp',x:72,y:20,width:177,height:123};
 const original=croppedHairVolume(a,'seed',options);
 assert.match(original,/data-hair-volume="grouped-locks-v1"/);
 assert.equal([...original.matchAll(/<path /g)].length,45);
 assert.notEqual(original,croppedHairVolume({...a,hairCurvature:.65},'seed',options));
 assert.notEqual(original,croppedHairVolume({...a,hairTexture:'straight',hairTexturePosition:0},'seed',options));
 assert.equal(croppedHairVolume({...a,fineFaceVersion:undefined},'seed',options),'');
 for(const key of ['hairCurvature','hairWaveScale'])for(const value of [NaN,Infinity,null,{},-1e30,1e30])assert.doesNotMatch(croppedHairVolume({...a,[key]:value},'seed',options),/NaN|Infinity|undefined/);
 assert.deepEqual(a,before);
});

test('legacy eye apertures expose pigment with fixed width, joined corners and increasing clear opening',()=>{
 const a={fineFaceVersion:'fine-face-v1',detailVersion:'natural-appearance-detail-v1'};
 for(const side of [-1,1]){
  let previousGap=0,previousForm=null;
  for(const eyeAperture of [.7,.85,1,1.2]){
   const form=fineFaceEyeContours({...a,eyeAperture},134,141,side);
   const points=path=>path.match(/-?\d+(?:\.\d+)?/g).map(Number),upper=points(form.upper),lower=points(form.lower);
   assert.equal(Math.abs(upper[0]-upper[6]),21,'saved lateral eye width stays fixed');
   assert.deepEqual(upper.slice(6),lower.slice(0,2),'outer corner meets');
   assert.deepEqual(lower.slice(6),upper.slice(0,2),'inner corner meets');
   const top=cubic([upper[1],upper[3],upper[5],upper[7]],.5),bottom=cubic([lower[1],lower[3],lower[5],lower[7]],.5),gap=bottom-top;
   assert.ok(top<138&&bottom>142,'opening has room above and below the eye center');
   assert.ok(gap>4&&gap<12,'bounded clear opening remains legible without a round stare');
   assert.ok(gap>previousGap,'larger aperture actually increases the clear opening');
   assert.match(form.shape,/Z$/);
   if(previousForm)assert.notEqual(form.shape,previousForm);
   previousGap=gap;previousForm=form.shape;
  }
 }
});

test('every legacy style and texture retains exact immediate-baseline front and profile output',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/whole-head-legacy-hashes.json',import.meta.url),'utf8'));
 const sha=svg=>crypto.createHash('sha256').update(svg).digest('hex');
 const historical=JSON.parse(fs.readFileSync(new URL('./fixtures/whole-head-legacy-inputs.json',import.meta.url),'utf8'));
 assert.equal(sha(fs.readFileSync(new URL('./fixtures/whole-head-legacy-hashes.json',import.meta.url))),historical.historicalAuthority.renderExpectationsSha256,'original render expectations remain unchanged');
 assert.equal(historical.inputs.length,4);
 let count=0;
 for(const version of ['portrait-identity-v2','portrait-identity-v3'])for(const detail of [false,true])for(const [hairstyle,rule]of Object.entries(HAIR_STYLE_RULES))for(const hairTexture of rule.textures){
  // Current new-player defaults evolve; this regression checks actual saved
  // historical recipes against their original hashes, not a newly born player.
  const input=historical.inputs.find(row=>row.version===version&&row.detail===detail);
  assert.ok(input,'historical saved input exists');
  const p=structuredClone(input.player),before=structuredClone(p);
  assert.deepEqual(playerAppearance(p),input.decodedAppearance,'legacy appearance decoder stays exact');
  assert.deepEqual(playerFrame(p),input.decodedFrame,'legacy measured-frame decoder stays exact');
  p.appearance={...playerAppearance(p),hairstyle,hairTexture};p.visualFrame=playerFrame(p);
  const expected=fixture.cases.find(row=>row.version===version&&row.detail===detail&&row.hairstyle===hairstyle&&row.hairTexture===hairTexture);
  assert.ok(expected,'baseline case exists');
  assert.equal(sha(buildPlayerPortraitSvg(p)),expected.front,`${version}/${detail}/${hairstyle}/${hairTexture}`);
  assert.equal(sha(buildPlayerSideHead(p)),expected.side);
  delete p.appearance;delete p.visualFrame;assert.deepEqual(p,before,'rendering preserves the raw saved input');count+=2;
 }
 assert.equal(count,384);
});
