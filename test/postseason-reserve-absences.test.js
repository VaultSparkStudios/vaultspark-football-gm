import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {transitionReserveList,recordReserveGameAbsences,validateReserveListState} from '../src/domain/reserveLists.js';
import {createPostseasonState,nextPostseasonGame,simulateNextPostseasonGame} from '../src/engine/seasonSimulator.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';

function fixture() {
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  session.phase='postseason';session.currentWeek=19;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=next.homeTeamId;
  const player=session.league.players.find(row=>row.teamId===next.homeTeamId&&row.rosterSlot==='active');
  player.injury={type:'Out 8W',weeksRemaining:8};
  assert.equal(transitionReserveList(session.league,player,{year:2026,week:19,phase:'postseason'},{designation:'ir',active:true}).ok,true);
  const game=round=>canonicalFootballGame({year:2026,seasonType:'playoffs',round,
    label:round==='super-bowl'?'super-bowl':`afc-${round}`,homeTeamId:next.homeTeamId,awayTeamId:next.awayTeamId});
  return {session,player,game};
}

test('native week-zero playoff results record only this club game, deduplicate and survive save restoration',()=>{
  const {session,player}=fixture();
  const result=simulateNextPostseasonGame({state:session.postseasonState,league:session.league,
    statBook:session.statBook,year:2026,rng:session.rng,excludeElevationTeamIds:[session.controlledTeamId]}).game;
  assert.equal(result.week,0);
  assert.equal(player.reserveStatus.gamesMissed.length,1);
  assert.equal(session.league.reserveGameHistory[0].game.gameId,result.gameId);
  const before=JSON.stringify(session.toSnapshot());
  recordReserveGameAbsences({league:session.league,result});
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  const restored=createSessionFromSnapshot(structuredClone(session.toSnapshot()));
  assert.deepEqual(restored.league.players.find(row=>row.id===player.id).reserveStatus,player.reserveStatus);
});

test('four physical playoff absences satisfy the game requirement without counting the final bye as a game',()=>{
  const {session,player,game}=fixture();
  for(const round of ['wildcard','divisional','conference','super-bowl']) recordReserveGameAbsences({league:session.league,result:game(round)});
  assert.equal(player.reserveStatus.gamesMissed.length,4);
  assert.deepEqual(player.reserveStatus.gamesMissed.map(key=>Number(key.split(':')[2])),[19,20,21,23]);
  const context={year:2026,week:23,phase:'postseason'};
  assert.equal(transitionReserveList(session.league,player,context,{designation:'ir',active:false,beginPractice:true}).ok,true);
  assert.equal(player.reserveStatus.practiceStartedWeek,23);
  validateReserveListState(session.toSnapshot());
});

test('custom labels, mismatched IDs, another club and a week-zero unproved game cannot create absences',()=>{
  const {session,player,game}=fixture(),valid=game('wildcard');
  for(const result of [{...valid,label:'experiment'},{...valid,gameId:'invented'},
    {...valid,gameId:undefined},canonicalFootballGame({year:2026,seasonType:'playoffs',round:'wildcard',label:'nfc-wildcard',homeTeamId:'SEA',awayTeamId:'LAR'})])
    recordReserveGameAbsences({league:session.league,result});
  assert.equal(player.reserveStatus.gamesMissed.length,0);
});

test('native physical proof binds the imported key and refuses corruption at both restoration seams',()=>{
  const {session,game}=fixture();recordReserveGameAbsences({league:session.league,result:game('wildcard')});
  const bad=session.toSnapshot();bad.league.reserveGameHistory[0].game.gameId='invented';
  const before=JSON.stringify(bad);
  assert.equal(inspectSnapshotCompatibility(bad).reasonCode,'RESERVE_RECEIPT_INVALID');
  assert.throws(()=>validateReserveListState(bad),/physical game/);
  assert.throws(()=>createSessionFromSnapshot(bad),/physical game/);
  assert.equal(JSON.stringify(bad),before);
});

test('final return commands observe the elapsed two-week gap rather than the fourth UI round label',()=>{
  const {session}=fixture();
  for(let i=0;i<12;i++)simulateNextPostseasonGame({state:session.postseasonState,league:session.league,
    statBook:session.statBook,year:2026,rng:session.rng});
  const final=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=final.homeTeamId;session.currentWeek=22;
  const player=session.league.players.find(row=>row.teamId===final.homeTeamId&&row.rosterSlot==='active');
  player.injury={type:'Out 1W',weeksRemaining:1};
  assert.equal(transitionReserveList(session.league,player,{year:2026,week:1,phase:'regular-season'},{designation:'ir',active:true}).ok,true);
  // Controlled saved placement/practice specimen; the final bracket above is
  // played by the actual engine, without injected winners or round labels.
  for(let week=1;week<=4;week++)recordReserveGameAbsences({league:session.league,result:{year:2026,week,seasonType:'regular',
    homeTeamId:final.homeTeamId,awayTeamId:final.awayTeamId}});
  player.reserveStatus.practiceStartedWeek=19;player.injury=null;
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.setPlayerDesignation({playerId:player.id,teamId:player.teamId,designation:'ir',active:false}).reasonCode,'RESERVE_PRACTICE_EXPIRED');
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});

test('legacy numeric final receipts remain readable and are not duplicated by a native final replay',()=>{
  const {session,player,game}=fixture(),final=game('super-bowl');
  recordReserveGameAbsences({league:session.league,result:{year:2026,week:22,seasonType:'playoffs',homeTeamId:final.homeTeamId,awayTeamId:final.awayTeamId}});
  const before=JSON.stringify(session.toSnapshot());
  recordReserveGameAbsences({league:session.league,result:final});
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  assert.equal(player.reserveStatus.gamesMissed.length,1);validateReserveListState(session.toSnapshot());
});

test('a native final cannot acquire a second absence through reverse legacy replay',()=>{
  const {session,player,game}=fixture(),final=game('super-bowl');
  recordReserveGameAbsences({league:session.league,result:final});
  const before=JSON.stringify(session.toSnapshot());
  recordReserveGameAbsences({league:session.league,result:{year:2026,week:22,seasonType:'playoffs',homeTeamId:final.homeTeamId,awayTeamId:final.awayTeamId}});
  assert.equal(JSON.stringify(session.toSnapshot()),before);assert.equal(player.reserveStatus.gamesMissed.length,1);
});

test('duplicate final aliases in an import refuse before mutation and unproved numeric23 cannot add credit',()=>{
  const {session,player,game}=fixture(),final=game('super-bowl');
  recordReserveGameAbsences({league:session.league,result:{year:2026,week:23,seasonType:'playoffs',homeTeamId:final.homeTeamId,awayTeamId:final.awayTeamId}});
  assert.equal(player.reserveStatus.gamesMissed.length,0);
  recordReserveGameAbsences({league:session.league,result:final});
  const bad=session.toSnapshot(),alias=`2026:playoffs:22:${final.homeTeamId}:${final.awayTeamId}`;
  bad.league.reserveGameHistory.push({key:alias,playerIds:[player.id]});
  bad.league.players.find(row=>row.id===player.id).reserveStatus.gamesMissed.push(alias);
  const before=JSON.stringify(bad);
  assert.equal(inspectSnapshotCompatibility(bad).reasonCode,'RESERVE_RECEIPT_INVALID');
  assert.throws(()=>createSessionFromSnapshot(bad),/physical game/);
  assert.equal(JSON.stringify(bad),before);
});
