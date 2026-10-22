import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { recordPostseasonResult } from '../src/sport/football/postseason.js';

const order = ['AFC-wildcard','AFC-wildcard','AFC-wildcard','NFC-wildcard','NFC-wildcard','NFC-wildcard',
  'AFC-divisional','AFC-divisional','NFC-divisional','NFC-divisional','AFC-conference','NFC-conference','NFL-super-bowl'];
const fixture = () => {
  const session = createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  session.phase = 'postseason';
  session.postseasonState = createPostseasonState({league:session.league,year:2026});
  return session;
};
const play = session => simulateNextPostseasonGame({state:session.postseasonState,league:session.league,
  statBook:session.statBook,year:2026,rng:session.rng});

test('actual new bracket plays both conferences in chronological rounds with independent reseeding',()=>{
  const session = fixture(), state = session.postseasonState, seen = [];
  assert.equal(state.schemaVersion,'2.0');
  while(state.status!=='completed') {
    const next = nextPostseasonGame(state,session.league);
    seen.push(`${next.conference}-${next.round}`);
    if(next.round==='divisional'&&state.gameIndex===0) {
      const bySeed = new Map(state.seeds[next.conference].map(row=>[row.teamId,row.seed]));
      const winners = state.bracket[next.conference].wildcard.map(game=>game.winnerId);
      assert.equal(next.homeTeamId,state.seeds[next.conference].find(row=>row.seed===1).teamId);
      assert.equal(next.awayTeamId,winners.slice().sort((a,b)=>bySeed.get(b)-bySeed.get(a))[0]);
      assert.ok(state.matchups.flat().every(id=>bySeed.has(id)),'conference winners cannot leak across brackets');
    }
    if(next.round==='conference') {
      const finalists = state.bracket[next.conference].divisional.map(game=>game.winnerId);
      assert.deepEqual(new Set([next.homeTeamId,next.awayTeamId]),new Set(finalists));
    }
    assert.ok(play(session)?.game);
  }
  assert.deepEqual(seen,order);
  assert.equal(state.gameArchiveEntries.length,13);
  const ranks = {wildcard:0,divisional:1,conference:2,'super-bowl':3};
  assert.ok(state.gameArchiveEntries.every((game,index,all)=>index===0||ranks[game.round]>=ranks[all[index-1].round]));
  assert.equal(state.bracket.AFC.wildcard.length,3);
  assert.equal(state.bracket.NFC.wildcard.length,3);
});

test('compressed save mid NFC wildcard preserves new bracket order and exact remaining results',async()=>{
  const original = fixture();
  for(let game=0;game<4;game++)play(original);
  const checkpoint = structuredClone(original.postseasonState);
  assert.equal(checkpoint.stage,'NFC-wildcard');
  assert.equal(checkpoint.gameIndex,1);
  const restored = createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(original.toSnapshot())));
  assert.deepEqual(restored.postseasonState,checkpoint);
  while(original.postseasonState.status!=='completed') {
    assert.deepEqual(nextPostseasonGame(restored.postseasonState,restored.league),nextPostseasonGame(original.postseasonState,original.league));
    assert.deepEqual(play(restored),play(original));
  }
  assert.deepEqual(restored.postseasonState,original.postseasonState);
  assert.equal(restored.rng.seed,original.rng.seed);
});

test('version-one saved bracket retains recorded conference-first history without replaying games',()=>{
  const session = fixture(), state = session.postseasonState;
  state.schemaVersion='1.0';
  const stages = [];
  while(state.status!=='completed') {
    stages.push(state.stage);
    play(session);
  }
  assert.deepEqual(stages,['AFC-wildcard','AFC-wildcard','AFC-wildcard','AFC-divisional','AFC-divisional','AFC-conference',
    'NFC-wildcard','NFC-wildcard','NFC-wildcard','NFC-divisional','NFC-divisional','NFC-conference','NFL-super-bowl']);
  const completed = JSON.stringify(session.toSnapshot());
  assert.equal(play(session),null);
  assert.equal(JSON.stringify(session.toSnapshot()),completed);
});

test('unsupported bracket version refuses before RNG, stats or bracket changes',()=>{
  const session = fixture();
  session.postseasonState.schemaVersion='unknown';
  const before = JSON.stringify(session.toSnapshot());
  assert.throws(()=>play(session),/Unsupported football postseason state version/);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});

test('direct competition result hook rejects unsupported versions before any bracket mutation',()=>{
  const session = fixture(), state = session.postseasonState;
  const next = nextPostseasonGame(state,session.league);
  state.schemaVersion='unknown';
  const before = JSON.stringify(session.toSnapshot());
  assert.throws(()=>recordPostseasonResult({state,league:session.league,next,
    result:{gameId:'unsupported-proof',homeScore:10,awayScore:0,winnerId:next.homeTeamId}}),/Unsupported football postseason state version/);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});
