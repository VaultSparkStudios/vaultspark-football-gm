import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedPlayerService, playerServiceCount, recordFootballGameService, finalizeFootballServiceSeason } from '../src/domain/playerService.js';
import { applyFootballPostGame } from '../src/engine/gameDayRoster.js';
import { practiceEligibilityGroup } from '../src/domain/practiceSquadEligibility.js';
import { contractMarketOptions } from '../src/domain/contracts.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { simulateMatch } from '../src/engine/gameSimulator.js';
import { simulateSeason } from '../src/engine/seasonSimulator.js';
import { assertSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';
const makePlayer = (id, extra = {}) => ({ id, teamId:'BUF', status:'active', rosterSlot:'active', experience:0,
  contract:{salary:885000,baseSalary:885000}, ...generatedPlayerService(0), ...extra });
const game = (week, dressed = [], extra = {}) => ({year:2026,week,seasonType:'regular',gameId:`G${week}`,homeTeamId:'BUF',awayTeamId:'MIA',
  boxScore:{gameDayRosters:{home:{playerIds:dressed},away:{playerIds:[]}}},...extra});

test('six accrued and three salary-credit games use full pay, separate reserve exclusions and dressed counts', () => {
  const players = [makePlayer('inactive',{designations:{gameDayInactive:true}}),makePlayer('dressed'),
    makePlayer('ir',{designations:{ir:true}}),makePlayer('ps',{rosterSlot:'practice'}),
    makePlayer('nfi',{designations:{nfi:true}}),makePlayer('pupUnknown',{designations:{pup:true}}),
    makePlayer('pupFootball',{designations:{pup:true},serviceHistory:{pupOrigin:'football'}}),
    makePlayer('pupNonfootball',{designations:{pup:true},serviceHistory:{pupOrigin:'nonfootball'}}),
    makePlayer('exempt',{designations:{exemptCommissioner:true}}),
    makePlayer('unpaid',{serviceHistory:{fullPayByGame:Object.fromEntries(Array.from({length:6},(_,i)=>[`2026:${i+1}`,false]))}})];
  const league={players};
  for(let week=1;week<=6;week++) recordFootballGameService({league,result:game(week,['dressed'])});
  assert.equal(players[0].accruedSeasons,0,'current season does not reprice salary tiers midway');
  finalizeFootballServiceSeason(league,2026);
  assert.equal(players[0].accruedSeasons,1); assert.equal(players[0].creditedSeasons,1);
  assert.equal(players[0].serviceHistory.loneAccruedSeasonActiveGames,0);
  assert.equal(players[1].serviceHistory.loneAccruedSeasonActiveGames,6);
  assert.equal(players[2].accruedSeasons,1); assert.equal(players[2].creditedSeasons,0);
  assert.equal(players[6].accruedSeasons,1); assert.equal(players[6].creditedSeasons,1);
  for(const i of [3,4,5,7,8,9]) { assert.equal(players[i].accruedSeasons,0); assert.equal(players[i].creditedSeasons,0); }
  assert.equal(practiceEligibilityGroup(players[0]).group,'inexperienced');
  assert.equal(contractMarketOptions({year:2027,capModel:{version:'nfl-modern-cap-v1'}},players[2]).creditedSeasons,0);
});

test('thresholds, reporting/holdout exclusions and granted hardship remain purpose-specific', () => {
  const two=makePlayer('two'),three=makePlayer('three'),five=makePlayer('five'),six=makePlayer('six');
  const hold=makePlayer('hold',{serviceHistory:{accrualRestrictions:{2026:{materialHoldout:true}}}});
  const noReport=makePlayer('noReport',{serviceHistory:{accrualRestrictions:{2026:{reportedToCamp:false}}}});
  const hardship=makePlayer('hardship',{serviceHistory:{accrualRestrictions:{2026:{reportedToCamp:false,hardshipExceptionGranted:true}}}});
  for(const [p,n] of [[two,2],[three,3],[five,5],[six,6],[hold,6],[noReport,6],[hardship,6]]) {
    const league={players:[p]}; for(let week=1;week<=n;week++) recordFootballGameService({league,result:game(week,[p.id])});
    finalizeFootballServiceSeason(league,2026);
  }
  assert.deepEqual([two.creditedSeasons,three.creditedSeasons,five.accruedSeasons,six.accruedSeasons],[0,1,0,1]);
  for(const p of [hold,noReport]) { assert.equal(p.accruedSeasons,0); assert.equal(p.creditedSeasons,1); }
  assert.equal(hardship.accruedSeasons,1);
});

test('trade/retry duplicates and postseason games do not create extra regular service', () => {
  const p=makePlayer('p'),league={players:[p]};
  for(let week=1;week<=6;week++) {
    recordFootballGameService({league,result:game(week,['p'])});
    p.teamId='MIA'; recordFootballGameService({league,result:game(week,['p'],{gameId:`other${week}`})}); p.teamId='BUF';
  }
  recordFootballGameService({league,result:game(0,['p'],{seasonType:'playoffs',gameId:'playoff'})});
  finalizeFootballServiceSeason(league,2026); const before=JSON.stringify(p);
  finalizeFootballServiceSeason(league,2026); recordFootballGameService({league,result:game(7,['p'])});
  assert.equal(JSON.stringify(p),before); assert.equal(p.accruedSeasons,1);
  assert.equal(p.serviceHistory.loneAccruedSeasonActiveGames,6);
});

test('unknown imported prior service stays unknown and its proxy freezes while observed games accrue', () => {
  const p=makePlayer('old',{experience:4}); delete p.serviceLedger; delete p.accruedSeasons; delete p.creditedSeasons;
  const league={players:[p]}; for(let week=1;week<=6;week++) recordFootballGameService({league,result:game(week)});
  p.experience=10; finalizeFootballServiceSeason(league,2026);
  assert.equal(p.accruedSeasons,undefined); assert.equal(p.creditedSeasons,undefined);
  assert.deepEqual(playerServiceCount(p,'accrued'),{seasons:5,observedSeasons:1,completeHistory:false,provenance:'frozen-experience-proxy-plus-observed-service'});
  assert.equal(p.serviceHistory?.loneAccruedSeasonActiveGames,undefined);
});

test('suspensions remain unavailable through kickoff, exclude pay service, survive byes and decrement after applied games once', () => {
  const p=makePlayer('p',{suspensionWeeks:1}),league={players:[p]};
  applyFootballPostGame({league,result:game(1,[],{homeTeamId:'NE',awayTeamId:'NYJ'})});
  assert.equal(p.suspensionWeeks,1);
  applyFootballPostGame({league,result:game(2)}); assert.equal(p.suspensionWeeks,0);
  applyFootballPostGame({league,result:game(2)});
  assert.equal(p.serviceLedger.seasons[2026].accrued,0);
  for(let week=3;week<=5;week++) applyFootballPostGame({league,result:game(week,['p'])});
  finalizeFootballServiceSeason(league,2026); assert.equal(p.creditedSeasons,1); assert.equal(p.accruedSeasons,0);
});

test('actual weekly match previews are pure and applied games/save/offseason preserve distinct service', () => {
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  const roster=session.league.players.filter(p=>p.teamId==='BUF'&&p.rosterSlot==='active');
  const suspended=roster[0]; suspended.suspensionWeeks=1;
  const before=JSON.stringify(session.toSnapshot());
  const match=simulateMatch({league:session.league,statBook:session.statBook,homeTeamId:'BUF',awayTeamId:'MIA',year:2026,week:1,rng:new session.rng.constructor(session.rng.seed)});
  assert.equal(JSON.stringify(session.toSnapshot()),before,'preview records no applied service');
  assert.ok(!match.result.boxScore.gameDayRosters.home.playerIds.includes(suspended.id));
  session.advanceWeek(); assert.equal(suspended.suspensionWeeks,0);
  const tracked=roster.find(p=>p!==suspended&&p.teamId==='BUF');
  assert.ok(tracked.serviceLedger.seasons[2026].seen>0);
  const restored=createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  assert.deepEqual(restored.getPlayerById(tracked.id).serviceLedger,tracked.serviceLedger);
});

test('headless season facade records distinct scheduled weeks instead of repeating default week zero', () => {
  const session=createSession({seed:118,startYear:2026,controlledTeamId:'BUF'});
  const result=simulateSeason({league:session.league,statBook:session.statBook,year:2026,rng:session.rng,mode:'stat'});
  assert.ok(result);
  const rookie=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='active'&&p.accruedSeasons===0);
  assert.ok(rookie); finalizeFootballServiceSeason(session.league,2026);
  assert.equal(rookie.accruedSeasons,1); assert.equal(rookie.creditedSeasons,1);
  assert.equal(rookie.serviceHistory.loneAccruedSeasonActiveGames>=0,true);
});

