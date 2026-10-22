import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {RNG} from '../src/utils/rng.js';
import {simulateMatch,simulateGame} from '../src/engine/gameSimulator.js';
import {getGameTeamPlayers,applyFootballPostGame} from '../src/engine/gameDayRoster.js';
import {getTeamPlayers} from '../src/domain/teamFactory.js';
import {standardElevationGame,declareStandardElevation} from '../src/domain/standardElevations.js';
import {finalizeFootballServiceSeason} from '../src/domain/playerService.js';
import {priorActiveInactiveGames,validateActiveInactiveHistory} from '../src/domain/activeInactiveHistory.js';
import {createPostseasonState,nextPostseasonGame,simulateNextPostseasonGame,simulateSeason} from '../src/engine/seasonSimulator.js';
import {getSportRules} from '../src/sport/registry.js';
import {normalizeRosterSlots,enforceRosterAndCapCompliance,releaseToFreeAgency} from '../src/engine/capCompliance.js';
import {activatePracticePlayer} from '../src/domain/practiceContracts.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';

const fixture=()=>createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
const regular=week=>standardElevationGame({year:2026,week,homeTeamId:'BUF',awayTeamId:'MIA',label:'regular-season'});
function elevate(session,player,game){return declareStandardElevation({league:session.league,player,teamId:player.teamId,game,capSpace:session.getTeamCapSummary(player.teamId).capSpace});}
function match(session,game){return {league:session.league,statBook:session.statBook,rng:new RNG(117),...game};}

test('actual match dresses an elevated athlete and pays/credits an undressed elevation before automatic reversion',()=>{
  const session=fixture(),league=session.league,game=regular(1);
  const [playing,inactive]=league.players.filter(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining&&!p.suspensionWeeks).slice(0,2);
  assert.ok(playing&&inactive);playing.overall=99;playing.ratings.strength=99;playing.morale=99;
  league.depthCharts.BUF[playing.position]=[playing.id,...league.depthCharts.BUF[playing.position].filter(id=>id!==playing.id)];
  const contracts=[playing,inactive].map(p=>structuredClone(p.contract));
  assert.equal(elevate(session,playing,game).ok,true);assert.equal(elevate(session,inactive,game).ok,true);
  inactive.designations.gameDayInactive=true;
  assert.ok(!getTeamPlayers(league,'BUF').includes(playing));assert.ok(getGameTeamPlayers(league,'BUF',game).includes(playing));
  assert.ok(!getGameTeamPlayers(league,'BUF',regular(2)).includes(playing));
  const before=JSON.stringify(session.toSnapshot());const preview=simulateMatch(match(session,game));
  assert.equal(JSON.stringify(session.toSnapshot()),before,'preview cannot apply service, pay or history');
  assert.ok(preview.result.boxScore.gameDayRosters.home.playerIds.includes(playing.id));
  assert.ok(!preview.result.boxScore.gameDayRosters.home.playerIds.includes(inactive.id));
  assert.ok(preview.result.boxScore.gameDayRosters.home.playerIds.length<=48);
  const result=simulateGame(match(session,game));
  for(const [index,p]of [playing,inactive].entries()){
    assert.equal(p.rosterSlot,'practice');assert.deepEqual(p.contract,contracts[index]);
    assert.equal(p.standardElevations.games[0].status,'reverted');
    assert.equal(p.serviceLedger.seasons[2026].accrued&1,1);assert.equal(p.serviceLedger.seasons[2026].credited&1,1);
    assert.equal(league.activeInactiveHistory.clubs.BUF.membership[p.id][0],1);
  }
  assert.equal(inactive.serviceLedger.seasons[2026].active&1,0);
  assert.equal(league.activeInactiveHistory.clubs.BUF.membership[inactive.id][0],1,'undressed still on Active/Inactive list');
  assert.equal(Object.keys(league.activeInactiveHistory.clubs.BUF.membership).length,55);
  assert.equal(inactive.designations.gameDayInactive,false);
  const paid=JSON.stringify(league.capLedger.BUF);applyFootballPostGame({league,result});assert.equal(JSON.stringify(league.capLedger.BUF),paid);
  const restored=createSessionFromSnapshot(session.toSnapshot());assert.deepEqual(restored.league.activeInactiveHistory,league.activeInactiveHistory);
});

