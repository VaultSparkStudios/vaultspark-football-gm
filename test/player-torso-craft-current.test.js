import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticPlayer} from '../src/domain/playerFactory.js';
import {RNG} from '../src/utils/rng.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerBodyMesh3d} from '../public/lib/playerBody3d.js';
import {createPlayerBodyAnimation3d} from '../public/lib/playerBodyAnimation3d.js';

test('current production torso remains finite and anatomical extremes follow saved physical dimensions through all motions',()=>{
  for(const [heightInches,weightLbs]of [[66,160],[76,240],[80,350]]){
    const source=createSyntheticPlayer({teamId:'BUF',position:'LB',year:2026,rng:new RNG(118)});
    const p={...source,heightInches,weightLbs};p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
    const before=structuredClone(p),mesh=buildPlayerBodyMesh3d(p),rig=createPlayerBodyAnimation3d(p);
    assert.ok(mesh.vertices.every(Number.isFinite));assert.ok(mesh.vertices.length/6<65535);
    assert.ok(mesh.indices.every(i=>i<mesh.vertices.length/6));
    for(const mode of ['run','acceleration','cut','jump','strength','endurance']){
      for(const phase of [0,.25,.5,.75]){const animated=rig.update({mode,phase});assert.ok(animated.vertices.every(Number.isFinite));}
    }
    assert.deepEqual(p,before);rig.dispose();
  }
});

test('production shoes articulate during swing and remain grounded through contact without changing the cached mesh',()=>{
  const source=createSyntheticPlayer({teamId:'BUF',position:'WR',year:2026,rng:new RNG(118)});
  const p={...source,appearance:playerAppearance(source),visualFrame:playerFrame(source)},rig=createPlayerBodyAnimation3d(p);
  const original=rig.update(),vertices=original.vertices;let pitched=false,contacts=0;
  for(const phase of [0,.1,.2,.3,.4,.5,.6,.7,.8,.9]){
    const mesh=rig.update({mode:'run',phase}),built=buildPlayerBodyMesh3d(p,{mode:'run',phase});assert.equal(mesh.vertices,vertices);
    for(let side=0;side<2;side++){
      const part=mesh.parts.find(p=>p.name===`foot-${side}`);let minY=Infinity;
      for(let i=part.startVertex*6;i<(part.startVertex+part.vertexCount)*6;i+=6){
        minY=Math.min(minY,mesh.vertices[i+1]);
        for(let j=0;j<6;j++)assert.ok(Math.abs(mesh.vertices[i+j]-built.vertices[i+j])<.0001);
      }
      assert.ok(minY>=-.001,'shoe must remain above the floor');
      if(mesh.pose.legs[side].contact){contacts++;assert.ok(minY<.03,'contact retains sole at floor');}
      else{
        const start=part.startVertex*6;
        if(Math.abs(mesh.vertices[start+4]-built.vertices[start+4])<.0001){
          // Forward-most toe and heel have differing heights during swing.
          const heel=mesh.vertices[start+1],toe=mesh.vertices[(part.startVertex+32*33)*6+1];
          pitched ||= Math.abs(heel-toe)>.1;
        }
      }
    }
  }
  assert.ok(pitched);assert.ok(contacts>0);rig.dispose();
});

test('new v5 bodies avoid extreme joint pinches while retaining the v4 skeleton and total mass budget',()=>{
  for(let seed=0;seed<24;seed++){
    const p=createSyntheticPlayer({teamId:'BUF',position:seed%2?'WR':'OL',year:2026,rng:new RNG(seed)}),frame=playerFrame(p);
    assert.equal(p.profile.regionalBodyShapeRecipe.version,'regional-body-shape-v5');
    for(const kind of ['arm','leg']){
      const sections=frame[kind+'Sections'],joint=sections[2],muscle=sections[3],distal=sections[4];
      assert.ok(muscle[1]/joint[1]<1.25);assert.ok(muscle[2]/joint[2]<1.4);
      if(kind==='leg')assert.ok(distal[1]/muscle[1]>.45);
    }
    const legacy=playerFrame({...p,profile:{...p.profile,regionalBodyShapeRecipe:{...p.profile.regionalBodyShapeRecipe,version:'regional-body-shape-v4'}}});
    for(const key of ['heightInches','weightLbs','armLengthInches','wingspanInches','upperArmShare','upperLegShare','shoulderSpanInches','volumeBudgetInches3'])assert.equal(frame[key],legacy[key]);
  }
});
