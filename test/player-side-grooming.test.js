import test from 'node:test';
import assert from 'node:assert/strict';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {HAIR_STYLE_RULES} from '../public/lib/portraitAppearanceContract.js';
const make=()=>{const p={id:'side-grooming-proof',age:24,heightInches:78,weightLbs:340,ratings:{speed:85,acceleration:80,jumping:75,strength:85},profile:{appearanceRecipe:{version:'portrait-identity-v3',seed:'frozen-grooming',complexionBand:[0,1]}}};return {...p,appearance:{...playerAppearance(p),dyedHairColor:null,hairDensity:1},visualFrame:playerFrame(p)};};
const paths=s=>[...s.matchAll(/\bd="([^"]+)"/g)].map(m=>m[1]);
const hair=s=>s.match(/<g class="side-scalp-hair"[\s\S]*$/)?.[0]||'';
test('visible side texture channels change actual strand geometry while the saved face and pose remain fixed',()=>{
 const p=make(),before=structuredClone(p);
 const rendered=texture=>buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'crew',hairTexture:texture}});
 const variants=['straight','wavy','curly','coily'].map(rendered);
 assert.equal(new Set(variants.map(s=>JSON.stringify(paths(hair(s))))).size,4);
 for(const key of ['hairCurvature','hairWaveScale','hairStrandWidth','hairLength','hairline']){
  const low=buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'coils',hairTexture:'coily',[key]:.8}});
  const high=buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'coils',hairTexture:'coily',[key]:1.2}});
  if(key==='hairStrandWidth')assert.notEqual(hair(low),hair(high));
  else assert.notDeepEqual(paths(hair(low)),paths(hair(high)),`${key} must change rendered paths`);
  assert.equal(low.match(/class="side-face-contour"[^>]*d="([^"]+)"/)[1],high.match(/class="side-face-contour"[^>]*d="([^"]+)"/)[1]);
 }
 const groomed={...p,appearance:{...p.appearance,hairstyle:'afro',hairTexture:'coily'}};
 assert.deepEqual(solvePlayerMotion(groomed,{phase:.37}),solvePlayerMotion(p,{phase:.37}));
 assert.deepEqual(p,before);
});
test('all legal side grooming combinations resolve their resources at extreme saved dimensions',()=>{
 const p=make();let count=0;
 for(const[style,rule]of Object.entries(HAIR_STYLE_RULES))for(const texture of rule.textures)for(const extreme of [.5,1.5]){
  const q={...p,appearance:{...p.appearance,hairstyle:style,hairTexture:texture,faceWidth:extreme,jawWidth:extreme,earSize:extreme,hairLength:extreme,hairDensity:1,hairCurvature:extreme,hairWaveScale:extreme,hairStrandWidth:extreme}};
  const svg=buildPlayerMotionSvg(q,{phase:.18,idSuffix:`${style}-${texture}-${extreme}`});
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const m of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(m[1]),`missing ${m[1]}`);
  count++;
 }
 assert.equal(count,96);
});
test('resource names never reroll grooming, and arranged or absent hair suppresses loose-strand controls',()=>{
 const p=make();
 assert.deepEqual(paths(buildPlayerSideHead(p,{idSuffix:'first'})),paths(buildPlayerSideHead({...p,id:'renamed'},{idSuffix:'second'})));
 for(const style of ['braids','locs','shaved']){
  const render=texture=>paths(buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:style,hairTexture:texture}}));
  assert.deepEqual(render('straight'),render('coily'));
 }
 const shaved=buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'shaved'}});
 assert.doesNotMatch(shaved,/side-scalp-hair/);
 const zero=buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:'crew',hairDensity:0}});
 assert.match(zero,/side-scalp-hair[^>]*opacity="0"/);
});
