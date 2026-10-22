import test from 'node:test';
import assert from 'node:assert/strict';
import {EYE_COLORS,playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortrait.js';

test('natural iris refinement preserves lid geometry and identity at interacting extremes',()=>{
 const p=ensurePlayerVisualIdentity({id:'iris-extremes',age:24,heightInches:74,weightLbs:220,ratings:{strength:80},profile:{faceSeed:'iris-extremes'}},{newPlayer:true});
 const original=structuredClone(p),a=playerAppearance(p),visualFrame=playerFrame(p);
 const apertures=svg=>[...svg.matchAll(/<clipPath id="[^"]*-eye-[-\d]+"><path d="([^"]+)"/g)].map(m=>m[1]);
 const rotations=svg=>[...svg.matchAll(/<g transform="rotate\(([^\"]+)\)"><defs><clipPath id="[^\"]*-eye-/g)].map(m=>m[1]);
 for(const eyeColor of EYE_COLORS)for(const complexion of [.05,.5,.98])for(const eyeAperture of [.7,1,1.3])for(const eyeTilt of [-2,2]){
  const appearance={...a,eyeColor,complexion,eyeAperture,eyeTilt};
  const current=buildPlayerPortraitSvg({...p,appearance,visualFrame},{headOnly:true});
  const reference=buildPlayerPortraitSvg({...p,appearance:{...appearance,eyeColor:EYE_COLORS[0]},visualFrame},{headOnly:true});
  assert.equal(apertures(current).length,2);
  assert.deepEqual(apertures(current),apertures(reference),'iris color must not enlarge or reshape current lids');
  assert.deepEqual(rotations(current),rotations(reference),'iris color must preserve eye tilt');
  assert.doesNotMatch(current,/NaN|Infinity|undefined/);
 }
 const lids=(eyeAperture,eyeTilt)=>apertures(buildPlayerPortraitSvg({...p,appearance:{...a,eyeAperture,eyeTilt},visualFrame},{headOnly:true}));
 assert.notDeepEqual(lids(.7,-2),lids(1.3,-2),'the comparison must retain aperture authority');
 const tilted=eyeTilt=>rotations(buildPlayerPortraitSvg({...p,appearance:{...a,eyeTilt},visualFrame},{headOnly:true}));
 assert.equal(tilted(-2).length,2);
 assert.notDeepEqual(tilted(-2),tilted(2),'the comparison must retain tilt authority');
 assert.deepEqual(p,original);
});
