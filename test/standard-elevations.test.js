import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPracticeContract} from '../src/domain/practiceContracts.js';
import {standardElevationGame,declareStandardElevation,settleStandardElevationGame,retainedElevationCap,validateSnapshotStandardElevations,recordPermanentElevationActivation,recordElevationActiveRelease,recordElevationPracticeRejoin} from '../src/domain/standardElevations.js';
import {postseasonElevationSalaryForSeason} from '../src/data/nflPostseasonSalary.js';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {inspectSnapshotCompatibility} from '../src/runtime/snapshotMigration.js';
import {capSpaceForTeam,capUsedByTeam} from '../src/engine/capCompliance.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';
import {retainedPracticeCap,retainPracticeChargeOnTrade,retainedRosterCompensationCap} from '../src/domain/earnedPracticeCap.js';

function fixture(){
  const players=['p','q','r','away'].map(id=>{
    const player={id,teamId:id==='away'?'A':'H',status:'active',rosterSlot:'practice',experience:0};
    player.contract=buildPracticeContract(player,{year:2026});return player;
  });
  return {year:2026,teams:[{id:'H'},{id:'A'}],players,capLedger:{}};
}
const regular=week=>standardElevationGame({year:2026,week,homeTeamId:'H',awayTeamId:'A',label:'regular-season'});
const playoff=(round='conference')=>standardElevationGame({year:2026,homeTeamId:'H',awayTeamId:'A',seasonType:'playoffs',round,label:round==='super-bowl'?'super-bowl':`afc-${round}`});
const declare=(league,player,game)=>declareStandardElevation({league,player,teamId:player.teamId,game,capSpace:1e6});
const settle=(league,game,extra={})=>settleStandardElevationGame({league,result:{...game,winnerId:'H'},...extra});

test('temporary declarations reserve cents, survive JSON restoration and settle once without replacing practice terms',()=>{
  const league=fixture(),p=league.players[0],beforeContract=structuredClone(p.contract),game=regular(1);
  const first=declare(league,p,game);
  assert.equal(first.ok,true);assert.equal(first.elevation.payCents,4916667);
  assert.equal(first.elevation.capChargeCents,3541667);
  assert.equal(retainedElevationCap(league.capLedger.H),35416.67);
  assert.deepEqual(p.contract,beforeContract);assert.equal(p.rosterSlot,'practice');
  const once=JSON.stringify(league);assert.equal(declare(league,p,game).unchanged,true);assert.equal(JSON.stringify(league),once);
  const restored=JSON.parse(once);validateSnapshotStandardElevations({league:restored});
  const paid=settle(restored,game);assert.equal(paid.length,1);assert.equal(paid[0].waiversRequired,false);
  assert.equal(restored.capLedger.H.elevationCharges[0].status,'earned');
  assert.equal(retainedElevationCap(restored.capLedger.H),35416.67);
  assert.deepEqual(settle(restored,game),[]);
  assert.equal(declare(restored,restored.players[0],game).reasonCode,'ELEVATION_GAME_ALREADY_PLAYED');
  validateSnapshotStandardElevations({league:restored});
});

test('two-per-club game limit and three regular games per player persist across restores; playoff use is separate',()=>{
  const league=fixture();assert.equal(declare(league,league.players[0],regular(1)).ok,true);
  assert.equal(declare(league,league.players[1],regular(1)).ok,true);
  const before=JSON.stringify(league);
  assert.equal(declare(league,league.players[2],regular(1)).reasonCode,'ELEVATION_GAME_LIMIT');assert.equal(JSON.stringify(league),before);
  settle(league,regular(1));
  for(const week of [2,3]){assert.equal(declare(league,league.players[0],regular(week)).ok,true);settle(league,regular(week));}
  const restored=JSON.parse(JSON.stringify(league));
  assert.equal(declare(restored,restored.players[0],regular(4)).reasonCode,'ELEVATION_SEASON_LIMIT');
  for(const round of ['wildcard','divisional','conference','super-bowl']){
    const game=playoff(round);assert.equal(declare(restored,restored.players[0],game).ok,true);
    settle(restored,game,{priorClubListGames:()=>3,divisionWinner:()=>false});
  }
  assert.equal(restored.players[0].standardElevations.games.length,7);
  validateSnapshotStandardElevations({league:restored});
});

