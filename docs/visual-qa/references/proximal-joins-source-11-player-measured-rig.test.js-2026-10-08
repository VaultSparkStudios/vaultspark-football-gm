import test from 'node:test';
import assert from 'node:assert/strict';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {neutralMeasuredPose} from '../public/lib/physiqueGeometryContract.js';
import {buildPlayerPhysiqueSvg,buildPlayerMotionSvg} from '../public/lib/playerPortrait.js';
import {solvePlayerMotion} from '../public/lib/playerMotion.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
const make=(height=74,weight=225)=>{const p=ensurePlayerVisualIdentity({id:'rig-person',name:'Rig person',age:25,heightInches:height,weightLbs:weight,ratings:{speed:70,acceleration:70,agility:70,jumping:70,strength:70,stamina:70},profile:{}},{newPlayer:true});return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};};
const near=(a,b,tolerance=.021)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
// Independently read the centers at the paired cubic surface endpoints.
function anchors(path){
 const commands=[...path.matchAll(/([MLCQ])([^MLCQZ]*)/g)].filter(m=>m[1]!=='Q').map(m=>[m[1],m[2].trim().split(/[ ,]+/).map(Number)]);
 const turn=commands.findIndex(c=>c[0]==='L'),average=(a,b)=>({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2});
 // The return wall mirrors the outbound section cubics. Additional proximal
 // cap cubics are outside those section endpoints and cannot locate bones.
 return [average(commands[0][1],commands[2*turn-1][1].slice(-2)),average(commands[turn-1][1].slice(-2),commands[turn][1])];
}
const surfaces=(svg,kind)=>[...svg.matchAll(new RegExp(`<path class="physique-${kind}" data-rig="measured-body-rig-v1" data-segment="joined" d="([^"]+)"`,'g'))].flatMap(m=>m[1].split(/ (?=M)/).map((d,i)=>({segment:i===0?'upper':'lower',anchors:anchors(d)})));
test('actual neutral surfaces reconstruct observed bone lengths and spacing across mass and stature',()=>{
 for(const height of [62,74,86])for(const weight of [140,225,400]){
  const p=make(height,weight),f=p.visualFrame,before=structuredClone(p),svg=buildPlayerPhysiqueSvg(p);
  for(const kind of ['arm','leg']){
   const paths=surfaces(svg,kind);assert.equal(paths.length,4);
   const total=(kind==='arm'?f.armSegmentLengthInches:f.legLengthInches)*6,share=kind==='arm'?f.upperArmShare:f.upperLegShare;
   for(let i=0;i<4;i+=2){const [root,joint]=paths[i].anchors,[again,end]=paths[i+1].anchors;
    near(distance(joint,again),0);near(distance(root,joint),total*share);near(distance(again,end),total*(1-share));
   }
   const roots=[paths[0].anchors[0],paths[2].anchors[0]];
   const span=kind==='arm'?f.shoulderSpanInches*6:(f.hipJointSpanInches!=null?f.hipJointSpanInches*6:f.pelvicBreadthInches*6*.76);
   near(distance(...roots),span);
  }
  const side=buildPlayerPhysiqueSvg(p,{view:'side'});
  for(const kind of ['arm','leg']){
   const front=surfaces(svg,kind).slice(2),profile=surfaces(side,kind);assert.equal(profile.length,2);
   for(let i=0;i<2;i++)for(let j=0;j<2;j++){near(profile[i].anchors[j].y,front[i].anchors[j].y);near(profile[i].anchors[j].x,160);}
  }
  assert.deepEqual(p,before);assert.doesNotMatch(svg+side,/NaN|Infinity|undefined/);
 }
});
test('neutral and all six motion modes share measured 3D dimensions without capacity-driven bone changes',()=>{
 for(const weight of [140,225,400]){
  const p=make(74,weight),f=p.visualFrame,neutral=neutralMeasuredPose(f);
  for(const mode of ['run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.37,.75]){
   const pose=solvePlayerMotion(p,{mode,phase});
   near(pose.armLength,neutral.armLength,1e-8);near(pose.legLength,neutral.legLength,1e-8);near(pose.torso,neutral.torso,1e-8);
   near(distance(pose.arms[0].root,pose.arms[1].root),f.shoulderSpanInches*6,1e-8);
   near(distance(pose.legs[0].root,pose.legs[1].root),neutral.hipHalf*2,1e-8);
   for(const [limbs,total,share]of [[pose.arms,f.armSegmentLengthInches*6,f.upperArmShare],[pose.legs,f.legLengthInches*6,f.upperLegShare]])for(const limb of limbs){near(distance(limb.root,limb.joint),total*share,1e-8);near(distance(limb.joint,limb.end),total*(1-share),1e-8);}
   for(const limb of pose.arms)near(distance(limb.end,limb.hand),(f.handLengthInches??f.heightInches*.1)*6,1e-8);
   assert.doesNotMatch(buildPlayerMotionSvg(p,{mode,phase}),/NaN|Infinity|undefined/);
  }
  const changed={...p,ratings:{speed:99,acceleration:40,agility:99,jumping:40,strength:99,stamina:40}};
  assert.deepEqual(neutralMeasuredPose(playerFrame(changed)),neutral);
 }
 const a=neutralMeasuredPose(make(74,140).visualFrame),b=neutralMeasuredPose(make(74,400).visualFrame);
 for(const kind of ['arms','legs'])for(let i=0;i<2;i++)assert.deepEqual(a[kind][i].root,b[kind][i].root);
});
test('actual snapshot restore retains the measured rig and rendered segment paths',()=>{
 const session=createSession({seed:974,startYear:2026,controlledTeamId:'BUF'}),p=session.league.players[0],rng=structuredClone(session.rng);
 const q=createSessionFromSnapshot(session.toSnapshot()).league.players.find(row=>row.id===p.id);
 const dto=p=>({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
 for(const view of ['front','side'])assert.equal(buildPlayerPhysiqueSvg(dto(p),{view}),buildPlayerPhysiqueSvg(dto(q),{view}));
 assert.deepEqual(structuredClone(session.rng),rng);
});
test('optional missing foot dimensions retain estimated shoes at the measured ankle',()=>{
 for(const incomplete of ['recipe','dto']){
  const p=make();if(incomplete==='recipe'){delete p.profile.individualAnatomyRecipe;p.visualFrame=playerFrame(p);}else{delete p.visualFrame.footLengthInches;delete p.visualFrame.footWidthInches;}
  const before=structuredClone(p),svg=buildPlayerPhysiqueSvg(p);
  assert.equal(surfaces(svg,'leg').length,4);assert.equal((svg.match(/class="estimated-rig-footwear"/g)||[]).length,2);
  assert.doesNotMatch(svg,/null|NaN|Infinity|undefined/);assert.deepEqual(p,before);
 }
});
