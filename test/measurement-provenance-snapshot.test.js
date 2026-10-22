import test from 'node:test';
import assert from 'node:assert/strict';
import {compactSnapshotMeasurementProvenance as compact,expandSnapshotMeasurementProvenance as expand,MEASUREMENT_PROVENANCE_STORAGE} from '../src/runtime/measurementProvenanceSnapshot.js';
import {inspectSnapshotCompatibility,migrateSnapshot} from '../src/runtime/snapshotMigration.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {GameSession} from '../src/runtime/GameSession.js';
import {RNG} from '../src/utils/rng.js';
const json=x=>JSON.parse(JSON.stringify(x));

test('provenance interning preserves all source metadata and independent editing without changing measurements or identity',()=>{
  const provenance={armLengthInches:{kind:'measured',event:'Combine',year:2026,note:'Māori',custom:[0,null,{exact:.125}]}};
  const person={id:'one',profile:{appearanceRecipe:{version:'portrait-identity-v3',seed:'face',complexionBand:[0,1]}},measurements:{armLengthInches:32.125,provenance},measurementProvenance:provenance};
  const input={league:{players:[person,{...person,id:'two'}],retiredPlayers:[person],pendingDraft:{available:[person],year:2027}}},before=json(input),packed=compact(input);
  assert.equal(packed.measurementProvenanceStorage.version,MEASUREMENT_PROVENANCE_STORAGE);assert.equal(packed.measurementProvenanceStorage.dictionary.length,1);
  assert.deepEqual(expand(json(packed)),before);assert.deepEqual(input,before);assert.equal(compact(packed),packed);assert.equal(expand(before),before);
  const restored=expand(json(packed));restored.league.players[0].measurementProvenance.armLengthInches.note='edited';
  assert.equal(restored.league.players[1].measurementProvenance.armLengthInches.note,'Māori');
  assert.equal(restored.league.players[0].measurements.provenance.armLengthInches.note,'Māori');
});

test('invalid versions/references fail before replacing a franchise, including retired and prepared players',()=>{
  const input={schemaVersion:4,rngSeed:1,currentYear:2026,currentWeek:1,phase:'regular-season',league:{year:2026,teams:[],players:[{id:'one',measurementProvenance:{kind:'recorded'}}],retiredPlayers:[{id:'retired',measurementProvenance:{kind:'recorded'}}],pendingDraft:{available:[{id:'future',measurements:{provenance:{kind:'recorded'}}}]}}};
  const packed=compact(input);assert.equal(inspectSnapshotCompatibility(packed).ok,true);
  const invalid=[{...packed,measurementProvenanceStorage:{version:'unknown',dictionary:[]}},
    {...packed,measurementProvenanceStorage:{...packed.measurementProvenanceStorage,ignoredFact:true}}];
  for(const list of ['players','retiredPlayers','prospects'])for(const value of [-1,1,.5,'0',null,{},[]]){
    const broken=json(packed);const player=list==='prospects'?broken.league.pendingDraft.available[0]:broken.league[list][0];
    if(list==='prospects')player.measurements.provenance=value;else player.measurementProvenance=value;
    invalid.push(broken);
  }
  for(const broken of invalid){const before=json(broken);assert.equal(inspectSnapshotCompatibility(broken).reasonCode,'SNAPSHOT_MEASUREMENT_PROVENANCE_ENCODING_INVALID');assert.throws(()=>migrateSnapshot(broken),e=>e.reasonCode==='SNAPSHOT_MEASUREMENT_PROVENANCE_ENCODING_INVALID');assert.deepEqual(broken,before);}
});

test('both restoration seams preserve source dimensions, prospective stats, portraits and the next game exactly',()=>{
  const live=createSession({seed:99,startYear:2026,controlledTeamId:'BUF',mode:'play'});live.advanceWeek();
  const before=json(live.league),snapshot=json(live.toSnapshot());
  const migrated=createSessionFromSnapshot(snapshot),direct=GameSession.fromSnapshot(snapshot,seed=>new RNG(seed));
  for(const restored of [migrated,direct]){
    assert.deepEqual(restored.league.players.map(p=>[p.profile,p.measurements,p.measurementProvenance,p.seasonStats,p.careerStats]),before.players.map(p=>[p.profile,p.measurements,p.measurementProvenance,p.seasonStats,p.careerStats]));
    assert.deepEqual(json(restored.league.pendingDraft),before.pendingDraft);
  }
  assert.deepEqual(json(direct.advanceWeek()),json(live.advanceWeek()));
});
