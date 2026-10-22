import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerIdentity,playerAppearance,assignPlayerFamily} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity,validateSnapshotVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {createDraftClass,createSyntheticPlayer} from '../src/domain/playerFactory.js';
import {RNG} from '../src/utils/rng.js';
import {buildPlayerProfileNarrative} from '../public/lib/playerProfileNarrative.js';
const person = id => ensurePlayerVisualIdentity({id,age:25,heightInches:74,weightLbs:225,
  ratings:{speed:81,strength:77},profile:{identity:createPlayerIdentity(id)}},{newPlayer:true});

test('explicit relatives share background and pigmentation while retaining individual faces and physical ability',()=>{
  const parent=person('parent'),child=person('child'),sibling=person('sibling');
  const original=structuredClone(child);
  assignPlayerFamily(child,parent);assignPlayerFamily(sibling,parent);
  for(const relative of [child,sibling]){
    assert.equal(relative.profile.identity.surveyCategory,parent.profile.identity.surveyCategory);
    assert.deepEqual(relative.profile.identity.heritage,parent.profile.identity.heritage);
    const a=playerAppearance(relative),p=playerAppearance(parent);
    assert.ok(Math.abs(a.complexion-p.complexion)<.14);
    assert.equal(a.naturalHairColor,p.naturalHairColor);
    assert.equal(a.eyeColor,p.eyeColor);
    assert.notEqual(relative.profile.appearanceRecipe.seed,parent.profile.appearanceRecipe.seed);
  }
  assert.deepEqual(child.ratings,original.ratings);
  assert.equal(child.heightInches,original.heightInches);assert.equal(child.weightLbs,original.weightLbs);
  assert.notDeepEqual(playerAppearance(child),playerAppearance(sibling));
  const restored=JSON.parse(JSON.stringify(child));ensurePlayerVisualIdentity(restored);
  assert.deepEqual(playerAppearance(restored),playerAppearance(child));
  const fresh=createPlayerIdentity('new-relative',{family:parent.profile.family});
  assert.equal(fresh.surveyCategory,parent.profile.identity.surveyCategory);
  assert.deepEqual(fresh.heritage,parent.profile.identity.heritage);
});

test('family errors reject before mutation and are rejected on snapshot import',()=>{
  const p=person('malformed'),before=structuredClone(p);
  assert.throws(()=>assignPlayerFamily(p,{...person('bad-anchor'),profile:{family:{version:'unknown'}}}));
  assert.deepEqual(p,before);
  p.profile.family={version:'unknown'};
  assert.throws(()=>validateSnapshotVisualIdentity({league:{players:[p]}}),/family/);
});

test('matching surnames never establishes kinship and unlinked people remain unchanged',()=>{
  const a=person('a'),b=person('b');a.name=b.name='Alex Smith';
  const before=playerAppearance(b);assignPlayerFamily(person('c'),a);
  assert.equal(b.profile.family,undefined);assert.deepEqual(playerAppearance(b),before);
});

test('import rejects divergent family pigment and inconsistent copies of one family authority',()=>{
  const parent=person('shared-parent'),child=person('shared-child');assignPlayerFamily(child,parent);
  validateSnapshotVisualIdentity({league:{players:[parent,child]}});
  const changed=structuredClone(child);changed.profile.appearanceRecipe.complexionBand=[0,0];
  assert.throws(()=>validateSnapshotVisualIdentity({league:{players:[changed]}}),/family complexion/);
  const conflicting=structuredClone(child);conflicting.profile.family.appearanceSeed='other-family-seed';
  assert.throws(()=>validateSnapshotVisualIdentity({league:{players:[parent,conflicting]}}),/conflicting records/);
});

test('runtime draft cohort includes recognizable family links without changing football RNG, talent or measurements',()=>{
  const anchor=createSyntheticPlayer({teamId:'BUF',position:'QB',year:2026,rng:new RNG(19)});
  anchor.profile.identity.birthYear=1980;anchor.name='James Family';
  const rng1=new RNG(118),rng2=new RNG(118);
  const unlinked=createDraftClass({size:128,year:2026,rng:rng1});
  const linked=createDraftClass({size:128,year:2026,rng:rng2,familyAnchors:[anchor]});
  assert.equal(rng1.seed,rng2.seed);
  const relatives=linked.filter(p=>p.profile.familyRelationship);assert.ok(relatives.length>0);
  for(let i=0;i<linked.length;i++){
    for(const key of ['ratings','heightInches','weightLbs','measurements','potential','contract'])assert.deepEqual(linked[i][key],unlinked[i][key]);
  }
  for(const p of relatives){
    assert.equal(p.profile.identity.surveyCategory,anchor.profile.identity.surveyCategory);
    assert.equal(p.profile.familyRelationship.relation,'son');
    assert.ok(p.name.endsWith(' Family'));
    const text=buildPlayerProfileNarrative({player:{...p,isDraftProspect:true}}).facts.join(' ');
    assert.match(text,/son of James Family/);
  }
  const stale=createDraftClass({size:128,year:2126,rng:new RNG(118),familyAnchors:[anchor]});
  assert.ok(stale.every(p=>!p.profile.familyRelationship));
  anchor.profile.identity.birthYear=null;anchor.age=40;anchor.status='retired';anchor.retiredYear=2026;
  const legacy=createDraftClass({size:128,year:2126,rng:new RNG(118),familyAnchors:[anchor]});
  assert.ok(legacy.every(p=>!p.profile.familyRelationship));
});
