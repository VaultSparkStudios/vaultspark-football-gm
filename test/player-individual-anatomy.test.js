import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity,validateSnapshotVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {resolveIndividualAnatomy} from '../src/domain/playerMeasurements.js';
import {buildPlayerPhysiqueSvg} from '../public/lib/playerPortrait.js';
import {solvePlayerMotion,buildPlayerMotionSvg} from '../public/lib/playerMotion.js';
import {limbSectionProfile} from '../public/lib/physiqueGeometryContract.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
const dto=p=>({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
const make=seed=>ensurePlayerVisualIdentity({id:'individual-control',name:'Control',age:24,heightInches:74,weightLbs:225,armLengthInches:33,handLengthInches:8,ratings:{strength:70,speed:80,agility:70},profile:{individualAnatomyRecipe:{version:'individual-anatomy-v1',seed}}});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));

test('saved independent proportions retain identity and gameplay randomness through restore and weight changes',()=>{
  const session=createSession({seed:901,startYear:2026,controlledTeamId:'BUF'}),p=session.league.players.find(p=>p.teamId==='BUF');
  const random=JSON.stringify(session.rng),anatomy=resolveIndividualAnatomy(p,p.heightInches),original=playerFrame(p);
  assert.equal(p.profile.individualAnatomyRecipe.version,'individual-anatomy-v1');
  assert.deepEqual(resolveIndividualAnatomy({...p,name:'Renamed',age:p.age+10,teamId:'KC'},p.heightInches),anatomy);
  assert.deepEqual(resolveIndividualAnatomy({...p,weightLbs:p.weightLbs+20,ratings:{strength:99,speed:40}},p.heightInches),anatomy);
  playerAppearance(p);playerFrame(p);assert.equal(JSON.stringify(session.rng),random);
  const restored=createSessionFromSnapshot(session.toSnapshot()),after=restored.league.players.find(q=>q.id===p.id);
  assert.deepEqual(playerFrame(after),original);
  const legacy={id:'legacy',heightInches:74,weightLbs:225};ensurePlayerVisualIdentity(legacy);
  assert.equal(legacy.profile.individualAnatomyRecipe,undefined);assert.equal(resolveIndividualAnatomy(legacy,74),null);
});

test('invalid anatomy recipes reject active, retired and prospective snapshots',()=>{
  for(const key of ['players','retiredPlayers'])for(const recipe of [{version:'unknown',seed:'x'},{version:'individual-anatomy-v1',seed:''},{version:'individual-anatomy-v1',seed:'x',upperArmShare:.5}]){
    assert.throws(()=>validateSnapshotVisualIdentity({league:{[key]:[{profile:{individualAnatomyRecipe:recipe}}]}}),/visual identity/);
    assert.throws(()=>validateSnapshotVisualIdentity({league:{pendingDraft:{available:[{profile:{individualAnatomyRecipe:recipe}}]}}}),/visual identity/);
  }
});

test('malformed presentation proportions retain bounded finite geometry and matching solver/surface shares',()=>{
  const base=dto(make('boundary'));
  for(const key of ['upperArmShare','upperLegShare','pelvicBreadthInches','footLengthInches','footWidthInches'])for(const value of [null,undefined,NaN,Infinity,-Infinity,'bad',-100,0,1,100]){
    const player={...base,visualFrame:{...base.visualFrame,[key]:value}},before=structuredClone(player);
    for(const view of ['front','side'])assert.doesNotMatch(buildPlayerPhysiqueSvg(player,{view}),/NaN|Infinity|undefined/);
    for(const mode of ['run','acceleration','jump','cut']){
      const pose=solvePlayerMotion(player,{mode,phase:.37});
      assert.doesNotMatch(buildPlayerMotionSvg(player,{mode,phase:.37,idSuffix:'boundary'}),/NaN|Infinity|undefined/);
      assert.ok(Number.isFinite(pose.legs[0].joint.x));
    }
    assert.deepEqual(player,before);
  }
});

