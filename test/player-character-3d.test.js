import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createPlayerCharacterModel,characterHeadPlacement,characterRendererDiagnostics} from '../public/lib/playerCharacter3d.js';
import {buildHeadMesh3d} from '../public/lib/playerHead3d.js';import {buildPlayerBodyMesh3d} from '../public/lib/playerBody3d.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/player-head-pole-case.json',import.meta.url),'utf8'));
test('complete character preserves saved head mesh, colors and one body through all measured poses',()=>{
 const p=structuredClone(fixture.player),saved=structuredClone(p),model=createPlayerCharacterModel(p),head=model.head,vertices=model.update().mesh.vertices;
 assert.deepEqual(head,buildHeadMesh3d(p.appearance,model.colors,{headOnly:true,identitySeed:p.id}));assert.ok(head.parts.some(p=>p.name.includes('ear')));assert.ok(head.parts.some(p=>p.name.includes('eye')));
 for(const mode of['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of[0,.4,.75]){
  const {mesh,placement}=model.update({mode,phase}),reference=buildPlayerBodyMesh3d(p,{mode,phase,includeSkull:false});assert.equal(mesh.vertices,vertices);assert.equal(model.head,head);assert.deepEqual(mesh.pose,reference.pose);
  assert.ok(!mesh.parts.some(p=>p.name==='skull-skin'),'no duplicate head skin behind complete head');assert.deepEqual(mesh.indices,reference.indices);
  for(let i=0;i<mesh.vertices.length;i++)assert.ok(Math.abs(mesh.vertices[i]-reference.vertices[i])<2e-5);
  for(let i=0;i<3;i++){const axis=placement.axes.slice(i*3,i*3+3);assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-12);for(let j=i+1;j<3;j++)assert.ok(Math.abs(axis.reduce((s,v,k)=>s+v*placement.axes[j*3+k],0))<1e-12);}
  const skull=(head.anatomy.chinY-head.anatomy.crownY)*placement.scale;assert.ok(Math.abs(skull-mesh.pose.skullHeight)<1e-12);
 }
 assert.deepEqual(p,saved);assert.equal(model.diagnostics.wholeUnionMassVerified,false);model.dispose();model.dispose();assert.throws(()=>model.update(),/Disposed/);assert.deepEqual(characterRendererDiagnostics(),{activeModels:0,activeViews:0});
});
test('same saved person uses distinct grooming and palettes without rerolling measured skeleton',()=>{
 const p=structuredClone(fixture.player),q=structuredClone(p);q.appearance.dyedHairColor='#c08137';q.appearance.eyeColor='#406bb1';
 const a=createPlayerCharacterModel(p),b=createPlayerCharacterModel(q);assert.notEqual(a.colors.scalp,b.colors.scalp);assert.notEqual(a.colors.iris,b.colors.iris);assert.equal(a.colors.skin,b.colors.skin);assert.deepEqual(a.update().mesh.pose,b.update().mesh.pose);assert.equal(a.matchesPlayer(q),false);
 assert.equal(a.matchesPlayer(p),true);assert.equal(a.matchesPlayer({...p,id:'different-person'}),false);assert.equal(a.matchesPlayer({...p,age:55}),false);
 a.dispose();b.dispose();assert.equal(createPlayerCharacterModel({...p,visualFrame:null}),null);
});
