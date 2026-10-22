import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createCurrentCharacterVolumeProxy,fitCurrentCharacterVolumeProxy} from '../test-support/appearance/currentCharacterMassFit3d.js';
import {createPlayerCharacterModel,characterRendererDiagnostics} from '../public/lib/playerCharacter3d.js';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/player-head-pole-case.json',import.meta.url)));
function person(weightLbs){const p=structuredClone(fixture.player);Object.assign(p,{heightInches:80,weightLbs});p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);return p;}
test('current proxy retains actual character head positions and anatomical parts while excluding external soles',()=>{
 const p=person(350),saved=structuredClone(p),model=createPlayerCharacterModel(p),proxy=createCurrentCharacterVolumeProxy(p);
 try{
  for(const mode of ['neutral','cut','jump','strength']){
   const state=model.update({mode,phase:.4}),mesh=proxy.build({mode,phase:.4});assert.deepEqual(mesh.pose,state.mesh.pose);assert.deepEqual(mesh.placement,state.placement);
   assert.ok(!mesh.parts.some(p=>/^foot-\d-sole/.test(p.name)));assert.ok(mesh.parts.some(p=>p.name==='actual-head-skin'));assert.equal(mesh.wholeRenderedMassVerified,false);
   const head=mesh.parts.find(p=>p.name==='actual-head-skin'),up=mesh.placement.axes.slice(3,6),heights=[...new Set(mesh.indices.slice(head.firstIndex,head.firstIndex+head.indexCount))].map(id=>up.reduce((sum,a,k)=>sum+a*(mesh.vertices[id*6+k]-mesh.placement.origin[k]),0));
   assert.ok(Math.abs(Math.max(...heights))<2e-5,'head crown must coincide with production crown origin');
   assert.ok(Math.abs(Math.min(...heights)+mesh.pose.skullHeight)<2e-5,'head chin must coincide with saved skull height');
   for(const part of mesh.parts.filter(p=>p.name!=='actual-head-skin')){
    const actual=state.mesh.parts.find(p=>p.name===part.name),direct=mesh.vertices.slice(part.startVertex*6,(part.startVertex+part.vertexCount)*6),cached=state.mesh.vertices.slice(actual.startVertex*6,(actual.startVertex+actual.vertexCount)*6);
    assert.equal(direct.length,cached.length);for(let i=0;i<direct.length;i++)assert.ok(Math.abs(direct[i]-cached[i])<2e-5,`${mode}/${part.name}/${i}: direct/cache difference`);
   }
  }
  assert.deepEqual(p,saved);
 }finally{proxy.dispose();model.dispose();}
 assert.deepEqual(characterRendererDiagnostics(),{activeModels:0,activeViews:0});assert.throws(()=>proxy.build(),/Disposed/);
});
test('current neutral artistic-volume fit converges across fixed-skeleton weight cases without changing the saved person',()=>{
 for(const weight of [180,240,350,500]){
  const p=person(weight),saved=structuredClone(p),proxy=createCurrentCharacterVolumeProxy(p),neutral=proxy.build();proxy.dispose();
  const fit=fitCurrentCharacterVolumeProxy(p,{resolution:48,tolerance:.005});assert.equal(fit.converged,true);assert.ok(Math.abs(fit.residual)<=.005);assert.deepEqual(fit.mesh.pose,neutral.pose);assert.deepEqual(fit.mesh.placement,neutral.placement);
  const a=neutral.parts.find(p=>p.name==='actual-head-skin'),b=fit.mesh.parts.find(p=>p.name==='actual-head-skin');
  assert.deepEqual(fit.mesh.vertices.slice(fit.mesh.indices[b.firstIndex]*6),neutral.vertices.slice(neutral.indices[a.firstIndex]*6));
  assert.equal(fit.wholeRenderedMassVerified,false);assert.equal(fit.runtimeAdoptionAccepted,false);assert.deepEqual(p,saved);
 }
 assert.deepEqual(characterRendererDiagnostics(),{activeModels:0,activeViews:0});
});

test('failed controls and incomplete fits cannot leak a character model or claim convergence',()=>{
 const p=person(350),saved=structuredClone(p);
 for(const options of [{resolution:7},{resolution:1025},{axis:-1},{axis:3},{maxIterations:0},{maxIterations:21},{tolerance:NaN},{tolerance:0}]){
  assert.throws(()=>fitCurrentCharacterVolumeProxy(p,options));assert.deepEqual(characterRendererDiagnostics(),{activeModels:0,activeViews:0});assert.deepEqual(p,saved);
 }
 const incomplete=fitCurrentCharacterVolumeProxy(p,{resolution:32,maxIterations:1,tolerance:.001});
 assert.equal(incomplete.converged,false);assert.equal(incomplete.bulkScale,1);assert.equal(incomplete.iterations.length,1);assert.equal(incomplete.runtimeAdoptionAccepted,false);
 assert.deepEqual(p,saved);assert.deepEqual(characterRendererDiagnostics(),{activeModels:0,activeViews:0});
});
