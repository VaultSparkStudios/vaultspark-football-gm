import test from 'node:test';
import assert from 'node:assert/strict';
import {profiledLimbSurface,roundedLimbRootSurface,limbProfileSample} from '../public/lib/profiledLimbSurface.js';
import {torsoSurfacePath,torsoSurfaceMarkup} from '../public/lib/torsoSurface.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
import {buildPlayerPhysiqueSvg} from '../public/lib/playerPortrait.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {projectedLimbSections,neutralMeasuredPose} from '../public/lib/physiqueGeometryContract.js';

test('rounded proximal cap retains section core and follows the actual bone under rotation',()=>{
 for(const angle of[0,.31,1.2,2.5,Math.PI,4.8])for(const diameter of[8,24,65]){
  const root={x:71,y:103},end={x:71+90*Math.cos(angle),y:103+90*Math.sin(angle)},split=.53;
  const args=[root,end,diameter,'arm',0,[0,split],split,-1];
  const core=profiledLimbSurface(...args),surface=roundedLimbRootSurface(...args);
  assert.ok(surface.startsWith(core.slice(0,-1)),'all allocated section cubics stay exact');
  const caps=[...surface.slice(core.length-1).matchAll(/C([^CZ]+)/g)].map(m=>m[1].trim().split(/\s+/).map(Number));
  assert.equal(caps.length,2);
  const radius=diameter*limbProfileSample('arm',0,0,split).ratio/2;
  const [apexX,apexY]=caps[0].slice(-2);
  assert.ok(Math.abs((apexX-root.x)*Math.cos(angle)+(apexY-root.y)*Math.sin(angle)+radius*.55)<.015);
  assert.ok(Math.abs(-(apexX-root.x)*Math.sin(angle)+(apexY-root.y)*Math.cos(angle))<.015);
  // Independently sample the cap, close through its proximal section and
  // compare its planar area with a half ellipse. This is not 3D union mass.
  const current={x:root.x-Math.sin(angle)*radius,y:root.y+Math.cos(angle)*radius},points=[current];
  for(const curve of caps){const a=points.at(-1);for(let i=1;i<=200;i++){
   const t=i/200,u=1-t;points.push({x:u**3*a.x+3*u*u*t*curve[0]+3*u*t*t*curve[2]+t**3*curve[4],y:u**3*a.y+3*u*u*t*curve[1]+3*u*t*t*curve[3]+t**3*curve[5]});
  }}
  const area=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  assert.ok(Math.abs(area/(Math.PI*radius*radius*.55/2)-1)<.009);
  assert.equal(roundedLimbRootSurface(root,end,diameter,'arm',0,[split,1],split),profiledLimbSurface(root,end,diameter,'arm',0,[split,1],split),'no cap at an articulated joint');
 }
});

test('neck opening stays outside every integrated torso section and collar follows the opening',()=>{
 for(const length of[75,150,210])for(const chest of[45,100,160]){
  const d={x:23,y:37,length,chest,waist:chest*.8,neck:chest*.3};
  const core=torsoSurfacePath(d),open=torsoSurfacePath({...d,neckOpening:true});
  assert.ok(open.startsWith(core.slice(0,-1)));
  const nums=open.slice(core.length-1).match(/Q([^Z]+)/)[1].trim().split(/\s+/).map(Number);
  const cap=Math.min(8,length*.06),startY=d.y-cap;
  for(let i=0;i<=100;i++){const t=i/100;assert.ok((1-t)**2*startY+2*(1-t)*t*nums[1]+t*t*nums[3]<=d.y+.011);}
  const markup=torsoSurfaceMarkup(d,{projection:'front',fill:'#345a67',id:'neck-test',neckOpening:true});
  assert.match(markup,/class="player-training-collar"/);assert.ok(markup.includes(`d="${open}"`));
 }
});

test('modern static and animated joins preserve individual measurements, capacities and input state',()=>{
 for(const [heightInches,weightLbs]of[[62,140],[74,240],[79,340],[86,400]]){
  const p=ensurePlayerVisualIdentity({id:'join-control',name:'Join control',age:24,heightInches,weightLbs,ratings:{speed:83,acceleration:76,strength:87,jumping:66}},{newPlayer:true});
  p.visualFrame=playerFrame(p);p.appearance=playerAppearance(p);const before=structuredClone(p);
  for(const view of['front','side']){
   const svg=buildPlayerPhysiqueSvg(p,{view});assert.match(svg,/class="physique-section-light"/);assert.match(svg,/class="player-training-collar"/);assert.doesNotMatch(svg,/NaN|undefined|Infinity/);
   const neutral=neutralMeasuredPose(p.visualFrame),limbs=view==='front'?[...neutral.legs,...neutral.arms]:[neutral.legs[1],neutral.arms[1]];
   const gradients=[...svg.matchAll(/class="physique-section-light"[^>]*x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)];
   assert.equal(gradients.length,limbs.length);
   for(const [i,m]of gradients.entries()){
    const [x1,y1,x2,y2]=m.slice(1).map(Number),l=limbs[i],dx=view==='front'?l.end.x-l.root.x:(l.end.z??0)-(l.root.z??0),dy=l.end.y-l.root.y;
    assert.ok(Math.abs((x2-x1)*dx+(y2-y1)*dy)/(Math.hypot(x2-x1,y2-y1)*Math.hypot(dx,dy))<.003,'section light crosses the actual limb rather than its screen bounding box');
   }
   const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const m of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(m[1]));
  }
  for(const mode of['run','jump','acceleration','cut','strength','endurance'])for(const phase of[0,.37,.72]){
   const pose=solvePlayerMotion(p,{mode,phase}),svg=buildPlayerMotionSvg(p,{mode,phase});assert.doesNotMatch(svg,/NaN|undefined|Infinity/);
   const surfaces=[...svg.matchAll(/class="motion-upper-surface" d="([^"]+)"/g)].map(m=>m[1]);
   const split=p.visualFrame.upperArmShare;
   for(const [i,arm]of[[1,pose.arms[1]],[3,pose.arms[0]]]){
    const diameter=p.visualFrame.upperArmWidth*6;
    const curves=[...surfaces[i].matchAll(/C([^CLMZ]+)/g)].map(m=>m[1].trim().split(/\s+/).map(Number)),apex=curves.at(-2).slice(-2);
    const profile=projectedLimbSections(p.visualFrame,'arm',mode==='cut'?'front':'side'),radius=diameter*limbProfileSample('arm',p.visualFrame.limbShapeVariation,0,split,profile).ratio/2;
    const dx=arm.joint.x-arm.root.x,dy=arm.joint.y-arm.root.y,length=Math.hypot(dx,dy);
    assert.ok(Math.abs(apex[0]-(arm.root.x-dx/length*radius*.55))<.011);
    assert.ok(Math.abs(apex[1]-(arm.root.y-dy/length*radius*.55))<.011,'animated cap uses this saved section and actual bone, including the front cutting study');
   }
  }
  assert.deepEqual(p,before);
 }
});
