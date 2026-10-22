import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity,setPlayerGrooming,resolveHairArrangementRecipe} from '../src/domain/playerVisualIdentity.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {hairFiberAttributes,hairPartPosition} from '../public/lib/hairArrangement.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {longHairFlowPath,longHairFrontOutline} from '../public/lib/longHairFlow.js';
const copy=value=>JSON.parse(JSON.stringify(value));

test('parted cuts follow saved texture, part and strand geometry without rerolling the person',()=>{
 const p=ensurePlayerVisualIdentity({id:'parted-flow',age:27,heightInches:75,weightLbs:230,profile:{}},{newPlayer:true});
 p.visualFrame=playerFrame(p);const natural=playerAppearance(p),before=structuredClone(p);
 const render=appearance=>buildPlayerPortraitSvg({...p,appearance},{headOnly:true});
 for(const hairstyle of ['swept','side-part']){
  const paths=['straight','wavy','curly','coily'].map(hairTexture=>{
   const svg=render({...natural,hairstyle,hairTexture,hairTexturePosition:['straight','wavy','curly','coily'].indexOf(hairTexture)});
   assert.match(svg,/data-parted-flow="rounded-v1"/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
   return svg.match(/class="portrait-scalp-hair"[^>]*><path d="([^"]+)"/)[1];
  });
  assert.equal(new Set(paths).size,4,'actual contour varies with texture');
  const a={...natural,hairstyle,hairTexture:'curly'};
  const hair=appearance=>render(appearance).match(/<g class="portrait-hair-texture"[\s\S]*?<\/g>/)[0].replace(/url\(#[^)]+\)/g,'url(#resource)');
  assert.notEqual(hair(a),hair({...a,hairCurvature:1.45}));
  assert.notEqual(hair(a),hair({...a,hairWaveScale:1.5}));
  for(const hairTexture of ['__proto__','constructor',null])assert.doesNotMatch(render({...a,hairTexture}),/NaN|Infinity|undefined/);
 }
 assert.deepEqual(p,before);
});

test('long hair texture changes visible volume and flow while preserving the saved person',()=>{
  const p=ensurePlayerVisualIdentity({id:'long-textures',age:26,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});
  p.visualFrame=playerFrame(p);const natural=playerAppearance(p),before=structuredClone(p),outlines=[],sides=[];
  for(const hairTexture of ['straight','wavy','curly','coily']){
    const appearance={...natural,hairstyle:'long',hairTexture,hairTexturePosition:['straight','wavy','curly','coily'].indexOf(hairTexture)},player={...p,appearance};
    const front=buildPlayerPortraitSvg(player,{headOnly:true}),side=buildPlayerSideHead(player);
    outlines.push(front.match(/class="portrait-scalp-hair"[^>]*><path d="([^"]+)"/)[1]);sides.push(side);
    for(const svg of [front,side]){
      assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
      const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
      for(const match of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(match[1]));
    }
  }
  assert.equal(new Set(outlines).size,4,'texture changes actual hair silhouette');assert.equal(new Set(sides).size,4,'side view resolves the same visible texture');
  assert.deepEqual(p,before,'rendering neither rerolls identity nor changes measurements');
  for(const value of [NaN,Infinity,null,{},-1e30,1e30]){
    const a={...natural,hairTexture:'coily',hairCurvature:value,hairWaveScale:value};
    assert.doesNotMatch(longHairFrontOutline(a,'saved-seed')+longHairFlowPath(a,'saved-seed','flow:-1:5',90,112,85,225),/NaN|Infinity|undefined/);
  }
  for(const hairTexture of ['__proto__','constructor','toString','unknown',null]){
    const appearance={...natural,hairstyle:'long',hairTexture};
    assert.doesNotMatch(buildPlayerSideHead({...p,appearance}),/NaN|Infinity|undefined/,'invalid texture falls back safely in the actual side view');
    assert.doesNotMatch(longHairFrontOutline(appearance,'saved-seed'),/NaN|Infinity|undefined/);
  }
});

test('new saved hair arrangements survive identity changes and actual save restoration',()=>{
  const session=createSession({seed:717,startYear:2026,controlledTeamId:'BUF'});
  const player=session.league.players[0],before=playerAppearance(player),rng=copy(session.rng);
  assert.equal(before.hairArrangementVersion,'hair-arrangement-v1');
  assert.ok(before.hairPart>=.2&&before.hairPart<=.8);
  assert.ok(before.hairStrandVariation>=.15&&before.hairStrandVariation<=.5);
  const renamed=copy(player); renamed.id='renamed';renamed.name='Renamed';renamed.age=49;renamed.teamId='MIA';
  assert.deepEqual(playerAppearance(renamed),before);
  assert.deepEqual(copy(session.rng),rng);
  assert.deepEqual(playerAppearance(createSessionFromSnapshot(copy(session.toSnapshot())).league.players[0]),before);
  delete renamed.profile.hairArrangementRecipe;
  const legacy=playerAppearance(renamed);ensurePlayerVisualIdentity(renamed);
  assert.deepEqual(playerAppearance(renamed),legacy,'older saves do not silently acquire the new model');
});

test('part is mutable grooming; identity, physique and natural pigment retain authority',()=>{
  const player={id:'part-grooming',name:'Player',profile:{faceSeed:'part-grooming'}};
  ensurePlayerVisualIdentity(player,{newPlayer:true});
  const before=playerAppearance(player),recipe=copy(player.profile.appearanceRecipe);
  setPlayerGrooming(player,{hairPart:.75,hairstyle:'side-part'});
  assert.equal(player.profile.grooming.version,'player-grooming-v2');
  const after=playerAppearance(player);
  assert.equal(after.hairPart,.75);
  for(const key of Object.keys(before).filter(key=>!['hairPart','hairstyle','hairTexture','textureTreatment'].includes(key)))assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(player.profile.appearanceRecipe,recipe);
  const valid=copy(player);
  for(const hairPart of [NaN,Infinity,-1,1,'0.5']){
    assert.throws(()=>setPlayerGrooming(player,{hairPart}));
    assert.deepEqual(player,valid,'invalid grooming cannot partially mutate identity');
  }
});

test('invalid arrangement imports are rejected for active, retired and pending draft players',()=>{
  const session=createSession({seed:718,startYear:2026});session.prepareDraft();
  for(const target of ['players','retiredPlayers','draft']) for(const recipe of [
    {version:'future',seed:'x'},{version:'hair-arrangement-v1',seed:3},{version:'hair-arrangement-v1',seed:'x',extra:true}
  ]){
    const snapshot=copy(session.toSnapshot());
    const player=target==='draft'?snapshot.league.pendingDraft.available[0]:snapshot.league.players[0];
    if(target==='retiredPlayers')snapshot.league.retiredPlayers=[copy(player)];
    (target==='retiredPlayers'?snapshot.league.retiredPlayers[0]:player).profile.hairArrangementRecipe=recipe;
    assert.equal(inspectSnapshotCompatibility(snapshot).reasonCode,'SNAPSHOT_VISUAL_IDENTITY_INVALID');
    assert.throws(()=>createSessionFromSnapshot(snapshot),error=>error.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');
  }
});

test('part changes geometry, width variation is bounded and shaved/arranged hair conceals loose controls',()=>{
  const base={id:'hair-geometry',age:24,heightInches:74,weightLbs:225,ratings:{strength:70},profile:{faceSeed:'hair-geometry'}};
  ensurePlayerVisualIdentity(base,{newPlayer:true});
  base.visualFrame=playerFrame(base);
  const a={...playerAppearance(base),hairstyle:'side-part',hairPart:.25};
  const render=appearance=>[buildPlayerPortraitSvg({...base,appearance},{headOnly:true}),buildPlayerSideHead({...base,appearance})];
  const left=render(a),right=render({...a,hairPart:.75});
  assert.ok(left[0].includes('portrait-hair-part')&&!left[0].includes('Portrait unavailable'));
  assert.notEqual(left[0],right[0],'front part changes rendered geometry');
  assert.notEqual(left[1],right[1],'side part changes rendered geometry');
  for(const style of ['shaved','buzz','locs','braids'])for(const svg of render({...a,hairstyle:style}))assert.ok(!svg.includes('data-hair-part='),style);
  const widths=Array.from({length:200},(_,i)=>hairFiberAttributes({...a,hairStrandVariation:.5},'seed',i,1));
  assert.ok(new Set(widths).size>20);
  for(const markup of widths){const width=Number(markup.match(/stroke-width="([\d.]+)"/)[1]);assert.ok(width>=.5&&width<=1.5);}
  assert.equal(hairFiberAttributes({},'seed',1,1),'');
  assert.equal(hairPartPosition({...a,hairArrangementVersion:undefined}),null);
});
