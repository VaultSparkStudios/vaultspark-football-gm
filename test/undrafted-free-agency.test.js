import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createDraftClass } from '../src/domain/playerFactory.js';
import { RNG } from '../src/utils/rng.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { admitUndraftedFreeAgents, UNDRAFTED_FREE_AGENCY_VERSION } from '../src/domain/undraftedFreeAgency.js';
import { runOffseason } from '../src/engine/offseasonSimulator.js';

const unsigned=id=>({id,teamId:'FA',status:'active',overall:50,potential:85,position:'WR',
  profile:{identity:{name:id},appearanceRecipe:{seed:117}},ratings:{speed:50},
  contract:{salary:0,yearsRemaining:0,capHit:0}});
const board=(available,extra={})=>({year:2027,completed:true,available,selections:[],...extra});
test('admission preserves generated data and repeats without RNG, salary or duplication',()=>{
  const prospect=unsigned('new'),before=structuredClone(prospect);
  const league={players:[],retiredPlayers:[]},draft=board([prospect]);
  assert.equal(admitUndraftedFreeAgents(league,draft,{year:2027}).admitted.length,1);
  const actual=structuredClone(league.players[0]);delete actual.draftEntry;
  assert.deepEqual(actual,before);
  assert.deepEqual(draft.undraftedFreeAgency,{version:UNDRAFTED_FREE_AGENCY_VERSION,year:2027,playerIds:['new']});
  const after=structuredClone({league,draft});
  assert.equal(admitUndraftedFreeAgents(league,draft,{year:2027}).admitted.length,0);
  assert.deepEqual({league,draft},after);
});
test('unfinished, missing and stale drafts leave both populations unchanged',()=>{
  for(const draft of [null,board([unsigned('new')],{completed:false}),board([unsigned('old')],{year:2026})]){
    const league={players:[]},before=structuredClone({league,draft});
    assert.equal(admitUndraftedFreeAgents(league,draft,{year:2027}).admitted.length,0);
    assert.deepEqual({league,draft},before);
  }
});
test('known roster, retired and selected IDs cannot be overwritten or revived',()=>{
  const owned={...unsigned('owned'),teamId:'BUF',contract:{salary:7_000_000,capHit:7_000_000,yearsRemaining:3}};
  const retired={...unsigned('retired'),status:'retired'};
  const league={players:[owned],retiredPlayers:[retired]},before=structuredClone(league);
  const draft=board([unsigned('owned'),unsigned('retired'),unsigned('selected'),unsigned('new')],
    {selections:[{playerId:'selected',teamId:'BUF'}]});
  const result=admitUndraftedFreeAgents(league,draft,{year:2027});
  assert.deepEqual(result.admitted.map(p=>p.id),['new']);
  assert.deepEqual(league.players[0],before.players[0]);assert.deepEqual(league.retiredPlayers,before.retiredPlayers);
  assert.ok(!league.players.some(p=>p.id==='selected'));
});
test('malformed completed batches refuse before any player or draft mutation',()=>{
  for(const bad of [board([unsigned('good'),unsigned('good')]),board([unsigned('good'),{...unsigned('bad'),teamId:'BUF'}]),
    board([unsigned('good'),{...unsigned('bad'),contract:{salary:0,capHit:0,yearsRemaining:0,guaranteed:100}}]),
    board([unsigned('good'),{...unsigned('bad'),contract:{salary:0,capHit:0,yearsRemaining:0,practiceEarnedCharge:100}}]),
    board([unsigned('good'),{...unsigned('bad'),contract:{salary:0,capHit:0,yearsRemaining:0,kind:'weekly-practice-contract-v99'}}]),
    board([unsigned('good')],{selections:{}}),board([unsigned('good')],{undraftedFreeAgency:{version:'unknown',year:2027,playerIds:[]}})]){
    const league={players:[]},before=structuredClone({league,draft:bad});
    assert.throws(()=>admitUndraftedFreeAgents(league,bad,{year:2027}),TypeError);
    assert.deepEqual({league,draft:bad},before);
  }
});

test('headless offseason retains every generated undrafted prospect in the actual league',()=>{
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  // Seven selections for one club leaves a known249-player unsigned cohort.
  session.league.teams=session.league.teams.filter(t=>t.id==='BUF');
  session.league.players=session.league.players.filter(p=>p.teamId==='BUF');
  const result=runOffseason({league:session.league,year:2026,rng:session.rng,excludeTeamIds:['BUF']});
  assert.equal(result.undrafted.admitted.length,249);
  const ids=new Set(session.league.players.map(p=>p.id));
  assert.equal(ids.size,session.league.players.length);
  for(const player of result.undrafted.admitted){
    assert.ok(ids.has(player.id));assert.equal(player.teamId,'FA');assert.equal(player.contract.capHit,0);
    assert.equal(player.draftEntry.status,'undrafted');
    assert.ok(player.profile.identity);assert.ok(player.profile.appearanceRecipe);assert.ok(player.profile.skeletonRecipe);
  }
});

test('actual UDFA stage admits completed unselected prospects without assigning the GM roster',async()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  session.phase='offseason';
  session.league.teams=session.league.teams.filter(t=>t.id==='BUF');
  session.league.players=session.league.players.filter(p=>p.teamId==='BUF');
  session.rebuildLookupIndexes();session.statBook.reindexPlayers();
  session.runRosterYearRollover();session.runRetentionWindow();session.runFreeAgencyWindow();
  const prospects=createDraftClass({size:6,year:2027,rng:new RNG(117)});
  const original=structuredClone(prospects),ownBefore=structuredClone(session.league.players);
  session.league.pendingDraft={year:2027,completed:true,available:prospects,selections:[],currentPick:1,totalPicks:0,order:[],slots:[]};
  session.runOffseasonUdfaStage({},result=>result);
  for(const before of original){
    const player=session.league.players.find(p=>p.id===before.id);
    assert.ok(player,`${before.id} must reach the unsigned market`);
    assert.equal(player.teamId,'FA');assert.equal(player.contract.capHit,0);
    assert.deepEqual(player.profile,before.profile);assert.deepEqual(player.ratings,before.ratings);
    assert.equal(player.overall,before.overall);assert.equal(player.potential,before.potential);
  }
  assert.deepEqual(session.league.players.filter(p=>!original.some(row=>row.id===p.id)),ownBefore);
  const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  restored.runOffseasonUdfaStage({},result=>result);
  for(const player of original)assert.equal(restored.league.players.filter(p=>p.id===player.id).length,1);
});