test('wrong game metadata cannot settle a reservation and absent postseason authority cannot fabricate pay',()=>{
  const league=fixture(),game=regular(1);declare(league,league.players[0],game);
  const before=JSON.stringify(league);
  for(const patch of [{week:2},{year:2027},{homeTeamId:'A'},{seasonType:'playoffs'},{label:'wrong'}]){
    assert.throws(()=>settleStandardElevationGame({league,result:{...game,...patch}}));assert.equal(JSON.stringify(league),before);
  }
  settle(league,game);const next=playoff();declare(league,league.players[0],next);
  const saved=JSON.stringify(league);assert.throws(()=>settle(league,next),/authority missing/);assert.equal(JSON.stringify(league),saved);
});

test('postseason settlement preflights every player before mutating any pay, and current club prior games decide half/full',()=>{
  const league=fixture(),game=playoff();declare(league,league.players[0],game);declare(league,league.players[1],game);
  const before=JSON.stringify(league);
  assert.throws(()=>settle(league,game,{priorClubListGames:p=>p.id==='p'?3:undefined,divisionWinner:()=>false}));assert.equal(JSON.stringify(league),before);
  const paid=settle(league,game,{priorClubListGames:p=>p.id==='p'?3:2,divisionWinner:()=>false});
  assert.deepEqual(paid.map(r=>r.payCents),[8700000,4350000]);
  assert.deepEqual(paid.map(r=>r.additionalCapCents),[0,0]);validateSnapshotStandardElevations({league});
});

test('refusals leave authority untouched for wrong ownership, unavailable players, cap shortage and inactive contracts',()=>{
  for(const change of [p=>p.injury={weeksRemaining:1},p=>p.suspensionWeeks=1,p=>p.designations={ir:true},p=>p.rosterSlot='active',p=>p.contract.year=2025]){
    const league=fixture(),p=league.players[0];change(p);const before=JSON.stringify(league);
    assert.equal(declare(league,p,regular(1)).ok,false);assert.equal(JSON.stringify(league),before);
  }
  const league=fixture(),p=league.players[0],game=regular(1),before=JSON.stringify(league);
  assert.equal(declareStandardElevation({league,player:p,teamId:'A',game,capSpace:1e6}).ok,false);
  assert.equal(declareStandardElevation({league,player:p,teamId:'H',game,capSpace:35416.66}).reasonCode,'ELEVATION_CAP_ROOM');
  assert.equal(declare(league,structuredClone(p),game).ok,false);assert.equal(JSON.stringify(league),before);
});

test('tampered save receipts and compensation fail before another declaration can mutate league state',()=>{
  const original=fixture();declare(original,original.players[0],regular(1));
  for(const mutate of [l=>l.capLedger.H.elevationCharges[0].amountCents++,l=>l.capLedger.H.elevationCharges[0].status='earned',
    l=>l.players[0].standardElevations.games[0].payCents++,l=>l.players[0].standardElevations.games[0].game.round='wildcard',
    l=>l.players[0].standardElevations.games[0].unexpected=true,l=>l.players[0].teamId='A',
    l=>l.capLedger.H.elevationCharges.push({...l.capLedger.H.elevationCharges[0]}),l=>l.players[0].standardElevations.games[0].cycle=1]){
    const league=structuredClone(original);mutate(league);const before=JSON.stringify(league);
    assert.throws(()=>validateSnapshotStandardElevations({league}));
    assert.throws(()=>declare(league,league.players[1],regular(1)));assert.equal(JSON.stringify(league),before);
  }
});

