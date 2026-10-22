import test from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../src/runtime/bootstrap.js';import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerBodyMesh3d,resolveBodySurfacePose} from '../test-support/appearance/playerBody3d.js';
const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),source=s.league.players.find(p=>p.position==='OL');
const person=(heightInches=80,weightLbs=240)=>{const p={...structuredClone(source),heightInches,weightLbs};return{...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('one physical body retains measured segments and fingertip endpoints across all six modes',()=>{
 const p=person(),before=structuredClone(p),rng=structuredClone(s.rng);
 for(const mode of ['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.4,.75]){
  const m=buildPlayerBodyMesh3d(p,{mode,phase}),f=p.visualFrame;assert.ok(m);assert.equal(m.units,'inches');
  assert.ok(m.vertices.every(Number.isFinite));assert.ok(m.indices.every(i=>i<m.vertices.length/6));assert.ok(m.vertices.length/6<65535);assert.ok(m.vertices.byteLength+m.indices.byteLength<1000000);
  for(const kind of ['arm','leg'])for(const [i,l]of m.pose[kind==='arm'?'arms':'legs'].entries()){
   const length=kind==='arm'?f.armSegmentLengthInches:f.legLengthInches,share=kind==='arm'?f.upperArmShare:f.upperLegShare;
   assert.ok(Math.abs(distance(l.root,l.joint)-length*share)<1e-6,kind+' upper');assert.ok(Math.abs(distance(l.joint,l.end)-length*(1-share))<1e-6,kind+' lower');
   if(kind==='arm'){
    const part=m.parts.find(p=>p.name===`hand-${i}-finger-1`),tip=Array.from(m.vertices.subarray(part.startVertex*6,part.startVertex*6+3));
    assert.ok(distance(tip,l.hand)<1e-5,'modeled longest fingertip remains the saved hand endpoint');
   }
  }
  assert.equal(m.provenance.wholeUnionMassVerified,false);
 }
 assert.deepEqual(p,before);assert.deepEqual(structuredClone(s.rng),rng);
});
test('neutral modeled skull and feet agree with stature and foot dimensions at common physical scale',()=>{
 for(const [height,weight]of[[62,100],[80,180],[80,350],[96,650]]){
  const p=person(height,weight),m=buildPlayerBodyMesh3d(p),head=m.parts.find(p=>p.name==='skull-skin'),ys=[];
  for(let i=head.startVertex;i<head.startVertex+head.vertexCount;i++)ys.push(m.vertices[i*6+1]);assert.ok(Math.abs(Math.max(...ys)-height)<1e-5);
  for(const i of [0,1]){const foot=m.parts.find(p=>p.name===`foot-${i}`),zs=[],ys=[];for(let v=foot.startVertex;v<foot.startVertex+foot.vertexCount;v++){zs.push(m.vertices[v*6+2]);ys.push(m.vertices[v*6+1]);}
   assert.ok(Math.abs(Math.max(...zs)-Math.min(...zs)-p.visualFrame.footLengthInches)<1e-5);assert.ok(Math.abs(Math.min(...ys))<1e-6);
  }
 }
});
test('mass changes bulk without changing saved face, segment lengths or skeletal root anchors',()=>{
 const a=person(80,180),b=person(80,500);assert.deepEqual(a.appearance,b.appearance);
 const pa=resolveBodySurfacePose(a),pb=resolveBodySurfacePose(b);assert.deepEqual(pa.shoulder,pb.shoulder);assert.deepEqual(pa.hip,pb.hip);assert.deepEqual(pa.legs,pb.legs);
 for(const i of [0,1]){assert.deepEqual(pa.arms[i].root,pb.arms[i].root);for(const [start,end]of[['root','joint'],['joint','end'],['end','hand']])assert.ok(Math.abs(distance(pa.arms[i][start],pa.arms[i][end])-distance(pb.arms[i][start],pb.arms[i][end]))<1e-8);}
 assert.notDeepEqual(buildPlayerBodyMesh3d(a).vertices,buildPlayerBodyMesh3d(b).vertices);
 assert.equal(buildPlayerBodyMesh3d({...a,visualFrame:{...a.visualFrame,measurementFit:{status:'unsupported'}}}),null);
 assert.equal(buildPlayerBodyMesh3d({...a,visualFrame:null}),null);assert.throws(()=>resolveBodySurfacePose(a,{mode:'unknown'}),/Invalid body pose/);
});
