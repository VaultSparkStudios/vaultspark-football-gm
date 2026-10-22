import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {profiledLimbSurface} from '../public/lib/profiledLimbSurface.js';
import {buildPlayerPhysiqueSvg} from '../public/lib/playerPortrait.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

// Independently inspect the emitted cubic curves, rather than asserting the
// control function against itself. Vertical reference bones make y the axis.
const curves=d=>{
 const tokens=[...d.matchAll(/([MLC])([^MLCZ]*)/g)];let current;
 const sides=[[],[]];let side=0;
 for(const [,command,raw]of tokens){const v=raw.trim().split(/[ ,]+/).map(Number);
  if(command==='M')current=v;
  else if(command==='L'){current=v;side=1;}
  else {const segment=[current,...[0,2,4].map(i=>v.slice(i,i+2))];sides[side].push(segment);current=v.slice(4,6);}
 }
 const at=(side,y)=>{
  const c=sides[side].find(s=>y>=Math.min(s[0][1],s[3][1])-1e-8&&y<=Math.max(s[0][1],s[3][1])+1e-8);
  assert.ok(c,'sample is on an actual cubic');const t=(y-c[0][1])/(c[3][1]-c[0][1]);
  return (1-t)**3*c[0][0]+3*(1-t)**2*t*c[1][0]+3*(1-t)*t*t*c[2][0]+t**3*c[3][0];
 };
 return y=>{const a=at(0,y),b=at(1,y);return {width:Math.abs(a-b),center:(a+b)/2};};
};
const dto=(height=74,weight=225)=>{
 // This component's original pose-preservation claim is for its v1 decoder.
 // The current regional v2 rig has separate endpoint/3D tests.
 const p=ensurePlayerVisualIdentity({id:'contour-person',heightInches:height,weightLbs:weight,age:24,ratings:{speed:85,acceleration:80,agility:75,jumping:70,strength:80,stamina:70},profile:{regionalBodyShapeRecipe:{version:'regional-body-shape-v1',seed:'contour-person'}}},{newPlayer:true});
 return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
const previous=async file=>{
 const source=fs.readFileSync(`.cache/limb-contour-before/${file}.js`,'utf8').replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(path.resolve('public/lib',s)).href}${q}`);
 return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

test('actual asymmetric cubic surfaces preserve cross-sections, volume and joint/terminal centers',()=>{
 for(const kind of ['arm','leg'])for(const joint of [.45,.53,.58])for(const variation of [-.12,0,.12]){
  const args=[{x:0,y:0},{x:0,y:100},10,kind,variation,[0,1],joint];
  const old=curves(profiledLimbSurface(...args)),left=curves(profiledLimbSurface(...args,1)),right=curves(profiledLimbSurface(...args,-1));
  let oldVolume=0,newVolume=0,displacement=0;
  for(let i=0;i<1000;i++){const y=(i+.5)/10,a=old(y),b=left(y),c=right(y);
   assert.ok(Math.abs(a.width-b.width)<.022);assert.ok(Math.abs(b.width-c.width)<.022);
   assert.ok(Math.abs(b.center+c.center)<.011);assert.ok(b.width>0);
   oldVolume+=a.width**2;newVolume+=b.width**2;displacement+=Math.abs(b.center);
  }
  assert.ok(Math.abs(newVolume/oldVolume-1)<.0015);assert.ok(displacement/1000>.3,'actual outline moves visibly away from symmetry');
  for(const y of [0,joint*100,100])assert.ok(Math.abs(left(y).center)<.011,'recorded centers remain anchored');
 }
});

test('bent upper/lower surfaces keep exact root, joint and end attachments',()=>{
 for(const kind of ['arm','leg'])for(const split of [.45,.53,.58])for(const direction of [-1,1]){
  const points=[{x:50,y:20},{x:28,y:75},{x:65,y:121}];
  for(const [root,end,range]of [[points[0],points[1],[0,split]],[points[1],points[2],[split,1]]]){
   const d=profiledLimbSurface(root,end,16,kind,0,range,split,direction),sides=[...d.matchAll(/([MLC])([^MLCZ]*)/g)];
   const start=sides[0][2].trim().split(/[ ,]+/).map(Number),last=sides.at(-1)[2].trim().split(/[ ,]+/).map(Number).slice(-2);
   const turn=sides.find(s=>s[1]==='L')[2].trim().split(/[ ,]+/).map(Number);
   const endOnFirst=sides[sides.findIndex(s=>s[1]==='L')-1][2].trim().split(/[ ,]+/).map(Number).slice(-2);
   for(const [a,b,expected]of [[start,last,root],[turn,endOnFirst,end]]){
    assert.ok(Math.abs((a[0]+b[0])/2-expected.x)<.011);assert.ok(Math.abs((a[1]+b[1])/2-expected.y)<.011);
   }
  }
 }
});

test('actual static/moving surfaces change without changing the saved frame, appearance or solved poses',async context=>{
 if(!fs.existsSync('.cache/limb-contour-before/playerPortrait.js')){context.skip('Immediate pre-change renderer is local evidence only.');return;}
 const oldStatic=await previous('playerPortrait'),oldMotion=await previous('playerMotion');
 for(const [h,w]of [[62,140],[74,225],[86,400]]){
  const p=dto(h,w),before=structuredClone(p);
  for(const view of ['front','side']){
   const current=buildPlayerPhysiqueSvg(p,{view,idSuffix:'same'}),old=oldStatic.buildPlayerPhysiqueSvg(p,{view,idSuffix:'same'});
   assert.notEqual(current,old);assert.doesNotMatch(current,/NaN|Infinity|undefined/);
  }
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.75]){
   assert.notEqual(buildPlayerMotionSvg(p,{mode,phase,idSuffix:'same'}),oldMotion.buildPlayerMotionSvg(p,{mode,phase,idSuffix:'same'}));
   assert.deepEqual(solvePlayerMotion(p,{mode,phase}),oldMotion.solvePlayerMotion(p,{mode,phase}));
  }
  assert.deepEqual(p,before);
 }
});

test('legacy renderings and unspecified contour calls remain byte-identical to immediate baseline',async context=>{
 if(!fs.existsSync('.cache/limb-contour-before/playerPortrait.js')){context.skip('Immediate pre-change renderer is local evidence only.');return;}
 const oldStatic=await previous('playerPortrait'),oldMotion=await previous('playerMotion'),oldSurface=await previous('profiledLimbSurface');
 for(const joint of [undefined,.45,.58])for(const kind of ['arm','leg']){
  const args=[{x:28,y:17},{x:45,y:71},22,kind,.12,[.53,1],joint];
  assert.equal(profiledLimbSurface(...args),oldSurface.profiledLimbSurface(...args));
  assert.equal(profiledLimbSurface(...args,NaN),oldSurface.profiledLimbSurface(...args));
 }
 for(const [h,w]of [[62,140],[74,225],[86,400]]){
  const p=dto(h,w);delete p.appearance.fineFaceVersion;
  for(const view of ['front','side'])assert.equal(buildPlayerPhysiqueSvg(p,{view,idSuffix:'same'}),oldStatic.buildPlayerPhysiqueSvg(p,{view,idSuffix:'same'}));
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.75])assert.equal(buildPlayerMotionSvg(p,{mode,phase,idSuffix:'same'}),oldMotion.buildPlayerMotionSvg(p,{mode,phase,idSuffix:'same'}));
 }
});