test('Article37 salary table and previous-game boundary are exact, with labeled future projections',()=>{
  for(const [year,wc,other,conf,win,lose]of [[2020,33000,30000,59000,130000,65000],[2021,42500,37500,65000,150000,75000],
    [2026,64500,59500,87000,188000,113000],[2030,88500,83500,111000,228000,153000]]){
    const pay=options=>postseasonElevationSalaryForSeason(year,{priorClubListGames:3,...options}).amountCents/100;
    assert.equal(pay({round:'wildcard',divisionWinner:true}),wc);assert.equal(pay({round:'wildcard'}),other);
    assert.equal(pay({round:'divisional'}),wc);assert.equal(pay({round:'conference'}),conf);
    assert.equal(pay({round:'super-bowl',won:true}),win);assert.equal(pay({round:'super-bowl'}),lose);
    for(const prior of [0,1,2])assert.equal(pay({round:'conference',priorClubListGames:prior}),conf/2);
  }
  assert.equal(postseasonElevationSalaryForSeason(2031,{round:'conference',priorClubListGames:3}).kind,'simulation-projected-postseason-benefit');
  for(const options of [{round:'bye',priorClubListGames:0},{round:'conference'}, {round:'conference',priorClubListGames:-1},
    {round:'conference',priorClubListGames:2.5},{round:'conference',priorClubListGames:3,won:'true'}])assert.throws(()=>postseasonElevationSalaryForSeason(2026,options));
});

test('relabeling cannot bypass the game limit and settled current-year compensation cannot disappear',()=>{
  const league=fixture(),game=regular(1);declare(league,league.players[0],game);declare(league,league.players[1],game);
  const before=JSON.stringify(league);
  assert.throws(()=>declare(league,league.players[2],{...game,label:'alias'}),/canonical game label/);
  assert.equal(JSON.stringify(league),before);settle(league,game);
  const missing=structuredClone(league);delete missing.capLedger.H.elevationCharges;
  assert.throws(()=>validateSnapshotStandardElevations({league:missing}),/missing earned/);
  // An explicit completed annual boundary legitimately clears current charges.
  missing.capLedger.H.rolloverAppliedThroughYear=2026;validateSnapshotStandardElevations({league:missing});
  assert.equal(declare(missing,missing.players[0],regular(2)).reasonCode,'ELEVATION_YEAR_CLOSED');
});

test('actual career restoration and all shared cap readers retain elevation reservations through settlement and annual rollover',()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
  const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
  assert.ok(player);const game=standardElevationGame({year:2026,week:1,homeTeamId:'BUF',awayTeamId:'MIA',label:'regular-season'});
  const used=capUsedByTeam(league,'BUF'),room=capSpaceForTeam(league,'BUF');
  const declared=declareStandardElevation({league,player,teamId:'BUF',game,capSpace:room});assert.equal(declared.ok,true);
  const extra=declared.elevation.capChargeCents/100;
  assert.ok(Math.abs(capUsedByTeam(league,'BUF')-used-extra)<1e-7);
  assert.ok(Math.abs(session.getTeamCapSummary('BUF').capSpace-room+extra)<1e-7);
  const snapshot=session.toSnapshot();assert.equal(inspectSnapshotCompatibility(snapshot).ok,true);
  const restored=createSessionFromSnapshot(snapshot);
  assert.ok(Math.abs(restored.getTeamCapSummary('BUF').capSpace-room+extra)<1e-7);
  settle(restored.league,game);
  const paidSnapshot=restored.toSnapshot();assert.equal(inspectSnapshotCompatibility(paidSnapshot).ok,true);
  const broken=structuredClone(paidSnapshot);delete broken.league.capLedger.BUF.elevationCharges;
  assert.equal(inspectSnapshotCompatibility(broken).ok,false);assert.throws(()=>createSessionFromSnapshot(broken),/missing earned/);
  const forecast=restored.getTeamCapSummary('BUF').rolloverNextYearEstimate;
  applyCapRollover(restored.league,{completedYear:2026});
  assert.equal(restored.league.capLedger.BUF.rollover,forecast);
  assert.deepEqual(restored.league.capLedger.BUF.elevationCharges,[]);
  validateSnapshotStandardElevations({league:restored.league});
  assert.equal(inspectSnapshotCompatibility(restored.toSnapshot()).ok,true);
});

