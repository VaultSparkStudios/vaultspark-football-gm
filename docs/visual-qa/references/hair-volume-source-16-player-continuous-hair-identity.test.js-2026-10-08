import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePlayerVisualIdentity,setPlayerGrooming,validateSnapshotVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance} from '../src/domain/playerIdentity.js';

test('new texture recipe persists through serialized saves and grooming while legacy decoding stays exact',()=>{
 const p=ensurePlayerVisualIdentity({id:'continuous-texture-person',age:26,profile:{}},{newPlayer:true});
 const appearance=playerAppearance(p),restored=JSON.parse(JSON.stringify(p));
 assert.equal(appearance.hairTextureVersion,'continuous-hair-texture-v1');
 assert.ok(appearance.naturalHairTexturePosition>=0&&appearance.naturalHairTexturePosition<=3);
 assert.deepEqual(playerAppearance(restored),appearance);
 setPlayerGrooming(restored,{hairstyle:'braids',dyedHairColor:'#663388'});
 assert.equal(playerAppearance(restored).naturalHairTexturePosition,appearance.naturalHairTexturePosition);
 const legacy=structuredClone(p);delete legacy.profile.hairTextureRecipe;
 const expected=playerAppearance(legacy);ensurePlayerVisualIdentity(legacy);
 assert.deepEqual(playerAppearance(legacy),expected);assert.equal(legacy.profile.hairTextureRecipe,undefined);
 // Removing the new isolated recipe preserves every prior trait.
 const actual={...appearance};delete actual.hairTextureVersion;delete actual.hairTexturePosition;delete actual.naturalHairTexturePosition;
 assert.deepEqual(actual,expected);
});

test('malformed texture recipes fail closed before identity mutation and in all snapshot player pools',()=>{
 for(const recipe of [null,{}, {version:'future',seed:'p'},{version:'continuous-hair-texture-v1',seed:''},{version:'continuous-hair-texture-v1',seed:'p',extra:true}]){
  const p={id:'bad-texture',profile:{hairTextureRecipe:recipe}},before=structuredClone(p);
  assert.throws(()=>ensurePlayerVisualIdentity(p),e=>e.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');assert.deepEqual(p,before);
  for(const league of [{players:[p]},{retiredPlayers:[p]},{pendingDraft:{available:[p]}}])assert.throws(()=>validateSnapshotVisualIdentity({league}),e=>e.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');
 }
});

test('new texture coordinate changes no gameplay fields and has individual residual variation',()=>{
 const coordinates=new Set();
 for(let i=0;i<100;i++){
  const p={id:'texture-person-'+i,age:24,ratings:{speed:81,strength:72},potential:89,profile:{}},before=structuredClone(p);
  ensurePlayerVisualIdentity(p,{newPlayer:true});const appearance=playerAppearance(p);coordinates.add(appearance.naturalHairTexturePosition);
  assert.deepEqual(p.ratings,before.ratings);assert.equal(p.potential,before.potential);assert.equal(p.age,before.age);
 }
 assert.ok(coordinates.size>70);
});
