import test from 'node:test';
import assert from 'node:assert/strict';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { solvePlayerMotion, playerMovementProfile, buildPlayerMotionSvg } from '../public/lib/playerMotion.js';
const make=(heightInches=74,weightLbs=220,ratings={speed:70,acceleration:70,jumping:70})=>{
  const p={id:'motion-control',name:'Motion control',heightInches,weightLbs,ratings};
  return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('articulation preserves segment lengths and ground contact across frames and phases',()=>{
  for(const height of [62,74,86])for(const weight of [140,225,400])for(const mode of ['run','jump'])for(let i=0;i<=40;i++){
    const p=make(height,weight),before=structuredClone(p),pose=solvePlayerMotion(p,{phase:i/40,mode});
    for(const l of pose.legs){
      assert.ok(Math.abs(dist(l.root,l.joint)-pose.legLength*.51)<1e-8);
      assert.ok(Math.abs(dist(l.joint,l.end)-pose.legLength*.49)<1e-8);
      if(l.contact)assert.ok(Math.abs(l.end.y-(pose.floor-15))<1e-8,'stance sole must touch the training surface');
    }
    for(const l of pose.arms){
      assert.ok(Math.abs(dist(l.root,l.joint)-pose.armLength*.53)<1e-8);
      assert.ok(Math.abs(dist(l.joint,l.end)-pose.armLength*.47)<1e-8);
      assert.ok(Math.abs(dist(l.end,l.hand)-pose.handLength)<1e-8);
    }
    assert.doesNotMatch(buildPlayerMotionSvg(p,{mode,phase:i/40}),/NaN|Infinity|undefined/);
    assert.deepEqual(p,before);
  }
});
test('physical capacities change cadence, stride, launch posture and jump without changing the frame',()=>{
  const p=make(),speed={...p,ratings:{...p.ratings,speed:99}},launch={...p,ratings:{...p.ratings,acceleration:99}},jump={...p,ratings:{...p.ratings,jumping:99}};
  const low=playerMovementProfile(p);
  assert.ok(playerMovementProfile(speed).cadence>low.cadence);
  assert.ok(playerMovementProfile(speed).strideFraction>low.strideFraction);
  assert.equal(playerMovementProfile(speed).jumpInches,low.jumpInches);
  assert.ok(playerMovementProfile(launch).launchLean>low.launchLean);
  assert.equal(playerMovementProfile(launch).cadence,low.cadence);
  assert.ok(solvePlayerMotion(jump,{mode:'jump',phase:.5}).hip.y<solvePlayerMotion(p,{mode:'jump',phase:.5}).hip.y);
  for(const changed of [speed,launch,jump])assert.deepEqual(changed.visualFrame,p.visualFrame);
  const cosmetic={...p,name:'Changed',overall:99,potential:99,profile:{identity:{surveyCategory:'White',birthCountry:'Japan'}}};
  assert.deepEqual(solvePlayerMotion(cosmetic,{phase:.2}),solvePlayerMotion(p,{phase:.2}));
});
test('paused/static poses wrap and tolerate missing physical attributes without guessing factual workouts',()=>{
  const p=make();p.ratings={speed:'',acceleration:NaN,jumping:null};
  assert.deepEqual(solvePlayerMotion(p,{phase:0}),solvePlayerMotion(p,{phase:1}));
  assert.doesNotMatch(buildPlayerMotionSvg(p,{phase:Infinity}),/NaN|Infinity|undefined/);
  assert.equal(solvePlayerMotion({}),null);
  assert.match(buildPlayerMotionSvg(p,{mode:'jump'}),/Controlled jump/);
});

test('acceleration build-up visibly ramps from rest, with faster launch and unchanged dimensions',()=>{
  const low=make(78,340,{speed:85,acceleration:40,jumping:70});
  const high={...low,ratings:{...low.ratings,acceleration:99}};
  const rest=solvePlayerMotion(low,{mode:'acceleration',phase:0});
  const launching=solvePlayerMotion(low,{mode:'acceleration',phase:.22});
  const quick=solvePlayerMotion(high,{mode:'acceleration',phase:.22});
  assert.equal(rest.mode,'acceleration');
  assert.equal(rest.drill.speedFraction,0);
  assert.ok(quick.drill.speedFraction>launching.drill.speedFraction);
  assert.ok(quick.drill.rampSeconds<launching.drill.rampSeconds);
  assert.notDeepEqual(launching.legs,rest.legs);
  for(const p of [low,high])for(let i=0;i<=80;i++){
    const pose=solvePlayerMotion(p,{mode:'acceleration',phase:i/80});
    assert.equal(pose.legLength,rest.legLength);
    assert.equal(pose.armLength,rest.armLength);
    assert.equal(pose.handLength,rest.handLength);
    for(const l of pose.legs){
      assert.ok(Math.abs(dist(l.root,l.joint)-pose.legLength*.51)<1e-8);
      assert.ok(Math.abs(dist(l.joint,l.end)-pose.legLength*.49)<1e-8);
      if(l.contact)assert.ok(Math.abs(l.end.y-(pose.floor-15))<1e-8);
    }
    assert.doesNotMatch(buildPlayerMotionSvg(p,{mode:'acceleration',phase:i/80}),/NaN|Infinity|undefined/);
  }
  const tail=solvePlayerMotion(low,{mode:'acceleration',phase:.98});
  assert.equal(tail.drill.speedFraction,0);
  assert.deepEqual(tail.legs,rest.legs);
  const before=solvePlayerMotion(low,{mode:'acceleration',phase:1-1e-9});
  const after=solvePlayerMotion(low,{mode:'acceleration',phase:1});
  const beltDifference=Math.abs(before.beltOffset-after.beltOffset);
  assert.ok(Math.min(beltDifference,Math.abs(24-beltDifference))<1e-5,'repeating belt marks must stay continuous through rest/loop reset');
});
