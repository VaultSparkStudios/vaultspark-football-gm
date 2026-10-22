import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../../src/runtime/bootstrap.js';

// Simulate each identical starting season once. Every caller receives a fresh
// real save restoration, never the cached session or a shared mutable league.
// Tests that change the season before playing it retain their own simulation.
const completedSeasons=new Map();
export function completedSeasonFixture({seed=4242,startYear=2026,controlledTeamId='BUF'}={}){
 const key=JSON.stringify([seed,startYear,controlledTeamId]);
 if(!completedSeasons.has(key)){
  const session=createSession({seed,startYear,controlledTeamId});
  session.simulateOneSeason({runOffseasonAfter:false});
  let guard=0;
  while(session.phase!=='offseason'&&guard++<12)assert.equal(session.advanceWeek().ok,true);
  assert.equal(session.phase,'offseason','real completed season reaches offseason');
  completedSeasons.set(key,structuredClone(session.toSnapshot()));
 }
 return createSessionFromSnapshot(structuredClone(completedSeasons.get(key)));
}
