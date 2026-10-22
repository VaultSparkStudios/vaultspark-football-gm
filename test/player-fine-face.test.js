import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity,setPlayerGrooming,validateSnapshotVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {fineFaceGeometry,fineFaceFrontContour,fineFaceEyeContours} from '../public/lib/fineFaceGeometry.js';
import {buildPlayerPortraitSvg} from '../public/lib/playerPortraitFace.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {buildPlayerMotionSvg} from '../public/lib/playerMotion.js';
const copy=structuredClone;
const cases=[['nasalRootWidth',.75,1.25,'front'],['nasalWingWidth',.75,1.25,'front'],
  ['upperLipScale',.65,1.4,'both'],['lowerLipScale',.65,1.4,'both'],
  ['chinProjection',-.7,.7,'side'],['foreheadSlope',-.7,.7,'side'],['browRidge',0,1,'both']];
const base=()=>{const p={id:'fine-face',age:24,heightInches:74,weightLbs:225,profile:{faceSeed:'fine-face'},ratings:{strength:70,speed:80,agility:60,jumping:70}};ensurePlayerVisualIdentity(p,{newPlayer:true});return {...p,appearance:{...playerAppearance(p),hairstyle:'shaved',facialHair:'clean'},visualFrame:playerFrame(p)};};
const geometry=svg=>svg.replace(/id="[^"]+"/g,'id="resource"').replace(/url\(#[^)]+\)/g,'url(#resource)');

