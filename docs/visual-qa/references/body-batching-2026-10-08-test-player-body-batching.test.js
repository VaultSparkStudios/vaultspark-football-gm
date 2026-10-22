import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {createBodyRenderer3d,buildPlayerBodyMesh3d} from '../public/lib/playerBody3d.js';
const primary=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_TORSO_CONTOUR_R2_2026-10-08.json','utf8')),folder=path.resolve('.cache/body-batching-before');await fs.mkdir(folder,{recursive:true});
for(const row of primary.frozenSources.filter(r=>r.original.startsWith('public/lib/')&&r.original.endsWith('.js'))){const bytes=await fs.readFile('docs/visual-qa/'+row.file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);await fs.writeFile(path.join(folder,path.basename(row.original)),bytes);}
const before=await import(pathToFileURL(path.join(folder,'playerBody3d.js'))),player=JSON.parse(await fs.readFile('test/fixtures/player-head-pole-case.json','utf8')).player;
function recordingCanvas(){
 const uniforms=new Map(),calls=[];let released=0;
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,ELEMENT_ARRAY_BUFFER:6,STATIC_DRAW:7,DYNAMIC_DRAW:8,FLOAT:9,TRIANGLES:10,UNSIGNED_SHORT:11,NO_ERROR:0,COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,DEPTH_TEST:12,
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,createBuffer:()=>({}),getUniformLocation:(p,n)=>n,getAttribLocation:()=>0,isContextLost:()=>false,getError:()=>0,
 viewport(){},clearColor(){},clear(){},enable(){},useProgram(){},bindBuffer(){},bufferData(){},bufferSubData(){},enableVertexAttribArray(){},vertexAttribPointer(){},
 uniform1f:(k,v)=>uniforms.set(k,v),uniform2f:(k,...v)=>uniforms.set(k,v),uniform3f:(k,...v)=>uniforms.set(k,v),uniform2fv:(k,v)=>uniforms.set(k,[...v]),uniform3fv:(k,v)=>uniforms.set(k,[...v]),
 drawElements:(kind,count,type,offset)=>calls.push({first:offset/2,count,pigment:uniforms.get('pigment'),shorts:uniforms.get('shorts'),root:uniforms.get('boneRoot'),axis:uniforms.get('boneAxis')}),
 deleteBuffer(){released++;},deleteProgram(){},deleteShader(){}
 };
 return{width:512,height:992,getContext:()=>gl,calls,get released(){return released;}};
}
const flatten=(calls,indices)=>calls.flatMap(c=>Array.from(indices.subarray(c.first,c.first+c.count),index=>JSON.stringify([index,c.pigment,c.shorts,c.shorts?c.root:null,c.shorts?c.axis:null])));
test('batched body preserves frozen renderer triangle order and every material/bone uniform through movement',()=>{
 const a=recordingCanvas(),b=recordingCanvas(),old=before.createBodyRenderer3d(a,{skinColor:'#76543a'}),current=createBodyRenderer3d(b,{skinColor:'#76543a'});
 for(const mode of ['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.4,.75]){
  const mesh=buildPlayerBodyMesh3d(player,{mode,phase,includeSkull:false});a.calls.length=0;b.calls.length=0;old.draw(mesh,Math.PI/2);current.draw(mesh,Math.PI/2);
  assert.deepEqual(flatten(b.calls,mesh.indices),flatten(a.calls,mesh.indices));assert.ok(b.calls.length<a.calls.length);
 }
 old.dispose();current.dispose();current.dispose();assert.equal(a.released,2);assert.equal(b.released,2);
});