test('three actual zero-snap regular elevations earn salary-credited service without inventing an accrued season',()=>{
  const session=fixture(),player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining);
  const initial={credited:player.creditedSeasons,accrued:player.accruedSeasons};
  for(const week of [1,2,3]){
    const game=regular(week);assert.equal(elevate(session,player,game).ok,true);player.designations.gameDayInactive=true;
    simulateGame(match(session,game));
  }
  finalizeFootballServiceSeason(session.league,2026);
  assert.equal(player.creditedSeasons,initial.credited+1);assert.equal(player.accruedSeasons,initial.accrued);
  assert.equal(player.serviceLedger.seasons[2026].active,0);
  assert.equal(elevate(session,player,regular(4)).reasonCode,'ELEVATION_SEASON_LIMIT');
});

test('actual bracket elevations receive sourced pay and revert while keeping weekly postseason practice benefits',()=>{
  const session=fixture(),league=session.league,state=createPostseasonState({league,year:2026});
  const caps=Object.fromEntries(league.teams.map(t=>[t.id,session.getTeamCapSummary(t.id).capSpace]));
  let count=0;
  while(state.status!=='completed'){
    const next=nextPostseasonGame(state,league),teamId=next.homeTeamId;
    const player=league.players.find(p=>p.teamId===teamId&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
    assert.ok(player);
    const game=standardElevationGame({...next,year:2026,seasonType:'playoffs',label:next.round==='super-bowl'?'super-bowl':`${next.conference.toLowerCase()}-${next.round}`});
    const previous=priorActiveInactiveGames({league,player,teamId,year:2026,gameId:game.gameId,postseasonState:state});
    assert.equal(elevate(session,player,game).ok,true);player.designations.gameDayInactive=true;
    const played=simulateNextPostseasonGame({state,league,statBook:session.statBook,year:2026,rng:session.rng});assert.ok(played.game);
    const row=player.standardElevations.games.at(-1);assert.equal(row.status,'reverted');
    const divisionWinner=state.seeds[league.teams.find(t=>t.id===teamId).conference].find(s=>s.teamId===teamId).seed<=4;
    const full=next.round==='wildcard'?(divisionWinner?64500:59500):next.round==='divisional'?64500:next.round==='conference'?87000:played.game.winnerId===teamId?188000:113000;
    assert.equal(row.payCents,full*100*(['conference','super-bowl'].includes(next.round)&&previous<3?.5:1));
    assert.equal(row.capChargeCents,0);assert.ok(Object.keys(player.contract.postseasonPayLedger||{}).length>0);
    assert.equal(player.rosterSlot,'practice');count++;
  }
  assert.equal(count,13);validateActiveInactiveHistory(league);
  for(const team of league.teams)assert.equal(session.getTeamCapSummary(team.id).capSpace,caps[team.id]);
  assert.equal(inspectSnapshotCompatibility(session.toSnapshot()).ok,true);
});

test('unknown legacy club membership fails before playoff RNG/stats/pay; malformed masks reject both restoration seams',()=>{
  const session=fixture(),league=session.league,player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining);
  league.teams.find(t=>t.id==='BUF').season.weekResults=[{week:1,opponent:'MIA',result:'W'}];
  const game=standardElevationGame({year:2026,seasonType:'playoffs',homeTeamId:'BUF',awayTeamId:'MIA',round:'conference',label:'afc-conference'});
  const postseasonState={year:2026,seeds:{AFC:[{teamId:'BUF',seed:1},{teamId:'MIA',seed:5}]},gameArchiveEntries:[]};
  assert.equal(elevate(session,player,game).ok,true);
  const before=JSON.stringify(session.toSnapshot()),seed=session.rng.seed;
  assert.throws(()=>simulateGame({...match(session,game),rng:session.rng,postseasonState}),error=>error.reasonCode==='ELEVATION_HISTORY_UNKNOWN');
  assert.equal(session.rng.seed,seed);assert.equal(JSON.stringify(session.toSnapshot()),before);
  const normal=fixture();simulateGame(match(normal,regular(1)));
  const broken=normal.toSnapshot(),club=broken.league.activeInactiveHistory.clubs.BUF,id=Object.keys(club.membership)[0];club.membership[id][0]=2;
  assert.equal(inspectSnapshotCompatibility(broken).ok,false);assert.throws(()=>createSessionFromSnapshot(broken),/membership masks/);
});

