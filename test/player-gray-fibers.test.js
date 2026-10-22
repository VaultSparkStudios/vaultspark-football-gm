import assert from 'node:assert/strict';
import test from 'node:test';
import {grayHairFiberAttributes} from '../public/lib/hairGrayFibers.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortrait.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';

function fixture() {
  const p={id:'gray-fiber-person',age:44,heightInches:76,weightLbs:240,ratings:{speed:80,acceleration:80,strength:80,jumping:80},profile:{
    appearanceRecipe:{version:'portrait-identity-v3',seed:'gray-fiber-person',complexionBand:[0,1]},
    appearanceDetailRecipe:{version:'natural-appearance-detail-v1',seed:'gray-fiber-person'}}};
  return {...p,appearance:{...playerAppearance(p),hairstyle:'crew',hairTexture:'curly',hairColor:'#29201b',naturalHairColor:'#29201b',grayOnsetAge:32,dyedHairColor:null,hairDensity:1},visualFrame:playerFrame(p)};
}

test('gray fiber thresholds remain fixed through aging, with dye and legacy suppression',()=>{
  const p=fixture(),old=new Set(),older=new Set();
  for(let i=0;i<500;i++) {
    assert.equal(grayHairFiberAttributes(p.appearance,24,'seed',i),'');
    if(grayHairFiberAttributes(p.appearance,40,'seed',i))old.add(i);
    if(grayHairFiberAttributes(p.appearance,52,'seed',i))older.add(i);
    assert.equal(grayHairFiberAttributes({...p.appearance,dyedHairColor:'#ae3489'},52,'seed',i),'');
    assert.equal(grayHairFiberAttributes({...p.appearance,version:'portrait-identity-v2'},52,'seed',i),'');
    assert.equal(grayHairFiberAttributes({...p.appearance,detailVersion:undefined},52,'seed',i),'');
  }
  assert.ok(old.size>0 && old.size<older.size && older.size<500);
  assert.ok([...old].every(i=>older.has(i)),'existing gray fibers cannot revert spontaneously');
});

test('front, side and moving hair retain geometry and identity while visible fibers gray',()=>{
  const p=fixture(),saved=structuredClone(p);
  for(const style of ['buzz','fade','crew','short-curls','coils','afro','waves','side-part','swept','long','locs','braids','receding']) {
    const q={...p,appearance:{...p.appearance,hairstyle:style}};
    const front=buildPlayerPortraitSvg(q),side=buildPlayerSideHead(q);
    assert.match(front,/data-gray-fiber="true"/,`${style} front`);
    assert.match(side,/data-gray-fiber="true"/,`${style} side`);
    for(const render of [buildPlayerPortraitSvg,buildPlayerSideHead]) {
      const dyed=render({...q,appearance:{...q.appearance,dyedHairColor:'#ae3489'}});
      assert.doesNotMatch(dyed,/data-gray-fiber/);
      const renamed=render({...q,id:'new',name:'Renamed'},{idSuffix:'other'});
      const grayPaths=svg=>[...svg.matchAll(/<path data-gray-fiber="true"[^>]*d="([^"]+)"/g)].map(m=>m[1]);
      assert.deepEqual(grayPaths(renamed),grayPaths(render(q)));
    }
  }
  assert.doesNotMatch(buildPlayerPortraitSvg({...p,appearance:{...p.appearance,hairstyle:'shaved'}}),/data-gray-fiber/);
  assert.doesNotMatch(buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'shaved'}}),/data-gray-fiber/);
  assert.match(buildPlayerMotionSvg(p,{mode:'run',phase:.2}),/data-gray-fiber/);
  assert.match(buildPlayerMotionSvg(p,{mode:'cut',phase:.2}),/data-gray-fiber/);
  assert.deepEqual(solvePlayerMotion({...p,age:24},{phase:.2}),solvePlayerMotion(p,{phase:.2}));
  assert.deepEqual(p,saved);
});
