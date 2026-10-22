import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {torsoSurfacePath} from '../public/lib/torsoSurface.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {buildPlayerPhysiqueSvg,buildPlayerMotionSvg} from '../public/lib/playerPortrait.js';
import {solvePlayerMotion} from '../public/lib/playerMotion.js';
const make=(height=74,weight=225)=>{
 const p=ensurePlayerVisualIdentity({id:'torso-control',age:24,heightInches:height,weightLbs:weight,ratings:{speed:85,acceleration:80,jumping:75,agility:70,strength:80},profile:{regionalBodyShapeRecipe:{version:'regional-body-shape-v1',seed:'torso-control'}}},{newPlayer:true});
 return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
const torso=s=>s.match(/<path class="player-torso-surface"[^>]*>/)?.[0];
const attr=(s,key)=>Number(s.match(new RegExp(`data-${key}="([^"]+)"`))[1]);
const pathD=s=>s.match(/\bd="([^"]+)"/)[1];
const cubic=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
const drawnSections=s=>{
 const m=pathD(s).match(/Q[-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+) C([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) H([-\d.]+) C([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Q/);
 assert.ok(m,'actual chest/waist sidewalls present');
 const [,leftTop,top,l1x,l1y,l2x,l2y,leftBottom,bottom,rightBottom,r2x,r2y,r1x,r1y,rightTop,rightY]=m.map(Number);
 assert.equal(top,rightY);
 const width=t=>cubic(rightTop,r1x,r2x,rightBottom,t)-cubic(leftTop,l1x,l2x,leftBottom,t);
 return {chest:rightTop-leftTop,waist:rightBottom-leftBottom,length:bottom-top,width,
  heightDerivative:t=>3*(1-t)**2*(l1y-top)+6*(1-t)*t*(l2y-l1y)+3*t*t*(bottom-l2y)};
};

test('actual curved torso sidewalls retain endpoint sections and reconstruct allocated volume',()=>{
 for(const height of [62,74,86])for(const weight of [140,225,400]){
  const p=make(height,weight),f=p.visualFrame;
  const front=torso(buildPlayerPhysiqueSvg(p)),side=torso(buildPlayerPhysiqueSvg(p,{view:'side'}));
  const drawnFront=drawnSections(front),drawnSide=drawnSections(side);
  const width=drawnFront.chest/6,depth=drawnSide.chest/6,length=drawnFront.length/6;
  const frontWaist=drawnFront.waist/6,sideWaist=drawnSide.waist/6;
  assert.ok(Math.abs(width-f.chestWidthInches)<.002);
  assert.ok(Math.abs(depth-f.chestDepthInches)<.002);
  assert.ok(Math.abs(frontWaist-f.chestWidthInches*f.waistRatio)<.002);
  assert.ok(Math.abs(sideWaist-f.chestDepthInches*f.waistRatio)<.002);
  let volume=0;
  for(let i=0;i<2000;i++){const t=(i+.5)/2000,w=drawnFront.width(t)/6,d=drawnSide.width(t)/6;assert.ok(w>0&&d>0);volume+=Math.PI/4*w*d*drawnFront.heightDerivative(t)/6/2000;}
  const quantizationBound=.002/width+.002/depth+.002/length+.002/frontWaist+.002/sideWaist;
  assert.ok(Math.abs(volume/f.torsoVolumeInches3-1)<quantizationBound);
  assert.ok(Math.abs(drawnFront.width(.25)-(drawnFront.chest+(drawnFront.waist-drawnFront.chest)*.25))>.1,'visible envelope must actually curve');
  assert.match(front,/data-envelope="volume-preserving-curve-v1"/);
 }
});

test('static and every moving projection share exact chest, waist and torso dimensions',()=>{
 for(const height of [62,74,86])for(const weight of [140,225,400])for(const mode of ['run','acceleration','jump','cut','strength','endurance'])for(const phase of [0,.18,.37,.75]){
  const p=make(height,weight);
  const view=mode==='cut'?'front':'side',a=torso(buildPlayerPhysiqueSvg(p,{view})),b=torso(buildPlayerMotionSvg(p,{mode,phase,idSuffix:'torso-proof'}));
  for(const key of ['chest','waist','torso-length'])assert.equal(attr(a,key),attr(b,key),`${mode}:${phase}:${key}`);
  assert.match(b,new RegExp(`data-projection="${view}"`));
 }
});

test('height and mass vary the visible envelope while athleticism and grooming cannot reshape it',()=>{
 const p=make(),before=structuredClone(p);
 const shape=q=>pathD(torso(buildPlayerPhysiqueSvg(q,{view:'side'})));
 assert.notEqual(shape(p),shape(make(74,330)));assert.notEqual(shape(p),shape(make(82,225)));
 const q={...p,ratings:{speed:40,acceleration:40,jumping:40,strength:99},appearance:{...p.appearance,dyedHairColor:'#80402d',complexion:.9}};
 assert.equal(shape(q),shape(p));
 for(const mode of ['run','acceleration','jump','cut'])assert.equal(pathD(torso(buildPlayerMotionSvg(p,{mode,phase:.37}))),pathD(torso(buildPlayerMotionSvg(q,{mode,phase:.37}))));
 assert.deepEqual(p,before);
});

test('invalid direct envelope inputs cannot emit malformed SVG',()=>{
 const good={length:130,chest:100,waist:80,neck:30};assert.ok(torsoSurfacePath(good));
 for(const bad of [{length:0},{chest:NaN},{waist:Infinity},{neck:-1},{x:NaN}])assert.equal(torsoSurfacePath({...good,...bad}),null);
});

test('matte torso resources are isolated in actual static and all six moving player instances',()=>{
 const p=make(),before=structuredClone(p),outputs=[];
 for(const idSuffix of ['first','second']){
  for(const view of ['front','side'])outputs.push(buildPlayerPhysiqueSvg(p,{view,idSuffix}));
  for(const mode of ['run','acceleration','jump','cut','strength','endurance'])outputs.push(buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:`${idSuffix}-${mode}`}));
 }
 const allIds=[];
 for(const svg of outputs){
  assert.match(svg,/data-torso-form="matte-cloth-v2"/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const m of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(m[1]),m[1]);
  allIds.push(...ids.filter(id=>id.includes('-torso-')));
 }
 assert.equal(new Set(allIds).size,allIds.length,'torso lighting stays isolated across separately named actual instances');
 assert.deepEqual(p,before);
});

test('modern training kit covers the same portion of the thigh in neutral and all moving views',()=>{
 for(const [h,w]of [[62,140],[74,225],[86,400]]){
  const p=make(h,w),before=structuredClone(p);
  for(const view of ['front','side']){
   const svg=buildPlayerPhysiqueSvg(p,{view}),count=[...svg.matchAll(/class="player-training-shorts"/g)].length;
   assert.equal(count,view==='front'?2:1);
   assert.match(svg,/stop-color="#466c80"/);
   if(view==='front')for(const m of svg.matchAll(/class="physique-leg"[^>]*fill="([^"]+)"/g))assert.match(m[1],/-skin\)/,'neutral legs expose saved skin rather than silver leggings');
  }
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.72]){
   const svg=buildPlayerMotionSvg(p,{mode,phase}),pose=solvePlayerMotion(p,{mode,phase});
   const shorts=[...svg.matchAll(/class="player-training-shorts" d="([^"]+)"/g)];assert.equal(shorts.length,2);
   for(const [i,m]of shorts.entries()){
    const center=m[1].match(/ Q([-\d.]+) ([-\d.]+) /);assert.ok(center);
    const limb=pose.legs[1-i],hem={x:Number(center[1]),y:Number(center[2])};
    const ratio=Math.hypot(hem.x-limb.root.x,hem.y-limb.root.y)/Math.hypot(limb.joint.x-limb.root.x,limb.joint.y-limb.root.y);
    assert.ok(Math.abs(ratio-.48)<.0002,'hem follows the actual posed hip-to-knee segment');
   }
  }
  assert.deepEqual(p,before);
 }
});

test('legacy static and moving renderers retain their exact saved appearance',async context=>{
 const dir='.cache/torso-envelope-before';if(!fs.existsSync(dir)){context.skip('Local preserved renderer evidence absent');return;}
 const load=async name=>{
  const source=fs.readFileSync(`${dir}/${name}.js.txt`,'utf8').replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(path.resolve('public/lib',s)).href}${q}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 };
 const oldStatic=await load('playerPortrait'),oldMotion=await load('playerMotion');
 for(const p of [make(62,140),make(74,225),make(86,400)]){
  delete p.appearance.fineFaceVersion;
  for(const view of ['front','side'])assert.equal(buildPlayerPhysiqueSvg(p,{view}),oldStatic.buildPlayerPhysiqueSvg(p,{view}));
  for(const mode of ['run','jump','acceleration','cut'])assert.equal(buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:'same'}),oldMotion.buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:'same'}));
 }
});
