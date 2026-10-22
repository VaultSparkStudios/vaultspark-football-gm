import test from 'node:test';
import assert from 'node:assert/strict';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {appearanceSkinColor} from '../public/lib/appearancePalette.js';
import {portraitSurfaceLighting} from '../public/lib/portraitSurfaceLighting.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {buildPlayerMotionSvg} from '../public/lib/playerMotion.js';

test('face lighting follows saved landmarks across complexions and grooming with complete resources',()=>{
  for(let i=0;i<80;i++){
    const p=ensurePlayerVisualIdentity({id:`light-${i}`,age:18+i%42,heightInches:62+i%25,weightLbs:140+i%261,profile:{},ratings:{strength:70,speed:80}},{newPlayer:true});
    p.appearance={...playerAppearance(p),complexion:(i%4)/3,facialHair:['clean','stubble','short-beard','full-beard'][i%4]};p.visualFrame=playerFrame(p);
    const before=structuredClone(p),skin=appearanceSkinColor(p.appearance);
    const front=buildPlayerPortraitSvg(p,{idSuffix:'-lighting'}),side=buildPlayerSideHead(p,{idSuffix:'-lighting'});
    assert.match(front,/portrait-face-form-lighting/);assert.match(side,/side-face-form-lighting/);
    assert.ok(side.includes(`data-skin-color="${skin}"`));
    for(const svg of [front,side,...['run','jump','acceleration','cut'].map(mode=>buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:'-lighting'}))]){
      assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
      const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique instance resources');
      for(const match of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(match[1]),match[1]);
    }
    assert.deepEqual(p,before,'lighting never changes appearance/frame/saved recipe');
  }
});

test('surface lighting bounds its estimates and retains legacy fallback',()=>{
  assert.equal(portraitSurfaceLighting({},{id:'old',skin:'#754a34'}),null);
  for(const detailVersion of [undefined,'natural-appearance-detail-v1'])for(const key of ['faceWidth','jawWidth','chinWidth','cheekFullness','cheekbone','eyeSpacing'])for(const value of [NaN,Infinity,null,'1',{},-1e30,1e30]){
    const a={fineFaceVersion:'fine-face-v1',detailVersion,[key]:value};
    for(const view of ['front','side']){
      const lighting=portraitSurfaceLighting(a,{id:'bounded',skin:'#754a34',view});
      assert.doesNotMatch(JSON.stringify(lighting),/NaN|Infinity|undefined/);
    }
  }
});

test('pigment and grooming changes preserve saved anatomical contours',()=>{
  const contour=svg=>svg.match(/<clipPath id="[^\"]+-face"><path d="([^\"]+)"/)[1];
  for(let i=0;i<30;i++){
    const p=ensurePlayerVisualIdentity({id:`same-skull-${i}`,age:24,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});
    p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
    const before=structuredClone(p),original=contour(buildPlayerPortraitSvg(p));
    for(const appearance of [
      {...p.appearance,complexion:.02,skinUndertone:-1,eyeColor:'#66889c'},
      {...p.appearance,complexion:.98,skinUndertone:1,eyeColor:'#382b20'},
      {...p.appearance,hairstyle:'shaved',facialHair:'clean'},
      {...p.appearance,hairstyle:'long',hairColor:'#a58a55',facialHair:'full-beard'}
    ])assert.equal(contour(buildPlayerPortraitSvg({...p,appearance})),original,'cosmetics must not reroll the skull');
    assert.deepEqual(p,before);
  }
});
