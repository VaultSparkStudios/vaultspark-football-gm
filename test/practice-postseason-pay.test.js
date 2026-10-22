import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { buildPracticeContract, recordPracticePostseasonPay, practicePaidSalary, validateSnapshotPracticeContracts } from '../src/domain/practiceContracts.js';
import { normalizeContract } from '../src/domain/contracts.js';
import { createPostseasonState, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';

test('postseason practice Benefits are separate, repeat-safe and retained by contract normalization',()=>{
  const player={id:'p',teamId:'A',status:'active',rosterSlot:'practice',experience:0};
  player.contract=buildPracticeContract(player,{year:2026});
  const legacy={...player,id:'legacy',contract:{salary:900_000,capHit:900_000,yearsRemaining:1}};
  const other={...player,id:'other',teamId:'B',contract:structuredClone(player.contract)};
  const league={teams:[{id:'A'},{id:'B'}],players:[player,legacy,other]};
  const before=structuredClone(player.contract);
  const paid=recordPracticePostseasonPay(league,{year:2026,week:19,teamIds:['A']});
  assert.equal(paid.length,1);
  assert.equal(paid[0].amount,before.weeklySalary);
  assert.equal(paid[0].capCharge,0);
  assert.equal(player.contract.capHit,before.capHit);
  assert.equal(practicePaidSalary(player.contract),0,'regular Team Salary excludes postseason Benefits');
  assert.deepEqual(normalizeContract(player.contract).postseasonPayLedger,player.contract.postseasonPayLedger);
  assert.equal(recordPracticePostseasonPay(league,{year:2026,week:19,teamIds:['A']}).length,0);
  assert.equal(other.contract.postseasonPayLedger,undefined);
  assert.equal(legacy.contract.postseasonPayLedger,undefined);
});
test('invalid current or archived postseason payroll refuses without mutation',()=>{
  const player={id:'p',teamId:'A',status:'active',rosterSlot:'practice',experience:0};
  player.contract=buildPracticeContract(player,{year:2026});
  const league={teams:[{id:'A'}],players:[player]};
  for(const week of [18,24,19.5]) {
    const before=structuredClone(league);
    assert.throws(()=>recordPracticePostseasonPay(league,{year:2026,week,teamIds:['A']}));
    assert.deepEqual(league,before);
  }
  assert.throws(()=>recordPracticePostseasonPay(league,{year:2026,week:19,teamIds:['missing']}));
  recordPracticePostseasonPay(league,{year:2026,week:19,teamIds:['A']});
  const valid=structuredClone(player.contract);
  for(const change of [{amount:1},{capCharge:1},{week:24},{kind:'unknown'},{year:2027}]) {
    const bad=structuredClone(valid);Object.assign(bad.postseasonPayLedger['2026:postseason:19'],change);
    assert.throws(()=>normalizeContract(bad));
    assert.throws(()=>validateSnapshotPracticeContracts({league:{players:[],retiredPlayers:[{practiceContractHistory:[bad]}]}}));
  }
});
test('actual playoff bracket pays surviving weeks including both byes and survives compressed restoration',async()=>{
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  const state=createPostseasonState({league:session.league,year:2026});
  const capBefore=Object.fromEntries(session.league.teams.map(team=>[team.id,session.getTeamCapSummary(team.id).capSpace]));
  const eligible19=new Set(Object.values(state.seeds).flat().map(row=>row.teamId));
  const first=simulateNextPostseasonGame({state,league:session.league,statBook:session.statBook,year:2026,rng:session.rng});
  assert.ok(first.game);
  const bye=state.seeds[first.conference].find(row=>row.seed===1).teamId;
  const byePractice=session.league.players.find(p=>p.teamId===bye&&p.contract?.kind==='weekly-practice-contract-v1');
  assert.ok(byePractice.contract.postseasonPayLedger['2026:postseason:19'],'wildcard bye is a paid playoff week');
  while(state.status!=='completed')simulateNextPostseasonGame({state,league:session.league,statBook:session.statBook,year:2026,rng:session.rng});
  const rounds=Object.values(state.bracket).filter(value=>value?.divisional);
  const eligible20=new Set(rounds.flatMap(value=>value.divisional.flatMap(game=>[game.homeTeamId,game.awayTeamId])));
  const eligible21=new Set(rounds.flatMap(value=>value.conference.flatMap(game=>[game.homeTeamId,game.awayTeamId])));
  const eligibleFinal=new Set([state.superBowl.championTeamId,state.superBowl.runnerUpTeamId]);
  for(const player of session.league.players.filter(p=>p.contract?.kind==='weekly-practice-contract-v1')) {
    const ledger=player.contract.postseasonPayLedger||{};
    for(const [week,eligible] of [[19,eligible19],[20,eligible20],[21,eligible21],[22,eligibleFinal],[23,eligibleFinal]])
      assert.equal(Boolean(ledger[`2026:postseason:${week}`]),eligible.has(player.teamId),`${player.teamId} payroll week${week}`);
  }
  for(const team of session.league.teams)assert.equal(session.getTeamCapSummary(team.id).capSpace,capBefore[team.id]);
  const snapshot=session.toSnapshot();
  const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(snapshot)));
  assert.deepEqual(restored.league.players.map(p=>p.contract?.postseasonPayLedger),session.league.players.map(p=>p.contract?.postseasonPayLedger));
});
test('older playoff state does not reconstruct a missing final preparation week',()=>{
  const session=createSession({seed:118,startYear:2026,controlledTeamId:'BUF'});
  const state=createPostseasonState({league:session.league,year:2026});
  delete state.practicePayrollVersion;
  while(state.status!=='completed')simulateNextPostseasonGame({state,league:session.league,statBook:session.statBook,year:2026,rng:session.rng});
  assert.ok(session.league.players.some(p=>p.contract?.postseasonPayLedger?.['2026:postseason:23']));
  assert.ok(session.league.players.every(p=>!p.contract?.postseasonPayLedger?.['2026:postseason:22']));
});

test('bad payroll or playoff club refuses before match RNG, stats or bracket mutation',()=>{
  const session=createSession({seed:119,startYear:2026,controlledTeamId:'BUF'});
  const state=createPostseasonState({league:session.league,year:2026});
  const player=session.league.players.find(p=>p.contract?.kind==='weekly-practice-contract-v1');
  player.contract.postseasonPayLedger={'2026:postseason:19':{year:2026,week:19,teamId:player.teamId,
    amount:1,kind:'practice-postseason-benefit-v1',capCharge:0}};
  const run=()=>simulateNextPostseasonGame({state,league:session.league,statBook:session.statBook,year:2026,rng:session.rng});
  const before=JSON.stringify(session.toSnapshot()),stateBefore=structuredClone(state);
  assert.throws(run,/Invalid postseason practice payroll receipt/);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  assert.deepEqual(state,stateBefore);
  delete player.contract.postseasonPayLedger;
  state.seeds.AFC.find(row=>row.seed===1).teamId='unknown-club';
  const beforeClub=JSON.stringify(session.toSnapshot()),badState=structuredClone(state);
  assert.throws(run,/Invalid postseason practice payroll club/);
  assert.equal(JSON.stringify(session.toSnapshot()),beforeClub);
  assert.deepEqual(state,badState);
});
