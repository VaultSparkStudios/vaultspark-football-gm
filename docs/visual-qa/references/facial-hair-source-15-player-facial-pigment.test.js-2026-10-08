import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {GameSession} from '../src/runtime/GameSession.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {RNG} from '../src/utils/rng.js';
import {ensurePlayerVisualIdentity,setPlayerGrooming} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {appearanceHairColors} from '../public/lib/appearancePalette.js';
import {buildPlayerPortraitSvg,buildPlayerMotionSvg} from '../public/lib/playerPortrait.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
const make=(id='pigment-person')=>ensurePlayerVisualIdentity({id,name:'Pigment Person',age:24,heightInches:74,weightLbs:225,ratings:{speed:75,strength:75},profile:{faceSeed:id}},{newPlayer:true});
const rendered=p=>({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
const paths=s=>[...s.matchAll(/\bd="([^"]+)"/g)].map(m=>m[1]);

test('new facial pigments have independent residuals and saved identity across demographic or grooming changes',()=>{
 const rows=Array.from({length:80},(_,i)=>make(`pigment-${i}`));
 assert.ok(rows.every(p=>p.profile.facialPigmentRecipe==='facial-pigment-v1'));
 assert.ok(rows.filter(p=>{const a=playerAppearance(p);return a.naturalFacialHairColor!==a.naturalBrowColor;}).length>60);
 const p=rows[0],before=playerAppearance(p);p.id='renamed';p.teamId='MIA';p.profile.faceSeed='changed';p.profile.identity={surveyCategory:'White',birthCountry:'Brazil'};
 assert.deepEqual(playerAppearance(p),before);
 setPlayerGrooming(p,{dyedHairColor:'#663399',dyedFacialHairColor:'#80402d',dyedBrowColor:'#151210'});
 const after=playerAppearance(p);
 for(const key of Object.keys(before).filter(key=>key!=='dyedHairColor'))assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(appearanceHairColors(after,24),{scalp:'#663399',face:'#80402d',brow:'#151210',grayShare:0});
 setPlayerGrooming(p,{dyedFacialHairColor:null,dyedBrowColor:null});
 assert.equal(appearanceHairColors(playerAppearance(p),24).face,before.naturalFacialHairColor);
 assert.equal(appearanceHairColors(playerAppearance(p),24).brow,before.naturalBrowColor);
});

test('isolated beard/brow dyes reach front, side and motion without changing saved facial paths or frame',()=>{
 const p=make();setPlayerGrooming(p,{facialHair:'full-beard',dyedHairColor:'#29201b'});
 const frame=playerFrame(p),base=rendered(p);
 setPlayerGrooming(p,{dyedFacialHairColor:'#a58a55',dyedBrowColor:'#80402d'});const q=rendered(p);
 const front=buildPlayerPortraitSvg(q),side=buildPlayerSideHead(q),motion=buildPlayerMotionSvg(q,{phase:.3});
 assert.match(front,/class="portrait-facial-hair"[^>]*stroke="#a58a55"/);
 assert.match(front,/class="portrait-brows"[^>]*stroke="#80402d"/);
 assert.match(side,/class="side-facial-hair"[^>]*fill="#a58a55"/);
 assert.match(side,/<path d="M13 [^>]*stroke="#80402d"/);
 assert.match(motion,/class="side-facial-hair"[^>]*fill="#a58a55"/);
 assert.deepEqual(paths(front),paths(buildPlayerPortraitSvg(base)));
 assert.deepEqual(paths(side),paths(buildPlayerSideHead(base)));
 assert.deepEqual(q.visualFrame,frame);
});

test('legacy recipes keep identical decoded appearance and their undyed pigment fallback',()=>{
 const p=make();delete p.profile.facialPigmentRecipe;
 const before=playerAppearance(p),colors=appearanceHairColors(before,48);
 ensurePlayerVisualIdentity(p);assert.deepEqual(playerAppearance(p),before);assert.equal(p.profile.facialPigmentRecipe,undefined);
 assert.equal(colors.brow,colors.face);
 setPlayerGrooming(p,{dyedBrowColor:'#d2b984'});
 assert.equal(p.profile.facialPigmentRecipe,undefined);assert.equal(playerAppearance(p).naturalBrowColor,undefined);
 assert.equal(appearanceHairColors(playerAppearance(p),48).face,colors.face);
 assert.equal(appearanceHairColors(playerAppearance(p),48).brow,'#d2b984');
 setPlayerGrooming(p,{dyedBrowColor:null});assert.equal(appearanceHairColors(playerAppearance(p),48).brow,colors.brow);
});

test('compact seed aliases remain compact and explicit independent pigment seeds remain intact',()=>{
 const p=make(),before=playerAppearance(p);ensurePlayerVisualIdentity(p);
 assert.equal(p.profile.facialPigmentRecipe,'facial-pigment-v1');assert.deepEqual(playerAppearance(p),before);
 const seed=p.profile.appearanceRecipe.seed;p.profile.facialPigmentRecipe={version:'facial-pigment-v1',seed};
 assert.deepEqual(playerAppearance(p),before);
 p.profile.appearanceRecipe.seed='different-base-face';
 const a=playerAppearance(p);assert.equal(a.naturalFacialHairColor===undefined,false);
 const full=structuredClone(p.profile.facialPigmentRecipe);ensurePlayerVisualIdentity(p);assert.deepEqual(p.profile.facialPigmentRecipe,full);
 // The explicit recipe freezes residual randomness; its base scalp pigment
 // still belongs to the saved appearance recipe, not an ID/name.
 p.id='another';assert.deepEqual(playerAppearance(p),a);
});

test('grooming versions upgrade monotonically and invalid facial dye changes are atomic',()=>{
 const p=make();setPlayerGrooming(p,{hairPart:.4});assert.equal(p.profile.grooming.version,'player-grooming-v2');
 setPlayerGrooming(p,{dyedBrowColor:'#80402d'});assert.equal(p.profile.grooming.version,'player-grooming-v3');
 setPlayerGrooming(p,{hairPart:.7,hairstyle:'long'});assert.equal(p.profile.grooming.version,'player-grooming-v3');
 const before=structuredClone(p);
 for(const change of [{dyedBrowColor:'red'},{dyedFacialHairColor:'" onload="x'},{naturalBrowColor:'#123456'},{dyedBrowColor:NaN}]){
  assert.throws(()=>setPlayerGrooming(p,change),e=>e.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');assert.deepEqual(p,before);
 }
});

test('actual session and draft snapshots preserve pigment recipes/dyes and corrupt imports refuse without mutation',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),p=s.league.players.find(p=>p.teamId==='BUF');
 setPlayerGrooming(p,{dyedBrowColor:'#151210',dyedFacialHairColor:'#80402d'});s.prepareDraft();
 const prospect=s.league.pendingDraft.available[0];assert.ok(prospect.profile.facialPigmentRecipe);
 const snapshot=s.toSnapshot(),before=structuredClone(snapshot);
 for(const restore of [createSessionFromSnapshot,snapshot=>GameSession.fromSnapshot(snapshot,seed=>new RNG(seed))]){
  const r=restore(structuredClone(snapshot));assert.deepEqual(playerAppearance(r.league.players.find(q=>q.id===p.id)),playerAppearance(p));
  assert.deepEqual(playerAppearance(r.league.pendingDraft.available[0]),playerAppearance(prospect));
 }
 for(const corrupt of [q=>q.profile.facialPigmentRecipe={version:'facial-pigment-v1',seed:7},q=>q.profile.facialPigmentRecipe='future',q=>q.profile.facialPigmentRecipe={version:'facial-pigment-v1',seed:'valid',extra:true},q=>delete q.profile.appearanceRecipe,q=>q.profile.grooming={version:'player-grooming-v2',dyedBrowColor:'#151210'}]){
  const bad=structuredClone(snapshot);corrupt(bad.league.pendingDraft.available[0]);const original=structuredClone(bad);
  assert.equal(inspectSnapshotCompatibility(bad).reasonCode,'SNAPSHOT_VISUAL_IDENTITY_INVALID');
  assert.throws(()=>createSessionFromSnapshot(bad),e=>e.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');
  assert.throws(()=>GameSession.fromSnapshot(bad,seed=>new RNG(seed)),e=>e.reasonCode==='SNAPSHOT_VISUAL_IDENTITY_INVALID');assert.deepEqual(bad,original);
 }
 assert.deepEqual(snapshot,before);
});

test('pigment edits and rendering leave actual match results and every simulation random stream identical',()=>{
 const s=createSession({seed:118,startYear:2026,controlledTeamId:'BUF'}),r=createSessionFromSnapshot(s.toSnapshot());
 for(const p of r.league.players){setPlayerGrooming(p,{dyedHairColor:'#663399',dyedBrowColor:'#151210',dyedFacialHairColor:'#80402d'});buildPlayerPortraitSvg(rendered(p));}
 const original=s.advanceWeek(),changed=r.advanceWeek();
 assert.deepEqual(changed.results,original.results);
 assert.deepEqual(r.rngStreams.toSnapshot(),s.rngStreams.toSnapshot());assert.equal(r.rng.seed,s.rng.seed);
 for(let i=0;i<s.league.players.length;i++){
  const a=s.league.players[i],b=r.league.players[i];
  for(const key of ['ratings','potential','injury','seasonStats','developmentHealth'])assert.deepEqual(b[key],a[key],`${a.id}:${key}`);
 }
});
