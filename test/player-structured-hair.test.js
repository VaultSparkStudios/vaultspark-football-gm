import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {structuredHairBundles,structuredHairMarkup} from '../public/lib/structuredHair.js';

const fixture=()=>{const p=ensurePlayerVisualIdentity({id:'arranged-hair',age:46,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};};
test('arranged bundles fit the saved person in both projections and preserve concealed loose texture',()=>{
 const p=fixture(),before=structuredClone(p);
 for(const hairstyle of ['locs','braids'])for(const projection of ['front','side']){
  const a={...p.appearance,hairstyle},options={projection};
  const geometry=structuredHairBundles(a,'identity',options);
  assert.notDeepEqual(geometry,structuredHairBundles({...a,hairLength:1.2},'identity',options));
  assert.notDeepEqual(geometry,structuredHairBundles(a,'other-identity',options));
  assert.deepEqual(geometry,structuredHairBundles({...a,hairTexture:'straight',hairCurvature:1.45,hairWaveScale:.65},'identity',options));
  const svg=projection==='front'?buildPlayerPortraitSvg({...p,appearance:a},{headOnly:true}):buildPlayerSideHead({...p,appearance:a});
  assert.match(svg,/data-arranged-flow="bundles-v1"/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const m of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(m[1]));
  assert.match(structuredHairMarkup({...a,dyedHairColor:null,grayOnsetAge:20},'identity',{...options,age:60}),/data-gray-fiber/);
  assert.doesNotMatch(structuredHairMarkup({...a,dyedHairColor:'#8558c8'},'identity',{...options,age:60}),/data-gray-fiber/);
 }
 assert.deepEqual(p,before);
});
test('bounded malformed arranged controls never generate invalid coordinates',()=>{
 for(const value of [NaN,Infinity,null,{},-1e30,1e30])for(const hairstyle of ['locs','braids']){
  const a={hairstyle,hairLength:value,hairStrandWidth:value,faceWidth:value,hairColor:'invalid'};
  for(const projection of ['front','side'])assert.doesNotMatch(structuredHairMarkup(a,'seed',{projection}),/NaN|Infinity|undefined/);
 }
});
test('older appearance outputs remain byte exact against immediate preserved sources',async()=>{
 const baseline=JSON.parse(await fs.readFile(new URL('./fixtures/player-structured-hair-legacy.json',import.meta.url),'utf8'));
 const hash=svg=>crypto.createHash('sha256').update(svg).digest('hex');
 for(const c of baseline.cases){
  const old={...baseline.player,appearance:{...baseline.player.appearance,hairstyle:c.hairstyle,hairTexture:c.hairTexture}};
  assert.equal(hash(buildPlayerPortraitSvg(old,{headOnly:true})),c.frontSha256);
  assert.equal(hash(buildPlayerSideHead(old)),c.sideSha256);
 }
});
