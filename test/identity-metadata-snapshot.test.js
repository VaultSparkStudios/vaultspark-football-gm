import test from 'node:test';import assert from 'node:assert/strict';
import {compactSnapshotIdentityMetadata,expandSnapshotIdentityMetadata} from '../src/runtime/identityMetadataSnapshot.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {playerAppearance} from '../src/domain/playerIdentity.js';

test('naming metadata dictionary round-trips every player collection independently and leaves appearance/family facts untouched',()=>{
  const p={id:'p',profile:{identity:{name:'Example',namingCohort:{period:2020},namingContext:{source:'fictional',extra:[1,null]}},appearanceRecipe:{version:'x',seed:'unchanged'},family:{id:'f'}}};
  const snapshot={league:{players:[p],retiredPlayers:[structuredClone(p)],pendingDraft:{available:[structuredClone(p)]}}},before=structuredClone(snapshot);
  const packed=compactSnapshotIdentityMetadata(snapshot),expanded=expandSnapshotIdentityMetadata(packed);
  assert.deepEqual(snapshot,before);assert.deepEqual(expanded,snapshot);assert.deepEqual(compactSnapshotIdentityMetadata(packed),packed);
  expanded.league.players[0].profile.identity.namingContext.extra.push(2);
  assert.deepEqual(expanded.league.retiredPlayers[0].profile.identity.namingContext.extra,[1,null]);
  assert.deepEqual(expanded.league.pendingDraft.available[0].profile.identity.namingContext.extra,[1,null]);
  assert.deepEqual(expandSnapshotIdentityMetadata(snapshot),snapshot);
});

test('actual current snapshot shrinks naming provenance and restores identical appearance and identity',()=>{
  const s=createSession({seed:99,startYear:2026,controlledTeamId:'BUF'}),snapshot=s.toSnapshot();
  const expanded=expandSnapshotIdentityMetadata(snapshot);
  const savings=JSON.stringify(expanded).length-JSON.stringify(snapshot).length;
  assert.ok(savings>500000,`lossless savings ${savings}`);
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(snapshot)));
  for(let i=0;i<s.league.players.length;i++){
    assert.deepEqual(restored.league.players[i].profile.identity,s.league.players[i].profile.identity);
    assert.deepEqual(playerAppearance(restored.league.players[i]),playerAppearance(s.league.players[i]));
  }
  const malformed=structuredClone(snapshot);malformed.league.players[0].profile.identity.namingContext=-1;
  assert.equal(inspectSnapshotCompatibility(malformed).ok,false);
  assert.throws(()=>createSessionFromSnapshot(malformed),/identity metadata/);
  malformed.identityMetadataStorage.version='future';assert.equal(inspectSnapshotCompatibility(malformed).ok,false);
});
