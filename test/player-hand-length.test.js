import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePfrPlayers } from '../src/data/pfrAdapter.js';
import { resolvePlayerMeasurements } from '../src/domain/playerMeasurements.js';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { buildPlayerPhysiqueSvg } from '../public/lib/playerPortrait.js';
import { RNG } from '../src/utils/rng.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';

test('imported hand length and spread hand span remain separate, with precision and source method', () => {
  const [player] = normalizePfrPlayers([{name:'Measured hands',position:'WR',height_inches:75,weight_lbs:210,
    arm_length_inches:33,hand_size_inches:10.25,hand_length_inches:8.125,
    measurementProvenance:{handLengthInches:{kind:'measured',method:'wrist-crease-to-middle-fingertip',source:'fixture'}}}],new RNG(91),2026);
  const record=resolvePlayerMeasurements(player);
  assert.equal(record.values.handLengthInches,8.125);
  assert.equal(record.values.handSizeInches,10.25);
  assert.equal(record.provenance.handLengthInches.method,'wrist-crease-to-middle-fingertip');
  assert.deepEqual(resolvePlayerMeasurements(structuredClone(player)),record);
});

test('measured hand length moves the wrist while preserving shoulder-to-fingertip reach and mass', () => {
  const base={id:'hand-control',heightInches:75,weightLbs:210,armLengthInches:33,handSizeInches:10.25};
  const short=playerFrame({...base,handLengthInches:7}),long=playerFrame({...base,handLengthInches:9});
  assert.equal(short.handLengthInches,7);assert.equal(long.handLengthInches,9);
  for(const frame of [short,long]) {
    assert.equal(frame.armSegmentLengthInches+frame.handLengthInches,33);
    assert.equal(frame.volumeBudgetInches3,playerFrame(base).volumeBudgetInches3);
    assert.equal(frame.handSizeInches,10.25);
  }
  const render=(frame,view)=>buildPlayerPhysiqueSvg({...base,appearance:playerAppearance(base),visualFrame:frame},{view});
  const paths=svg=>[...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(m=>m[1]);
  for(const view of ['front','side'])assert.notDeepEqual(paths(render(short,view)),paths(render(long,view)));
});

test('unknown hand length stays unknown and legacy physique uses the existing estimate', () => {
  const base={id:'legacy-hands',heightInches:75,weightLbs:210,armLengthInches:33,handSizeInches:10.25};
  assert.equal(resolvePlayerMeasurements(base).values.handLengthInches,null);
  assert.equal(resolvePlayerMeasurements(base).provenance.handLengthInches.kind,'unknown');
  const frame=playerFrame(base);
  assert.equal(frame.handLengthInches,undefined,'do not rewrite legacy frame recipes');
  assert.equal(frame.armSegmentLengthInches,33-75*.1);
  for(const value of [null,'',NaN,0,-1])assert.deepEqual(playerFrame({...base,handLengthInches:value}),frame);
  const unusual={...base,handLengthInches:25};
  assert.equal(resolvePlayerMeasurements(unusual).values.handLengthInches,25,'retain source observation');
  assert.deepEqual(playerFrame(unusual),frame,'unusable anatomy keeps the visual estimate');
});

test('hand length and its method survive compressed restoration and profile projection',async()=>{
  const session=createSession({seed:914,startYear:2026,controlledTeamId:'BUF'});
  const player=session.league.players.find(p=>p.teamId==='BUF');
  player.handLengthInches=8.125;
  player.measurementProvenance={...player.measurementProvenance,handLengthInches:{kind:'measured',method:'wrist-crease-to-middle-fingertip',source:'fixture'}};
  const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  const before=session.getPlayerProfile(player.id),after=restored.getPlayerProfile(player.id);
  assert.deepEqual(after.player.bodyMeasurements,before.player.bodyMeasurements);
  assert.equal(after.player.visualFrame.handLengthInches,8.125);
  assert.equal(after.player.visualFrame.armSegmentLengthInches+8.125,after.player.visualFrame.armLengthInches);
});
