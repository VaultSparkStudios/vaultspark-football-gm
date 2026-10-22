import test from 'node:test';import assert from 'node:assert/strict';
import {inspectTriangleSolids,estimateTriangleUnionVolume} from '../test-support/appearance/triangleSolidVolume.js';
import {createSession} from '../src/runtime/bootstrap.js';import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerBodyMesh3d} from '../test-support/appearance/playerBody3d.js';
import {fitPlayerBodyMeshMass} from '../test-support/appearance/playerBodyMassFit3d.js';
function boxes(bounds){
 const vertices=[],indices=[],parts=[];
 for(const [i,[lo,hi]]of bounds.entries()){
  const base=vertices.length/6,firstIndex=indices.length;
  for(const[x,y,z]of[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])vertices.push(lo[0]+x*(hi[0]-lo[0]),lo[1]+y*(hi[1]-lo[1]),lo[2]+z*(hi[2]-lo[2]),0,0,1);
  for(const face of[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]])indices.push(...face.map(v=>base+v));
  parts.push({name:'box-'+i,firstIndex,indexCount:36});
 }
 return{vertices:new Float64Array(vertices),indices:new Uint16Array(indices),parts,units:'inches'};
}
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} differs from ${b}`);
test('ray union matches analytic boxes, overlaps, nested and coincident solids in every axis',()=>{
 for(const [bounds,union,gross]of[
  [[[[0,0,0],[2,3,4]]],24,24],
  [[[[0,0,0],[2,3,4]],[[1,0,0],[3,3,4]]],36,48],
  [[[[0,0,0],[2,3,4]],[[0,0,0],[2,3,4]]],24,48],
  [[[[0,0,0],[4,4,4]],[[1,1,1],[3,3,3]]],64,72],
  [[[[0,0,0],[2,3,4]],[[4,0,0],[6,3,4]]],48,48]
 ])for(const axis of[0,1,2]){
  const m=boxes(bounds),before=structuredClone(m),r=estimateTriangleUnionVolume(m,{resolution:48,axis});close(r.unionVolume,union);close(r.grossVolume,gross);close(r.overlapVolume,gross-union);assert.equal(r.invalidRays,0);assert.equal(r.negativeWindingRays,0);assert.deepEqual(m,before);
 }
 const translated=boxes([[[100000,-50000,30000],[100002,-49997,30004]]]);for(const axis of[0,1,2])close(estimateTriangleUnionVolume(translated,{axis,resolution:48}).unionVolume,24);
});
test('experimental mass fitting reconciles union volume while preserving person and every measured pose endpoint',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),source=s.league.players.find(p=>p.position==='OL'),rng=structuredClone(s.rng);
 for(const weightLbs of[180,500]){
  const p={...structuredClone(source),heightInches:80,weightLbs};p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);const before=structuredClone(p),initial=buildPlayerBodyMesh3d(p),fit=fitPlayerBodyMeshMass(p,{resolution:64,tolerance:.003});
  assert.equal(fit.converged,true);assert.ok(Math.abs(fit.residual)<=.003);assert.ok(fit.bulkScale!==1);assert.deepEqual(fit.mesh.pose,initial.pose);assert.deepEqual(p,before);
  for(const name of['skull-skin','hand-0-palm','hand-1-finger-1','foot-0','foot-1']){const old=initial.parts.find(p=>p.name===name),now=fit.mesh.parts.find(p=>p.name===name);assert.deepEqual(fit.mesh.vertices.subarray(now.startVertex*6,(now.startVertex+now.vertexCount)*6),initial.vertices.subarray(old.startVertex*6,(old.startVertex+old.vertexCount)*6));}
  assert.equal(fit.densityStatus,'artistic-proxy-not-measured-tissue');assert.equal(fit.selfIntersectionsVerified,false);
  const refined=estimateTriangleUnionVolume(fit.mesh,{resolution:128});assert.ok(Math.abs(refined.unionVolume/fit.targetVolumeInches3-1)<.015);
 }
 assert.deepEqual(structuredClone(s.rng),rng);
});
test('open, reversed and malformed geometry refuses rather than yielding accepted mass',()=>{
 const open=boxes([[[0,0,0],[2,3,4]]]);open.indices=open.indices.slice(3);open.parts[0].indexCount-=3;assert.equal(inspectTriangleSolids(open).allComponentsClosedOriented,false);assert.throws(()=>estimateTriangleUnionVolume(open),/closed outward/);
 const reverse=boxes([[[0,0,0],[2,3,4]]]);for(let i=0;i<reverse.indices.length;i+=3)[reverse.indices[i+1],reverse.indices[i+2]]=[reverse.indices[i+2],reverse.indices[i+1]];close(inspectTriangleSolids(reverse).solids[0].signedVolume,-24);assert.throws(()=>estimateTriangleUnionVolume(reverse),/closed outward/);
 const bad=boxes([[[0,0,0],[2,3,4]]]);bad.indices[0]=65000;assert.throws(()=>inspectTriangleSolids(bad),/indices/);
 const unassigned=boxes([[[0,0,0],[2,3,4]]]);unassigned.parts=[];assert.throws(()=>inspectTriangleSolids(unassigned),/Unassigned/);
 const duplicate=boxes([[[0,0,0],[2,3,4]]]);duplicate.parts.push({...duplicate.parts[0],name:'duplicate'});assert.throws(()=>inspectTriangleSolids(duplicate),/Overlapping/);
 assert.throws(()=>estimateTriangleUnionVolume(boxes([[[0,0,0],[2,3,4]]]),{resolution:0}),/quadrature/);
});
test('oblique octahedron quadrature approaches its analytic volume, including rays through projected vertices',()=>{
 const angle=Math.PI/7,roll=Math.PI/9,points=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(([x,y,z])=>{const a=x*Math.cos(angle)-y*Math.sin(angle),b=x*Math.sin(angle)+y*Math.cos(angle);return[a,b*Math.cos(roll)-z*Math.sin(roll),b*Math.sin(roll)+z*Math.cos(roll)];}),vertices=new Float64Array(points.flatMap(p=>[...p,0,0,1])),indices=[];
 for(const x of[0,1])for(const y of[2,3])for(const z of[4,5]){const a=points[x],b=points[y],c=points[z],u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];indices.push(...(normal.reduce((n,v,i)=>n+v*(a[i]+b[i]+c[i]),0)>0?[x,y,z]:[x,z,y]));}
 const m={vertices,indices:new Uint16Array(indices),parts:[{name:'octahedron',firstIndex:0,indexCount:24}],units:'inches'};close(inspectTriangleSolids(m).solids[0].signedVolume,4/3);
 for(const axis of[0,1,2])for(const resolution of[49,128,256]){const r=estimateTriangleUnionVolume(m,{axis,resolution});assert.equal(r.invalidRays,0);assert.equal(r.negativeWindingRays,0);assert.ok(Math.abs(r.unionVolume/(4/3)-1)<(resolution===49?.005:.001));}
});
test('complete modeled body components close and ray refinement remains stable with overlap removed',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),p=structuredClone(s.league.players.find(p=>p.position==='OL'));p.heightInches=80;p.weightLbs=350;p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
 const before=structuredClone(p),rng=structuredClone(s.rng),m=buildPlayerBodyMesh3d(p),solid=inspectTriangleSolids(m);assert.equal(solid.allComponentsClosedOriented,true);assert.equal(solid.solids.length,37);assert.equal(solid.solids.find(p=>p.name==='shoulder-yoke').boundaryEdges,0);
 const a=estimateTriangleUnionVolume(m,{resolution:64}),b=estimateTriangleUnionVolume(m,{resolution:128}),c=estimateTriangleUnionVolume(m,{resolution:128,axis:0});
 for(const r of[a,b,c]){assert.equal(r.invalidRays,0);assert.equal(r.negativeWindingRays,0);assert.ok(r.unionVolume>0&&r.overlapVolume>0&&r.unionVolume<r.grossVolume);assert.equal(r.selfIntersectionsVerified,false);}
 assert.ok(Math.abs(a.unionVolume/b.unionVolume-1)<.015);assert.ok(Math.abs(c.unionVolume/b.unionVolume-1)<.015);assert.deepEqual(p,before);assert.deepEqual(structuredClone(s.rng),rng);
});