test('individual proportions conserve volume and exact articulated bone lengths in every movement',()=>{
  const samples=[];
  for(let i=0;i<40;i++){
    const p=dto(make(`anatomy-${i}`)),f=p.visualFrame;samples.push(f);
    for(const kind of ['arm','leg']){
      const share=kind==='arm'?f.upperArmShare:f.upperLegShare,diameter=kind==='arm'?f.upperArmWidth:f.thighWidth,length=kind==='arm'?f.armSegmentLengthInches:f.legLengthInches;
      const sections=limbSectionProfile(kind,f.limbShapeVariation,share);let sum=0;
      for(let k=1;k<sections.length;k++)for(let n=0;n<400;n++){
        const [lo,a]=sections[k-1],[hi,b]=sections[k],t=(n+.5)/400,ratio=a+(b-a)*(3*t*t-2*t*t*t);
        sum+=2*Math.PI/4*(diameter*ratio)**2*length*(hi-lo)/400;
      }
      const expected=kind==='arm'?f.armsVolumeInches3:f.legsVolumeInches3;
      assert.ok(Math.abs(sum/expected-1)<1e-6);
    }
    for(const mode of ['run','acceleration','jump','cut'])for(let n=0;n<=20;n++){
      const pose=solvePlayerMotion(p,{mode,phase:n/20});
      for(const leg of pose.legs){assert.ok(Math.abs(distance(leg.root,leg.joint)-pose.legLength*f.upperLegShare)<1e-7);assert.ok(Math.abs(distance(leg.joint,leg.end)-pose.legLength*(1-f.upperLegShare))<1e-7);if(leg.contact)assert.ok(Math.abs(leg.end.y-(pose.floor-15))<1e-7);}
      for(const arm of pose.arms){assert.ok(Math.abs(distance(arm.root,arm.joint)-pose.armLength*f.upperArmShare)<1e-7);assert.ok(Math.abs(distance(arm.joint,arm.end)-pose.armLength*(1-f.upperArmShare))<1e-7);}
      assert.doesNotMatch(buildPlayerMotionSvg(p,{mode,phase:n/20,idSuffix:'case'}),/NaN|Infinity|undefined/);
    }
    for(const view of ['front','side'])assert.match(buildPlayerPhysiqueSvg(p,{view}),/class="individual-footwear"/);
  }
  for(const key of ['upperArmShare','upperLegShare','pelvicBreadthInches','footLengthInches','footWidthInches'])assert.ok(new Set(samples.map(f=>f[key])).size>35,key);
});

test('legacy static and moving silhouettes remain exact without the new saved recipe',async context=>{
  // Preserved pre-change source is local evidence, not a fixture distributed
  // with production. The versioned decoder also has ordinary legacy tests.
  const dir='.cache/individual-anatomy-before';if(!fs.existsSync(dir)){context.skip('Preserved pre-change source available only in the implementation evidence workspace.');return;}
  const load=async file=>{
    const real=path.resolve(`public/lib/${file}`),source=fs.readFileSync(`${dir}/${file}.txt`,'utf8').replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(path.resolve(path.dirname(real),s)).href}${q}`);
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  };
  const oldStatic=await load('playerPortrait.js'),oldMotion=await load('playerMotion.js');let comparisons=0;
  for(const heightInches of [62,74,86])for(const weightLbs of [140,225,400])for(const age of [24,52]){
    const p=dto({id:'legacy-comparison',age,heightInches,weightLbs,ratings:{strength:70,speed:80}});
    for(const view of ['front','side']){assert.equal(buildPlayerPhysiqueSvg(p,{view,idSuffix:'compat'}),oldStatic.buildPlayerPhysiqueSvg(p,{view,idSuffix:'compat'}));comparisons++;}
    for(const mode of ['run','acceleration','jump','cut'])for(const phase of [0,.37,.8]){assert.equal(buildPlayerMotionSvg(p,{mode,phase,idSuffix:'compat'}),oldMotion.buildPlayerMotionSvg(p,{mode,phase,idSuffix:'compat'}));comparisons++;}
  }
  assert.equal(comparisons,252);
});