test('retaining traded practice earnings cannot compound a separate elevation receipt',()=>{
  const league=fixture(),player=league.players[0];declare(league,player,regular(1));settle(league,regular(1));
  player.contract={salary:1000000,capHit:1013750,practiceEarnedCharge:13750};
  retainPracticeChargeOnTrade(league,player);
  assert.equal(retainedPracticeCap(league.capLedger.H),13750);
  assert.equal(retainedRosterCompensationCap(league.capLedger.H),13750+35416.67);
  assert.equal(player.contract.capHit,1000000);
});

test('a settled club game is closed to new elevations and pending players cannot move into archives',()=>{
  const league=fixture(),game=regular(1);declare(league,league.players[0],game);declare(league,league.players[1],game);
  for(const population of ['retiredPlayers','prospects']){
    const forged=structuredClone(league),p=forged.players.shift();p.status='retired';p.teamId=null;
    if(population==='retiredPlayers')forged.retiredPlayers=[p];else forged.pendingDraft={available:[p]};
    assert.throws(()=>validateSnapshotStandardElevations({league:forged}),/outside live roster/);
  }
  settle(league,game);const before=JSON.stringify(league);
  assert.equal(declare(league,league.players[2],game).reasonCode,'ELEVATION_GAME_ALREADY_PLAYED');assert.equal(JSON.stringify(league),before);
  const forged=structuredClone(league),third=structuredClone(forged.players[0].standardElevations.games[0]);
  forged.players[2].standardElevations={version:'standard-elevation-games-v1',games:[third],cycles:{}};
  forged.capLedger.H.elevationCharges.push({...forged.capLedger.H.elevationCharges[0],playerId:forged.players[2].id});
  assert.throws(()=>validateSnapshotStandardElevations({league:forged}),/team game limit/);
});

test('only a completed permanent-contract release and weekly rejoin opens another club cycle',()=>{
  const league=fixture(),p=league.players[0];
  for(const week of [1,2,3]){assert.equal(declare(league,p,regular(week)).ok,true);settle(league,regular(week));}
  assert.equal(declare(league,p,regular(4)).reasonCode,'ELEVATION_SEASON_LIMIT');
  // Direct practice releases/rejoins cannot create a fresh three-game budget.
  recordElevationActiveRelease(p,{teamId:'H'});
  recordElevationPracticeRejoin(p,{teamId:'H'});
  assert.equal(p.standardElevations.cycles.H,undefined);
  p.rosterSlot='active';p.contract={salary:885000,capHit:885000,yearsRemaining:1};
  recordPermanentElevationActivation(p,{teamId:'H',year:2026});
  recordPermanentElevationActivation(p,{teamId:'H',year:2026});
  assert.equal(p.standardElevations.resetPaths.length,1,'activation retries are idempotent');
  recordElevationActiveRelease(p,{teamId:'H'});
  p.teamId='A';p.rosterSlot='practice';p.contract=buildPracticeContract(p,{year:2026});
  recordElevationPracticeRejoin(p,{teamId:'A'});
  assert.equal(p.standardElevations.cycles.H,undefined,'another club cannot consume this reset');
  p.teamId='H';recordElevationPracticeRejoin(p,{teamId:'H'});
  recordElevationPracticeRejoin(p,{teamId:'H'});
  assert.equal(p.standardElevations.cycles.H,1);
  assert.equal(p.standardElevations.resetPaths[0].status,'rejoined');
  for(const week of [4,5,6]){assert.equal(declare(league,p,regular(week)).ok,true);settle(league,regular(week));}
  assert.equal(declare(league,p,regular(7)).reasonCode,'ELEVATION_SEASON_LIMIT');
  validateSnapshotStandardElevations({league:JSON.parse(JSON.stringify(league))});
});

