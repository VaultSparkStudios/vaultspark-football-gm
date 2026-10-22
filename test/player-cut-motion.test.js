import test from 'node:test';
import assert from 'node:assert/strict';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { solvePlayerMotion, buildPlayerMotionSvg } from '../public/lib/playerMotion.js';
const make=(heightInches=74,weightLbs=220,agility=70)=>{
  const p={id:'cut-control',name:'Cut control',heightInches,weightLbs,ratings:{speed:85,acceleration:70,jumping:70,agility}};
  return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
test('cut motion retains safe head rendering for incomplete legacy appearance DTOs',()=>{
  for(const appearance of [undefined,null,{}, {complexion:.5}, {hairColor:'#29201b'},
    {...make().appearance,hairColor:'invalid'}, {...make().appearance,eyeSpacing:NaN}]){
    const player={id:'legacy',name:'Legacy',visualFrame:{heightInches:74},appearance};
    const before=structuredClone(player);
    const svg=buildPlayerMotionSvg(player,{mode:'cut',phase:.4,idSuffix:'legacy-cut'});
    assert.match(svg,/side-face-/);
    assert.doesNotMatch(svg,/NaN|Infinity|undefined|<div/);
    assert.deepEqual(player,before);
  }
  assert.match(buildPlayerMotionSvg(make(),{mode:'cut'}),/athlete-/,'complete recipes retain the saved frontal portrait');
});
test('lateral cut redirects the measured body over planted feet, with distinct agility timing',()=>{
  const low=make(78,340,40),high=make(78,340,99);
  const a=solvePlayerMotion(low,{mode:'cut',phase:.40}),b=solvePlayerMotion(high,{mode:'cut',phase:.40});
  assert.equal(a.mode,'cut');
  assert.ok(b.drill.duration<a.drill.duration,'higher agility completes the same drill sooner');
  assert.ok(b.drill.plantDuration<a.drill.plantDuration,'higher agility has a shorter artistic plant window');
  assert.notDeepEqual(a.legs,b.legs,'timing differences must produce visible poses');
  assert.deepEqual(low.visualFrame,high.visualFrame);
  for(const height of [62,74,86])for(const weight of [140,225,400])for(const agility of [40,99])for(let i=0;i<=120;i++){
    const player=make(height,weight,agility),before=structuredClone(player),phase=i/120;
    const pose=solvePlayerMotion(player,{mode:'cut',phase});
    assert.ok(pose.legs.some(l=>l.contact),'a lateral step study retains ground support');
    for(const leg of pose.legs){
      assert.ok(Math.abs(distance(leg.root,leg.joint)-pose.legLength*.51)<1e-8);
      assert.ok(Math.abs(distance(leg.joint,leg.end)-pose.legLength*.49)<1e-8);
      if(leg.contact){
        assert.ok(Math.abs(leg.end.y-(pose.floor-15))<1e-8);
        const next=solvePlayerMotion(player,{mode:'cut',phase:phase+1e-6});
        const index=pose.legs.indexOf(leg);
        if(next.legs[index].contact)assert.ok(distance(next.legs[index].end,leg.end)<1e-6,'planted feet cannot slide');
      }
    }
    for(const arm of pose.arms){
      assert.ok(Math.abs(distance(arm.root,arm.joint)-pose.armLength*.53)<1e-8);
      assert.ok(Math.abs(distance(arm.joint,arm.end)-pose.armLength*.47)<1e-8);
      assert.ok(Math.abs(distance(arm.end,arm.hand)-pose.handLength)<1e-8);
    }
    assert.equal(pose.beltOffset,0,'cuts use a fixed floor');
    assert.deepEqual(player,before);
    assert.doesNotMatch(buildPlayerMotionSvg(player,{mode:'cut',phase,idSuffix:'cut-case'}),/NaN|Infinity|undefined/);
  }
  const atStart=solvePlayerMotion(low,{mode:'cut',phase:0}),atTurn=solvePlayerMotion(low,{mode:'cut',phase:.5});
  assert.ok(atTurn.hip.x>atStart.hip.x,'the body travels laterally');
  assert.deepEqual(solvePlayerMotion(low,{mode:'cut',phase:1}),atStart);
  for(const boundary of [0,.5,1]){
    const before=solvePlayerMotion(low,{mode:'cut',phase:boundary-1e-8}),after=solvePlayerMotion(low,{mode:'cut',phase:boundary+1e-8});
    for(let i=0;i<2;i++)assert.ok(distance(before.legs[i].end,after.legs[i].end)<1e-4,'cut loop and direction changes remain continuous');
    assert.ok(distance(before.hip,after.hip)<1e-4);
  }
});