test('missing or truncated legacy results cannot prove postseason coverage',()=>{
  const session=fixture(),league=session.league,club=league.teams.find(t=>t.id==='BUF'),player=league.players.find(p=>p.teamId==='BUF');
  const state={year:2026,gameArchiveEntries:[]};
  for(const results of [undefined,[],[{week:1}]]){
    club.season.wins=17;club.season.losses=0;club.season.ties=0;club.season.weekResults=results;
    assert.throws(()=>priorActiveInactiveGames({league,player,teamId:'BUF',year:2026,gameId:'final',postseasonState:state}),e=>e.reasonCode==='ELEVATION_HISTORY_UNKNOWN');
  }
});

test('headless full season matches canonical elevation IDs and settles its first scheduled game',()=>{
  const session=fixture(),league=session.league;
  const schedule=getSportRules(league.sportId).competition.buildSchedule({league,year:2026,rng:new RNG(901)});
  const weekBlock=schedule.find(block=>block.games.some(g=>[g.homeTeamId,g.awayTeamId].includes('BUF')));
  const matchup=weekBlock.games.find(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'));
  const game=standardElevationGame({...matchup,year:2026,week:weekBlock.week,label:'regular-season'});
  const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining);
  assert.equal(elevate(session,player,game).ok,true);player.designations.gameDayInactive=true;
  simulateSeason({league,statBook:session.statBook,year:2026,rng:new RNG(901)});
  assert.equal(player.standardElevations.games[0].status,'reverted');
  assert.ok(player.serviceLedger.seasons[2026].credited&(1<<(weekBlock.week-1)));
  assert.equal(league.capLedger.BUF.elevationCharges[0].status,'earned');
  assert.equal(league.teams.find(t=>t.id==='BUF').season.weekResults.length,17);
});

test('pending players survive CPU normalization and personnel refusals without mutating their declaration',()=>{
  const session=fixture(),league=session.league,player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining);
  assert.equal(elevate(session,player,regular(1)).ok,true);
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.releasePlayer({teamId:'BUF',playerId:player.id}).reasonCode,'ELEVATION_PENDING');
  assert.equal(activatePracticePlayer(league,player).reasonCode,'ELEVATION_PENDING');
  assert.equal(session.setPlayerDesignation({teamId:'BUF',playerId:player.id,designation:'ir'}).reasonCode,'ELEVATION_PENDING');
  assert.equal(session.evaluateTradePackage({teamA:'BUF',teamB:'MIA',teamAPlayerIds:[player.id]}).reasonCode,'ELEVATION_PENDING');
  assert.throws(()=>releaseToFreeAgency(league,player),e=>e.reasonCode==='ELEVATION_PENDING');
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  const declaration=structuredClone(player.standardElevations),contract=structuredClone(player.contract);
  normalizeRosterSlots(league);enforceRosterAndCapCompliance(league);
  assert.deepEqual(player.standardElevations,declaration);assert.deepEqual(player.contract,contract);assert.equal(player.rosterSlot,'practice');
});