test('saved regional face controls affect the visible outline independently of pigment',()=>{
  const p=base(),outline=svg=>svg.match(/<clipPath id="[^"]+-face"><path d="([^"]+)"/)[1];
  for(const [key,low,high]of [['faceWidth',.88,1.1],['jawWidth',.8,1.16],['cheekFullness',.75,1.25],['cheekbone',.75,1.25],['chinWidth',.8,1.2],['chinLength',.85,1.12],['facialAsymmetry',-1,1]]){
    const a={...p,appearance:{...p.appearance,[key]:low}},b={...p,appearance:{...p.appearance,[key]:high}};
    assert.notEqual(outline(buildPlayerPortraitSvg(a)),outline(buildPlayerPortraitSvg(b)),`${key} changes visible anatomy`);
    assert.deepEqual(a.visualFrame,b.visualFrame,'facial shape does not change body measurements');
  }
});

test('front face projection handles malformed and extreme inputs inside its canvas',()=>{
  const p=base(),before=copy(p);
  for(const key of ['faceWidth','jawWidth','cheekFullness','cheekbone','chinWidth','chinLength','facialAsymmetry','eyeAperture','eyelidCrease'])for(const value of [NaN,Infinity,-Infinity,null,'1',{},-1e30,1e30]){
    const a={...p.appearance,[key]:value},contour=fineFaceFrontContour(a);
    assert.doesNotMatch(contour,/NaN|Infinity|undefined/);
    const numbers=contour.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.ok(numbers.every(n=>n>=50&&n<=260),'bounded head coordinates');
    for(const side of [-1,1]){
      const eye=fineFaceEyeContours(a,160+side*25,141,side);
      assert.doesNotMatch(JSON.stringify(eye),/NaN|Infinity|undefined/);
      assert.ok(eye.shape.endsWith('Z'),'closed scleral clipping path');
    }
  }
  assert.equal(fineFaceFrontContour({}),null);assert.equal(fineFaceEyeContours({},135,141,-1),null);
  assert.deepEqual(p,before,'geometry does not mutate saved identity');
});

test('fine facial structure persists across actual saves, grooming and identity changes without gameplay draws',()=>{
  const session=createSession({seed:717,startYear:2026,controlledTeamId:'BUF'}),p=session.league.players[0];
  const before=playerAppearance(p),rng=copy(session.rng),frame=playerFrame(p);
  assert.equal(before.fineFaceVersion,'fine-face-v1');
  assert.deepEqual(playerAppearance(createSessionFromSnapshot(copy(session.toSnapshot())).league.players[0]),before);
  const renamed={...copy(p),id:'new-id',name:'new-name',age:49,teamId:'MIA'};
  assert.deepEqual(playerAppearance(renamed),before);
  setPlayerGrooming(renamed,{hairstyle:'shaved',facialHair:'clean',dyedHairColor:'#ffffff'});
  assert.deepEqual(fineFaceGeometry(playerAppearance(renamed)),fineFaceGeometry(before));
  assert.deepEqual(playerFrame(renamed),frame);assert.deepEqual(copy(session.rng),rng);
});

test('isolated facial controls change visible geometry only in appropriate projections and survive moving heads',()=>{
  const p=base();
  for(const [key,low,high,view]of cases){
    const left={...p,appearance:{...p.appearance,[key]:low}},right={...p,appearance:{...p.appearance,[key]:high}};
    const fronts=[left,right].map(x=>geometry(buildPlayerPortraitSvg(x,{headOnly:true})));
    const sides=[left,right].map(x=>geometry(buildPlayerSideHead(x)));
    if(view!=='side')assert.notEqual(fronts[0],fronts[1],`${key} front`);else assert.equal(fronts[0],fronts[1],`${key} concealed front`);
    if(view!=='front')assert.notEqual(sides[0],sides[1],`${key} side`);else assert.equal(sides[0],sides[1],`${key} concealed side`);
    for(const mode of ['run','jump','acceleration','cut'])for(const player of [left,right])assert.doesNotMatch(buildPlayerMotionSvg(player,{mode,phase:.37}),/NaN|Infinity|undefined/);
  }
  for(const [key]of cases)for(const value of [NaN,Infinity,-Infinity,null,'1',{},-1e30,1e30]){
    const q={...p,appearance:{...p.appearance,[key]:value}};
    for(const svg of [buildPlayerPortraitSvg(q),buildPlayerSideHead(q),buildPlayerMotionSvg(q,{mode:'run',phase:.37})])assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  }
});

test('fine face imports validate active, retired and prospective recipes before any mutation',()=>{
  for(const recipe of [{version:'future',seed:'x'},{version:'fine-face-v1',seed:2},{version:'fine-face-v1',seed:'x',extra:true}]){
    const p={profile:{fineFaceRecipe:recipe}},before=copy(p);
    assert.throws(()=>ensurePlayerVisualIdentity(p),/visual identity/);assert.deepEqual(p,before);
    for(const league of [{players:[p]},{retiredPlayers:[p]},{pendingDraft:{available:[p]}}])assert.throws(()=>validateSnapshotVisualIdentity({league}),/visual identity/);
  }
});

test('an optional fine recipe on v2/v3 imports has complete SVG resources with or without natural detail',()=>{
  for(const version of ['portrait-identity-v2','portrait-identity-v3'])for(const detail of [false,true]){
    const p=base();p.profile.appearanceRecipe.version=version;
    if(!detail)delete p.profile.appearanceDetailRecipe;
    validateSnapshotVisualIdentity({league:{players:[p]}});p.appearance=playerAppearance(p);
    for(const svg of [buildPlayerPortraitSvg(p),buildPlayerPortraitSvg(p,{headOnly:true}),buildPlayerSideHead(p)]){
      const ids=new Set([...svg.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
      for(const match of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.has(match[1]),`${version}/${detail}: ${match[1]}`);
      assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
    }
  }
});

test('legacy facial renderers retain frozen October 8 geometry and appearance without a fine recipe',async()=>{
  const authority=JSON.parse(fs.readFileSync(new URL('../docs/CORE_AFTER_WHOLE_HEAD_REGRESSION_2026-10-08.json',import.meta.url),'utf8'));
  const old={};for(const name of ['playerPortraitFace','playerSideAppearance']){
    const raw=fs.readFileSync(new URL(`../docs/visual-qa/references/whole-head-regression-${name}.js-2026-10-08`,import.meta.url),'utf8');
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),authority.sourceHashesAfter[`public/lib/${name}.js`],'preserved renderer authority is unchanged');
    const source=raw.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(path.resolve('public/lib',s)).href}${q}`);
    old[name]=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  // Historical compatibility is evaluated on preserved saved recipes. New
  // generation now supplies continuous hair controls that this older source
  // never supported, even after removing its optional fine-face controls.
  const historical=JSON.parse(fs.readFileSync(new URL('./fixtures/whole-head-legacy-inputs.json',import.meta.url),'utf8'));
  let count=0;for(const version of ['portrait-identity-v2','portrait-identity-v3'])for(const age of [24,49])for(const hairstyle of ['shaved','fade','long'])for(const facialHair of ['clean','full-beard']){
    const p=copy(historical.inputs.find(row=>row.version===version&&row.detail).player);p.age=age;
    assert.equal(p.profile.fineFaceRecipe,undefined);
    const before=playerAppearance(p);ensurePlayerVisualIdentity(p);assert.deepEqual(playerAppearance(p),before);assert.equal(before.fineFaceVersion,undefined);
    p.appearance={...before,hairstyle,facialHair};
    assert.equal(buildPlayerPortraitSvg(p),old.playerPortraitFace.buildPlayerPortraitSvg(p));
    assert.equal(buildPlayerSideHead(p),old.playerSideAppearance.buildPlayerSideHead(p));count+=2;
  }assert.equal(count,48);
});
