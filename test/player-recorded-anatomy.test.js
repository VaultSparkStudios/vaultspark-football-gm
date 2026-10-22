import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePfrPlayers } from '../src/data/pfrAdapter.js';
import { RNG } from '../src/utils/rng.js';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { resolvePlayerMeasurements } from '../src/domain/playerMeasurements.js';
import { ensurePlayerVisualIdentity } from '../src/domain/playerVisualIdentity.js';
import { buildPlayerPhysiqueSvg } from '../public/lib/playerPortrait.js';
import { buildPlayerMotionSvg, solvePlayerMotion } from '../public/lib/playerMotion.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { GameSession } from '../src/runtime/GameSession.js';
const base = { id:'recorded-frame',heightInches:74,weightLbs:225,age:24,ratings:{strength:70,speed:80,agility:75} };
const dto = p => ({...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});

test('imported anatomical dimensions preserve fractional source values, dates and distinct endpoints',()=>{
  const [p]=normalizePfrPlayers([{name:'Measured',position:'WR',height_inches:74,weight_lbs:225,
    hip_joint_span_inches:8.125,foot_length_inches:11.375,foot_width_inches:4.125,
    measurementProvenance:{hipJointSpanInches:{kind:'measured',endpoint:'hip-joint-center-to-center',year:2026}}}],new RNG(26),2026);
  const record=resolvePlayerMeasurements(p),f=playerFrame(p);
  assert.equal(record.values.hipJointSpanInches,8.125);
  assert.equal(record.provenance.hipJointSpanInches.year,2026);
  assert.equal(f.hipJointSpanInches,8.125);
  assert.equal(f.footLengthInches,11.375);assert.equal(f.footWidthInches,4.125);
  assert.equal(f.measurementReconciliation.length,3);
  assert.ok(f.measurementReconciliation.every(r=>r.status==='applied'));
});

test('recorded spacing constrains frontal and cut joint centers without changing mass or bone lengths',()=>{
  const small=dto({...base,hipJointSpanInches:6,footLengthInches:9,footWidthInches:3});
  const big=dto({...base,hipJointSpanInches:11,footLengthInches:14,footWidthInches:5});
  for(const key of ['volumeBudgetInches3','armSegmentLengthInches','legLengthInches','heightInches','weightLbs'])assert.equal(small.visualFrame[key],big.visualFrame[key]);
  for(const p of [small,big])for(const phase of [0,.2,.5,.9]){
    const pose=solvePlayerMotion(p,{mode:'cut',phase});
    assert.ok(Math.abs(Math.hypot(pose.legs[1].root.x-pose.legs[0].root.x,pose.legs[1].root.y-pose.legs[0].root.y)-p.hipJointSpanInches*6)<1e-8);
  }
  for(const view of ['front','side'])assert.notEqual(buildPlayerPhysiqueSvg(small,{view}),buildPlayerPhysiqueSvg(big,{view}));
  for(const mode of ['run','acceleration','jump','cut']){
    const svg=buildPlayerMotionSvg(big,{mode,phase:.37});
    assert.match(svg,/data-foot-length="14"/);assert.match(svg,/data-foot-width="5"/);
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  }
  const sources=Object.fromEntries([...buildPlayerPhysiqueSvg(big,{view:'front'}).matchAll(/<path class="physique-leg" d="M([^ ]+) /g)].map((m,i)=>[i,Number(m[1])]));
  assert.equal(sources[1]-sources[0],11*6);
});

test('incompatible methods and out-of-range observations remain recorded with explicit visual fallback',()=>{
  const p=ensurePlayerVisualIdentity({...base,profile:{}},{newPlayer:true}),original=playerFrame(p);
  const conflicting={...p,hipJointSpanInches:9,footLengthInches:30,footWidthInches:4,
    measurementProvenance:{hipJointSpanInches:{endpoint:'biiliocristal-breadth'}}};
  const f=playerFrame(conflicting),record=resolvePlayerMeasurements(conflicting);
  assert.equal(record.values.footLengthInches,30);assert.equal(f.footLengthInches,original.footLengthInches);
  assert.equal(f.hipJointSpanInches,undefined);assert.equal(f.pelvicBreadthInches,original.pelvicBreadthInches);
  assert.equal(f.measurementReconciliation[0].status,'incompatible-endpoint');
  assert.equal(f.measurementReconciliation[1].status,'outside-rendering-bounds');
  const partial=playerFrame({...base,footLengthInches:11});
  assert.equal(partial.footLengthInches,undefined);
  assert.equal(partial.measurementReconciliation[0].status,'companion-dimension-missing');
  assert.equal(resolvePlayerMeasurements({...base,pelvicBreadthInches:10}).values.hipJointSpanInches,null);
});

test('explicit dimensions are stable through weight, ratings, heritage and both snapshot restore seams',()=>{
  const s=createSession({seed:883,startYear:2026,controlledTeamId:'BUF'}),p=s.league.players.find(p=>p.teamId==='BUF');
  Object.assign(p,{hipJointSpanInches:8.125,footLengthInches:11.375,footWidthInches:4.125});
  p.measurementProvenance={footLengthInches:{kind:'measured',endpoint:'heel-to-longest-toe',date:'2026-02-26'}};
  const before=s.getPlayerProfile(p.id),rng=JSON.stringify(s.rng);
  for(const restored of [createSessionFromSnapshot(s.toSnapshot()),GameSession.fromSnapshot(s.toSnapshot(),seed=>new RNG(seed))]){
    const after=restored.getPlayerProfile(p.id);
    assert.deepEqual(after.player.bodyMeasurements,before.player.bodyMeasurements);
    assert.deepEqual(after.player.visualFrame,before.player.visualFrame);
  }
  const changed=playerFrame({...p,weightLbs:p.weightLbs+20,ratings:{strength:99,speed:99},profile:{...p.profile,identity:{...p.profile.identity,birthCountry:'Japan'}}});
  for(const key of ['hipJointSpanInches','footLengthInches','footWidthInches'])assert.equal(changed[key],before.player.visualFrame[key]);
  assert.equal(JSON.stringify(s.rng),rng);
});