test('actual activation, waiver clearance and practice signing persist reset eligibility through career saves',()=>{
  let session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  session.phase='regular-season';session.currentWeek=4;session.league.teamCapOverride.BUF=1_000_000_000;
  const p=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.overall<74&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
  assert.ok(p);const id=p.id;
  const game=week=>standardElevationGame({year:2026,week,homeTeamId:'BUF',awayTeamId:'MIA'});
  const declaration=week=>declareStandardElevation({league:session.league,player:session.getPlayerById(id),teamId:'BUF',game:game(week),capSpace:session.getTeamCapSummary('BUF').capSpace});
  for(const week of [1,2,3]){
    assert.equal(declaration(week).ok,true);
    settleStandardElevationGame({league:session.league,result:{...game(week),winnerId:'BUF'}});
  }
  const restore=()=>{const snapshot=session.toSnapshot();assert.equal(inspectSnapshotCompatibility(snapshot).ok,true);session=createSessionFromSnapshot(snapshot);};
  restore();assert.equal(declaration(4).reasonCode,'ELEVATION_SEASON_LIMIT');
  const vacancy=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='active');
  assert.equal(session.releasePlayer({teamId:'BUF',playerId:vacancy.id,toWaivers:false}).ok,true);
  assert.equal(session.setPracticeSquad({teamId:'BUF',playerId:id,moveToPractice:false}).ok,true);
  assert.equal(session.getPlayerById(id).standardElevations.resetPaths[0].status,'activated');restore();
  assert.equal(session.releasePlayer({teamId:'BUF',playerId:id,toWaivers:true}).ok,true);restore();
  assert.equal(session.getPlayerById(id).teamId,'WAIVER');
  assert.equal(session.signPracticeFreeAgent({teamId:'BUF',playerId:id}).reasonCode,'PRACTICE_FREE_AGENT_REQUIRED');
  const expiry=session.league.waiverWire.find(row=>row.playerId===id).expiresWeek;
  session.currentWeek=expiry;session.processWaivers();assert.equal(session.getPlayerById(id).teamId,'WAIVER');
  session.currentWeek=expiry+1;session.processWaivers();assert.equal(session.getPlayerById(id).teamId,'FA');
  assert.equal(session.signPracticeFreeAgent({teamId:'BUF',playerId:id}).ok,true);restore();
  assert.equal(session.getPlayerById(id).standardElevations.cycles.BUF,1);
  assert.equal(declaration(session.currentWeek).ok,true);
  const pending=session.toSnapshot();assert.equal(inspectSnapshotCompatibility(pending).ok,true);
  const forged=structuredClone(pending),saved=forged.league.players.find(p=>p.id===id);
  delete saved.standardElevations.resetPaths;
  assert.equal(inspectSnapshotCompatibility(forged).ok,false);
  assert.throws(()=>createSessionFromSnapshot(forged),/unproven club cycle/);
});

test('forged reset paths and manual cycle increments cannot mint eligibility',()=>{
  const league=fixture(),p=league.players[0];declare(league,p,regular(1));settle(league,regular(1));
  const base=structuredClone(league);
  for(const patch of [
    state=>state.cycles.H=1,
    state=>state.resetPaths=[{teamId:'H',year:2026,cycle:1,status:'rejoined'}],
    state=>state.resetPaths=[{teamId:'H',year:2026,cycle:0,status:'activated'},{teamId:'H',year:2026,cycle:0,status:'rejoined'}],
    state=>state.resetPaths=[{teamId:'__proto__',year:2026,cycle:0,status:'rejoined'}]
  ]){
    const invalid=structuredClone(base);patch(invalid.players[0].standardElevations);
    assert.throws(()=>validateSnapshotStandardElevations({league:invalid}),/club cycle|reset path/);
  }
  const unknownClub=structuredClone(base);
  unknownClub.players[0].standardElevations.resetPaths=[{teamId:'UNKNOWN',year:2026,cycle:0,status:'activated'}];
  assert.throws(()=>validateSnapshotStandardElevations({league:unknownClub}),/reset club\/year/);
  const future=structuredClone(base);
  future.players[0].standardElevations.resetPaths=[{teamId:'H',year:2027,cycle:0,status:'activated'}];
  assert.throws(()=>validateSnapshotStandardElevations({league:future}),/reset club\/year/);
});