test('invalid service formats/masks refuse import and match before state or RNG mutation', () => {
  const session=createSession({seed:119,startYear:2026,controlledTeamId:'BUF'});
  const p=session.league.players.find(p=>p.teamId==='BUF');
  p.serviceLedger.seasons[2026]={seen:1,accrued:2,credited:0,active:0,activeListKnown:true};
  const snapshot=JSON.parse(JSON.stringify(session.toSnapshot())),before=JSON.stringify(snapshot),seed=session.rng.seed;
  assert.throws(()=>createSessionFromSnapshot(snapshot),error=>error.reasonCode==='PLAYER_SERVICE_INVALID');
  assert.equal(JSON.stringify(snapshot),before);
  assert.throws(()=>simulateMatch({league:session.league,statBook:session.statBook,year:2026,week:1,homeTeamId:'BUF',awayTeamId:'MIA',rng:session.rng}),error=>error.reasonCode==='PLAYER_SERVICE_INVALID');
  assert.equal(session.rng.seed,seed);
  p.serviceLedger.version='future-unknown';
  assert.throws(()=>createSessionFromSnapshot(session.toSnapshot()),error=>error.reasonCode==='PLAYER_SERVICE_INVALID');
});

test('prepared draft prospects reject future and malformed service before snapshot replacement', () => {
  const session=createSession({seed:120,startYear:2026,controlledTeamId:'BUF'});
  session.prepareDraft();
  for (const mutate of [
    ledger => { ledger.version='future-unsupported'; },
    ledger => { ledger.seasons[2026]={seen:1,accrued:2,credited:0,active:0,activeListKnown:true}; }
  ]) {
    const snapshot=JSON.parse(JSON.stringify(session.toSnapshot()));
    const prospect=snapshot.league.pendingDraft.available[0];
    assert.ok(prospect?.serviceLedger);
    mutate(prospect.serviceLedger);
    const before=JSON.stringify(snapshot),liveBefore=JSON.stringify(session.toSnapshot());
    assert.throws(()=>assertSnapshotCompatibility(snapshot),error=>error.reasonCode==='PLAYER_SERVICE_INVALID');
    assert.throws(()=>createSessionFromSnapshot(snapshot),error=>error.reasonCode==='PLAYER_SERVICE_INVALID');
    assert.equal(JSON.stringify(snapshot),before);
    assert.equal(JSON.stringify(session.toSnapshot()),liveBefore);
  }
});
