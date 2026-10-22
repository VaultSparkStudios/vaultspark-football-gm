import test from 'node:test';
import assert from 'node:assert/strict';
import {playerAppearance,playerFrame,HAIRSTYLES,EYE_COLORS} from '../src/domain/playerIdentity.js';
import {buildPlayerPhysiqueSvg,appearanceSkinColor} from '../public/lib/playerPortrait.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {buildPlayerSideHead} from '../public/lib/playerSideAppearance.js';
import {HAIR_STYLE_RULES} from '../public/lib/portraitAppearanceContract.js';
const make=()=>{const p={id:'side-identity',name:'Side identity',age:24,heightInches:78,weightLbs:340,ratings:{speed:85,acceleration:70,jumping:70,strength:80}};return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};};
test('side and articulated surfaces preserve saved skin, eyes, hair and grooming',()=>{
 const p=make(),before=structuredClone(p);
 for(const render of [p=>buildPlayerPhysiqueSvg(p,{view:'side'}),buildPlayerMotionSvg]){
  const svg=render(p);assert.match(svg,/class="player-side-head"/);
  assert.ok(svg.includes(`data-skin-color="${appearanceSkinColor(p.appearance)}"`));
  const changed={...p,appearance:{...p.appearance,complexion:.95,hairstyle:'locs',hairColor:'#713629',eyeColor:'#587496',facialHair:'full-beard'}};
  assert.notEqual(render(changed),svg);
  assert.match(render(changed),/data-hairstyle="locs"/);
  assert.ok(render(changed).includes('fill="#587496"'));
  assert.deepEqual(solvePlayerMotion(changed),solvePlayerMotion(p));
 }
 assert.deepEqual(p,before);
});
test('all legal hairstyles/textures and eyes produce bounded side geometry; dye leaves natural facial hair',()=>{
 const p=make();
 for(const style of HAIRSTYLES)for(const texture of HAIR_STYLE_RULES[style].textures)for(const eye of EYE_COLORS){
  const head=buildPlayerSideHead({...p,appearance:{...p.appearance,hairstyle:style,hairTexture:texture,eyeColor:eye}},{height:57});
  assert.doesNotMatch(head,/NaN|Infinity|undefined/);assert.ok(head.includes(`fill="${eye}"`));
 }
 const dyed={...p,appearance:{...p.appearance,version:'portrait-identity-v3',hairstyle:'long',facialHair:'full-beard',hairColor:'#29201b',naturalHairColor:'#29201b',dyedHairColor:'#713629'}};
 const head=buildPlayerSideHead(dyed);assert.match(head,/side-scalp-hair[^>]*data-hair-color="#713629"/);
 assert.match(head,/side-facial-hair[^>]*data-hair-color="#29201b"/);
 const sparse=buildPlayerSideHead({...dyed,appearance:{...dyed.appearance,hairDensity:0}});
 assert.match(sparse,/side-scalp-hair[^>]*opacity="0"/);
 assert.doesNotMatch(buildPlayerSideHead({appearance:{hairColor:'<script>',complexion:NaN,eyeColor:'"bad'}}),/NaN|Infinity|undefined|<script>/);
});
test('multiple motion instances isolate resources without changing side identity',()=>{
 const p=make();
 const svgs=['run','jump','run'].map(mode=>buildPlayerMotionSvg(p,{mode}));
 const ids=svgs.flatMap(svg=>[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 assert.equal(new Set(ids).size,ids.length,'each mounted/static study owns its gradient and clip resources');
 const paths=svg=>[...svg.matchAll(/\bd="([^"]+)"/g)].map(m=>m[1]);
 const frozen={...p,profile:{faceSeed:'old',appearanceRecipe:{seed:'frozen'}}};
 assert.deepEqual(paths(buildPlayerSideHead(frozen,{idSuffix:'first'})),paths(buildPlayerSideHead({...frozen,profile:{...frozen.profile,faceSeed:'changed'}},{idSuffix:'second'})));
});
