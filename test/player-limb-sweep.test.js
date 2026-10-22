import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createLimbSweepRecipe,limbSweepFrame,limbSweepPoint,writeLimbSweepVertices,limbSweepIndices} from '../public/lib/playerLimbSweep3d.js';
import {createPlayerBodyAnimation3d} from '../public/lib/playerBodyAnimation3d.js';
import {inspectTriangleSolids} from '../test-support/appearance/triangleSolidVolume.js';
import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';import {resolveBodySurfacePose} from '../public/lib/playerBody3d.js';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/player-head-pole-case.json',import.meta.url),'utf8'));
const close=(a,b,e=2e-5)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
test('continuous closed limb retains bone centers and neutral section dimensions with bounded inner-bend compression',()=>{
 const sections=[[0,4,3],[.16,5,3.5],[.51,3,2.4],[.67,4,3],[1,1.5,1.2]],recipe=createLimbSweepRecipe(sections,.51);
 for(const angle of[0,.6,1.4,2.2])for(const frontal of[false,true]){
  const l={root:[0,0,0],joint:[0,-10,0],end:[0,-10-10*Math.cos(angle),10*Math.sin(angle)]},vertices=new Float32Array(recipe.vertexCount*6);writeLimbSweepVertices(vertices,0,recipe,l,frontal);
  for(const[t,key]of[[0,'root'],[.51,'joint'],[1,'end']])limbSweepFrame(l,.51,t,frontal).center.forEach((v,i)=>close(v,l[key][i],1e-10));
  for(const[t,w,d]of sections){const r=recipe.times.indexOf(t),f=limbSweepFrame(l,.51,t,frontal),start=r*(recipe.columns+1)*6;
   // R1's frozen test required fixed elliptical sections even in tight bends.
   // That requirement permitted an inverted inner skin. Neutral measurements
   // stay exact; flexed inner skin now compresses before curvature inversion.
   for(const[c,radius,axis]of[[0,w/2,f.lateral],[8,d/2,f.depth]]){const offset=start+c*6,p=[0,1,2].map(k=>vertices[offset+k]-f.center[k]);if(angle===0){close(Math.hypot(...p),radius);close(p.reduce((s,v,k)=>s+v*axis[k],0),radius);}else{assert.ok(Math.hypot(...p)<=radius+2e-5);assert.ok(Math.hypot(...p)>0);}}
  }
  for(let i=0;i<vertices.length;i+=6){assert.ok(vertices.subarray(i,i+6).every(Number.isFinite));close(Math.hypot(...vertices.subarray(i+3,i+6)),1,2e-6);}
  const mesh={vertices,indices:new Uint16Array(limbSweepIndices(recipe)),parts:[{name:'limb',firstIndex:0,indexCount:limbSweepIndices(recipe).length}],units:'inches'},topology=inspectTriangleSolids(mesh);assert.equal(topology.allComponentsClosedOriented,true);assert.ok(topology.solids[0].signedVolume>0);
  const before=limbSweepFrame(l,.51,.51-1e-7,frontal),after=limbSweepFrame(l,.51,.51+1e-7,frontal);before.d.forEach((v,i)=>close(v,after.d[i],1e-5));
 }
});
test('ordinary R1 folded-arm counterexample has forward skin derivatives rather than flipped normals',()=>{
 const p=structuredClone(fixture.player);p.heightInches=80;p.weightLbs=350;for(const key of['speed','acceleration','agility','jumping','strength','stamina'])p.ratings[key]=85;p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
 const pose=resolveBodySurfacePose(p,{mode:'strength',phase:.275}),limb=pose.arms[0],recipe=createLimbSweepRecipe(p.visualFrame.armSections,p.visualFrame.upperArmShare),t=.55,angle=Math.PI/2,frame=limbSweepFrame(limb,recipe.joint,t),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 for(const e of[1e-3,1e-4,1e-5,1e-6]){const a=limbSweepPoint(recipe,limb,t-e,angle),b=limbSweepPoint(recipe,limb,t+e,angle),u=limbSweepPoint(recipe,limb,t,angle-e),v=limbSweepPoint(recipe,limb,t,angle+e),along=b.map((v,i)=>(v-a[i])/(2*e)),around=v.map((v,i)=>(v-u[i])/(2*e)),radial=limbSweepPoint(recipe,limb,t,angle).map((v,i)=>v-frame.center[i]);assert.ok(dot(along,frame.d)>frame.speed*.35);assert.ok(dot(cross(along,around),radial)>0);}
});
test('complete cached body has four continuous limbs with closed incidence across actual motion poses',()=>{
 const animation=createPlayerBodyAnimation3d(fixture.player,{includeSkull:false}),mesh=animation.update(),vertices=mesh.vertices,indices=mesh.indices;
 assert.equal(mesh.sweeps.length,4);assert.ok(!mesh.parts.some(p=>/-(upper|lower|joint)(-|$)/.test(p.name)));
 for(const mode of['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of[0,.4,.75]){
  const posed=animation.update({mode,phase});assert.equal(posed.vertices,vertices);assert.equal(posed.indices,indices);assert.equal(inspectTriangleSolids(posed).allComponentsClosedOriented,true,`${mode} ${phase}`);
 }
 animation.dispose();
});
