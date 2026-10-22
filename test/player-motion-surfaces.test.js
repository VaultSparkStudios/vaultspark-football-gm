import test from 'node:test';
import assert from 'node:assert/strict';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {buildPlayerMotionSvg,solvePlayerMotion} from '../public/lib/playerMotion.js';
import {profiledLimbSurface} from '../public/lib/profiledLimbSurface.js';

const make=(heightInches=78,weightLbs=340)=>{
 const p={id:'regional-motion',name:'Regional motion',heightInches,weightLbs,age:24,ratings:{speed:90,acceleration:85,jumping:85,strength:85}};
 return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
};
test('animated limbs use the same regional shape as the static measured body',()=>{
 const p=make(),before=structuredClone(p);
 const svg=buildPlayerMotionSvg(p,{phase:.18,idSuffix:'regional-proof'});
 assert.match(svg,/data-regional-anatomy="visual-regional-anatomy-v2"/);
 assert.match(svg,/class="motion-upper-surface"/);
 assert.match(svg,/class="motion-lower-surface"/);
 assert.match(svg,/class="motion-surface-light"/);
 assert.match(svg,/class="motion-hand"/);
 assert.equal([...svg.matchAll(/class="motion-surface-light"[^>]*gradientUnits="userSpaceOnUse"/g)].length,2,'each near limb shares one continuous light field across bone paths and joint cap');
 assert.deepEqual(p,before);
 const thicker={...p,visualFrame:{...p.visualFrame,thighWidth:p.visualFrame.thighWidth*1.2}};
 const paths=s=>[...s.matchAll(/class="motion-(?:upper|lower)-surface"[^>]*\bd="([^"]+)"/g)].map(m=>m[1]);
 assert.notDeepEqual(paths(buildPlayerMotionSvg(thicker,{phase:.18})),paths(svg),'measured regional thickness must actually change the outline');
 assert.deepEqual(solvePlayerMotion(thicker,{phase:.18}),solvePlayerMotion(p,{phase:.18}),'surface thickness cannot stretch the skeleton');
});

test('modern articulated light follows each bone instead of clamping bent limbs to a chord color',()=>{
 for(const [h,w]of[[62,140],[77,244],[86,400]])for(const mode of ['run','jump','acceleration','cut'])for(const phase of [.12,.37,.72]){
  const p=make(h,w);ensurePlayerVisualIdentity(p,{newPlayer:true});p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
  const before=structuredClone(p),pose=solvePlayerMotion(p,{mode,phase}),svg=buildPlayerMotionSvg(p,{mode,phase,idSuffix:'articulated-proof'});
  const gradients=[...svg.matchAll(/class="motion-articulated-light" data-bone="(upper|lower)" id="[^"]+" gradientUnits="userSpaceOnUse" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)];
  assert.equal(gradients.length,8);
  const bones=[pose.legs[1],pose.arms[1],pose.legs[0],pose.arms[0]].flatMap(l=>[[l.root,l.joint],[l.joint,l.end]]);
  for(const [i,match]of gradients.entries()){
   const [x1,y1,x2,y2]=match.slice(2).map(Number),[a,b]=bones[i];
   const gx=x2-x1,gy=y2-y1,bx=b.x-a.x,by=b.y-a.y;
   assert.ok(Math.abs(gx*bx+gy*by)/(Math.hypot(gx,gy)*Math.hypot(bx,by))<.003,'light must cross this actual bone');
   assert.ok(Math.abs((x1+x2)/2-(a.x+b.x)/2)<.02);
   assert.ok(Math.abs((y1+y2)/2-(a.y+b.y)/2)<.02);
  }
  assert.equal([...svg.matchAll(/class="motion-joint-surface"/g)].length,4);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const m of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(m[1]));
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.deepEqual(p,before);
 }
});

test('all moving surfaces retain finite geometry and stable limb attachment across frames and poses',()=>{
 for(const [h,w]of[[62,140],[62,400],[78,340],[86,140],[86,400]])for(const mode of ['run','jump','acceleration'])for(const phase of [0,.12,.25,.5,.72,.98]){
  const p=make(h,w),svg=buildPlayerMotionSvg(p,{mode,phase});
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  assert.equal([...svg.matchAll(/class="motion-upper-surface"/g)].length,4);
  assert.equal([...svg.matchAll(/class="motion-lower-surface"/g)].length,4);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  const pose=solvePlayerMotion(p,{mode,phase});
  for(const limb of [...pose.legs,...pose.arms])assert.ok(Math.hypot(limb.end.x-limb.root.x,limb.end.y-limb.root.y)>0);
 }
});

test('a joint splitting a curved profile keeps its original cross-sections, rather than restarting the taper',()=>{
 // Read the actual SVG cubic on the lower arm; independent evaluation uses
 // the full static elbow-to-forearm landmark interval .50..66.
 const svg=profiledLimbSurface({x:0,y:0},{x:0,y:47},10,'arm',0,[.53,1]);
 const nums=svg.match(/^M([\d.\-]+) ([\d.\-]+) C([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+)/).slice(1).map(Number);
 const cubic=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
 for(let i=0;i<=100;i++){
  const t=i/100,global=.53+(.66-.53)*t,u=(global-.5)/.16;
  const ratio=.67+(.77-.67)*(3*u*u-2*u*u*u);
  assert.ok(Math.abs(cubic(nums[0],nums[2],nums[4],nums[6],t)-5*ratio)<.011);
  assert.ok(Math.abs(cubic(nums[1],nums[3],nums[5],nums[7],t)-(global-.53)*100)<.011);
 }
});
