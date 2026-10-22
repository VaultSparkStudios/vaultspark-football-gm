import test from 'node:test';
import assert from 'node:assert/strict';
import {characterSurfaceColor,characterSkinStops} from '../public/lib/playerSurfaceLighting.js';
import {bodySkinStops} from '../public/lib/appearancePalette.js';

test('surface lighting preserves pigment order, normal scale and coherent occlusion',()=>{
 for(const normal of [[0,0,1],[-1,0,0],[1,0,0],[.8,-.2,.5],[0,1,0]]){
  const dark=characterSurfaceColor('#382420',normal),light=characterSurfaceColor('#f0ceb4',normal);
  for(const i of [1,3,5])assert.ok(parseInt(dark.slice(i,i+2),16)<parseInt(light.slice(i,i+2),16));
  assert.equal(characterSurfaceColor('#8e634b',normal),characterSurfaceColor('#8e634b',normal.map(v=>v*17)));
  const shaded=characterSurfaceColor('#8e634b',normal,{occlusion:.86}),lit=characterSurfaceColor('#8e634b',normal);
  for(const i of [1,3,5])assert.ok(parseInt(shaded.slice(i,i+2),16)<=parseInt(lit.slice(i,i+2),16));
 }
 assert.notEqual(characterSurfaceColor('#8e634b',[-1,0,0]),characterSurfaceColor('#8e634b',[1,0,0]));
});

test('curved surface ramps follow section direction without changing their albedo',()=>{
 const original=[.6,.8],copy=[...original],ramp=characterSkinStops('#593629',{crossNormal:original});
 assert.deepEqual(original,copy);assert.equal([...ramp.matchAll(/<stop /g)].length,11);
 assert.doesNotMatch(ramp,/NaN|Infinity|undefined/);
 const reverse=characterSkinStops('#593629',{crossNormal:original.map(v=>-v)});
 const colors=s=>[...s.matchAll(/stop-color="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(colors(reverse),colors(ramp).reverse());
 assert.equal(bodySkinStops('#593629',{}),characterSkinStops('#593629'));
 assert.equal([...bodySkinStops('#593629').matchAll(/<stop /g)].length,5,'legacy palette remains available');
 for(const [color,normal,options] of [['bad',[0,0,1],{}],['#593629',[0,0,0],{}],['#593629',[NaN,0,1],{}],['#593629',[0,0,1],{occlusion:2}]])assert.throws(()=>characterSurfaceColor(color,normal,options));
 assert.throws(()=>characterSkinStops('#593629',{crossNormal:[0,0]}));
});
