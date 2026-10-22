import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_TEMPLATE, FULL_ROSTER_TEMPLATE, FIELDABLE_DEPTH } from '../src/config.js';
import { calculatePositionOverall } from '../src/domain/ratings.js';
import { createSession } from '../src/runtime/bootstrap.js';
import { runFreeAgencyBackstop } from '../src/engine/offseasonSimulator.js';
import { RNG } from '../src/utils/rng.js';
import { generatedPlayerService } from '../src/domain/playerService.js';

test('roster backstop looks past an unaffordable specialist to available affordable depth', () => {
  const players=Object.entries(ROSTER_TEMPLATE).filter(([p])=>p!=='K').flatMap(([position,n])=>
    Array.from({length:n},(_,i)=>({id:`${position}-${i}`,teamId:'CPU',status:'active',position,
      rosterSlot:'active',overall:70,experience:0,contract:{capHit:1_000_000}})));
  const star={id:'star-k',teamId:'FA',status:'active',position:'K',overall:99,experience:0,contract:{capHit:0}};
  const depth={id:'depth-k',teamId:'FA',status:'active',position:'K',overall:50,experience:0,contract:{capHit:0}};
  const league={sportId:'football',year:2026,capModel:{version:'nfl-modern-cap-v1'},teams:[{id:'CPU',season:{}}],
    players:[...players,star,depth],capLedger:{},teamCapOverride:{CPU:players.length*1_000_000+2_000_000}};
  const result=runFreeAgencyBackstop(league,2026,new RNG(117));
  assert.equal(depth.teamId,'CPU','affordable free agent must not be hidden by the highest-rated option');
  assert.equal(star.teamId,'FA');
  assert.ok(depth.contract.capHit<=2_000_000);
  assert.equal(result.remainingFreeAgents,1);
});

const fullRosterExceptKicker = () => Object.entries(FULL_ROSTER_TEMPLATE).filter(([p])=>p!=='K').flatMap(([position,n])=>
  Array.from({length:n},(_,i)=>({id:`full-${position}-${i}`,teamId:'CPU',status:'active',position,
    rosterSlot:'active',overall:70,experience:0,contract:{capHit:1_000_000}})));
const makeLeague = budget => {
  const players=fullRosterExceptKicker();
  return {sportId:'football',year:2026,capModel:{version:'nfl-modern-cap-v1'},teams:[{id:'CPU',season:{}}],
    players,capLedger:{},teamCapOverride:{CPU:players.length*1_000_000+budget}};
};

test('mandatory shopping funds both open rooms before buying a single expensive replacement',()=>{
 const players=Object.entries(FIELDABLE_DEPTH).flatMap(([position,band])=>
  Array.from({length:Math.max(0,band.min-(position==='OL'||position==='K'?1:0))},(_,i)=>({
   id:`held-${position}-${i}`,teamId:'CPU',position,status:'active',rosterSlot:'active',overall:80,experience:0,
   contract:{capHit:1_000_000,baseSalary:1_000_000,signingBonus:0,yearsRemaining:1}})));
 const free=(id,position,overall)=>({id,position,overall,teamId:'FA',status:'active',experience:0,contract:{capHit:0}});
 const expensive=free('expensive-ol','OL',65),cheap=free('cheap-ol','OL',45),kicker=free('cheap-k','K',45);
 const league={sportId:'football',year:2026,financialYear:2027,capModel:{version:'nfl-modern-cap-v1'},
  teams:[{id:'CPU',season:{}}],players:[...players,expensive,cheap,kicker],capLedger:{},
  teamCapOverride:{CPU:players.length*1_000_000+4_000_000}};
 const held=structuredClone(players),releases=[];
 runFreeAgencyBackstop(league,2026,new RNG(20260306),{onRelease:r=>releases.push(r)});
 for(const [position,band]of Object.entries(FIELDABLE_DEPTH))
  assert.ok(league.players.filter(p=>p.teamId==='CPU'&&p.position===position).length>=band.min,position);
 assert.equal(expensive.teamId,'FA');assert.equal(cheap.teamId,'CPU');assert.equal(kicker.teamId,'CPU');
 assert.deepEqual(players,held);assert.deepEqual(releases,[]);
});

test('essential CPU depth can be funded by a real release from a surplus room',()=>{
  const players=Object.entries(FIELDABLE_DEPTH).filter(([position])=>position!=='K').flatMap(([position,band])=>
    Array.from({length:band.min},(_,i)=>({id:`minimum-${position}-${i}`,teamId:'CPU',status:'active',position,
      rosterSlot:'active',overall:70,experience:0,contract:{capHit:1_000_000,baseSalary:1_000_000,signingBonus:0,yearsRemaining:1}})));
  const surplus={id:'surplus-dl',teamId:'CPU',status:'active',position:'DL',rosterSlot:'active',overall:50,
    experience:0,contract:{capHit:4_000_000,baseSalary:3_000_000,signingBonus:1_000_000,prorationYears:1,yearsRemaining:1}};
  const kicker={id:'affordable-k',teamId:'FA',status:'active',position:'K',overall:50,experience:0,contract:{capHit:0}};
  const star={id:'star-dl',teamId:'CPU',status:'active',position:'DL',rosterSlot:'active',overall:96,
    experience:0,contract:{capHit:10_000_000,baseSalary:10_000_000,signingBonus:0,prorationYears:1,yearsRemaining:1}};
  const league={sportId:'football',year:2026,teams:[{id:'CPU',season:{}}],players:[...players,surplus,star,kicker],
    capLedger:{CPU:{rollover:0,deadCapCurrentYear:0,deadCapNextYear:0}},
    teamCapOverride:{CPU:players.length*1_000_000+14_000_000+500_000}};
  const releases=[];
  const excluded=structuredClone(league),excludedBefore=structuredClone(excluded);
  runFreeAgencyBackstop(excluded,2026,new RNG(120),{excludeTeamIds:['CPU']});
  assert.deepEqual(excluded,excludedBefore,'excluded GM funding and personnel stay untouched');
  const trapped=structuredClone(league);
  // Any remaining DL could become the second surplus cut while the star
  // fills its minimum slot. Bind *all* eligible savings, not only two IDs.
  for(const player of trapped.players.filter(p=>p.position==='DL'&&p.id!==surplus.id))
    player.contract.signingBonus=player.contract.capHit;
  trapped.players.find(p=>p.id===surplus.id).contract.signingBonus=3_999_999;
  const trappedBefore=structuredClone(trapped),trappedReleases=[];
  runFreeAgencyBackstop(trapped,2026,new RNG(120),{onRelease:r=>trappedReleases.push(r)});
  assert.deepEqual(trapped,trappedBefore,'insufficient net savings cannot trigger a useless partial cut');
  assert.equal(trappedReleases.length,0);
  runFreeAgencyBackstop(league,2026,new RNG(120),{onRelease:receipt=>releases.push(receipt)});
  assert.equal(kicker.teamId,'CPU','a funded minimum outranks retaining surplus depth');
  assert.equal(surplus.teamId,'FA','funding requires a real recorded release');
  assert.equal(releases.length,1);
  assert.equal(star.teamId,'CPU','an affordable weaker surplus cut preserves exceptional talent');
  assert.equal(league.capLedger.CPU.deadCapCurrentYear,1_000_000,'released bonus remains charged');
  assert.equal(league.players.filter(p=>p.teamId==='CPU'&&p.position==='DL').length,FIELDABLE_DEPTH.DL.min+1);
  assert.ok(league.players.filter(p=>p.teamId==='CPU').reduce((sum,p)=>sum+p.contract.capHit,0)
    +league.capLedger.CPU.deadCapCurrentYear<=league.teamCapOverride.CPU);
});

test('empty specialist market cannot manufacture an unfunded signing; CPU shortfall is reported', () => {
  const league=makeLeague(0),signings=[];
  // Every existing room is already at its minimum: there is no surplus
  // release that could fund a specialist, unlike a full-template roster.
  league.players=Object.entries(FIELDABLE_DEPTH).filter(([position])=>position!=='K').flatMap(([position,band])=>
    league.players.filter(p=>p.position===position).slice(0,band.min));
  league.teamCapOverride.CPU=league.players.length*1_000_000;
  const minimumCount=league.players.length;
  const result=runFreeAgencyBackstop(league,2026,new RNG(118),{onSigning:row=>signings.push(row)});
  assert.equal(league.players.length,minimumCount);
  assert.equal(signings.length,0);
  assert.ok(result.shortfalls[0].positions.some(row=>row.position==='K'&&row.missing===1));
});

test('funded emergency depth derives overall from actual attributes and records its signing', () => {
  const league=makeLeague(20_000_000),signings=[];
  const result=runFreeAgencyBackstop(league,2026,new RNG(119),{onSigning:row=>signings.push(row)});
  const kicker=league.players.find(p=>p.position==='K');
  assert.ok(kicker);
  assert.equal(kicker.overall,calculatePositionOverall(kicker.position,kicker.ratings));
  assert.ok(kicker.contract.capHit<=20_000_000);
  assert.equal(kicker.provenance,'emergency-depth-signing');
  assert.equal(signings.length,1);
  assert.equal(signings[0].emergency,true);
  assert.deepEqual(result.shortfalls,[]);
});

test('actual session reports final depth shortfalls instead of claiming every roster is legal', () => {
  const session=createSession({seed:119,startYear:2026,controlledTeamId:'BUF'});
  const club=session.league.teams.find(team=>team.id!=='BUF');
  const kicker=session.league.players.find(p=>p.teamId===club.id&&p.position==='K');
  session.league.players.splice(session.league.players.indexOf(kicker),1);
  // A deliberately unfunded club fixture exercises honest reporting. The
  // backstop must not hide a missing kicker by inventing a funded contract.
  session.league.teamCapOverride[club.id]=1;
  session.league.capLedger[club.id].rollover=0;
  const result=session.runRosterLegalityBackstop();
  const shortfall=result.depthShortfalls.find(row=>row.teamId===club.id);
  assert.ok(shortfall.positions.some(row=>row.position==='K'&&row.missing===1));
  assert.deepEqual(session.league.rosterDepthShortfalls,result.depthShortfalls);
  assert.doesNotMatch(result.message,/Every roster is legal|legality closed/);
  assert.ok(result.unresolvedCapClubs>0);
});

test('optional linemen cannot spend the budget needed for a missing kicker', () => {
  const league=makeLeague(4_200_000);
  const line=league.players.filter(p=>p.position==='OL');
  const keep=FIELDABLE_DEPTH.OL.min-2;
  league.players=league.players.filter(p=>p.position!=='OL'||line.slice(0,keep).includes(p));
  league.teamCapOverride.CPU=league.players.length*1_000_000+4_200_000;
  const freeAgent=(id,position)=>({id,position,teamId:'FA',status:'active',overall:50,experience:0,contract:{capHit:0}});
  league.players.push(...Array.from({length:6},(_,i)=>freeAgent(`cheap-OL-${i}`,'OL')),freeAgent('cheap-K','K'));
  runFreeAgencyBackstop(league,2026,new RNG(123));
  const roster=league.players.filter(p=>p.teamId==='CPU');
  assert.ok(roster.filter(p=>p.position==='OL').length>=FIELDABLE_DEPTH.OL.min);
  assert.equal(roster.filter(p=>p.position==='K').length,1,'all mandatory rooms must be funded before optional linemen');
  assert.ok(roster.reduce((sum,p)=>sum+p.contract.capHit,0)<=league.teamCapOverride.CPU);
});

test('actual camp boundary fills a CPU minimum after maintenance rejects an expensive market leader',()=>{
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  session.phase='offseason';
  const team=session.league.teams.find(t=>t.id==='HOU');team.strategyProfile='contender';
  session.league.teams=session.league.teams.filter(t=>['BUF','HOU'].includes(t.id));
  const own=session.league.players.filter(p=>p.teamId==='BUF');
  // A GM may deliberately keep a high-rated eligible player on practice.
  // Automatic quality ranking would activate and rewrite this weekly deal.
  const controlledPractice=own.find(p=>p.contract?.kind==='weekly-practice-contract-v1');
  assert.ok(controlledPractice);
  controlledPractice.overall=99;
  const hou=session.league.players.filter(p=>p.teamId==='HOU');
  // Keep actual active contracts. Choosing a practice player and relabeling
  // its slot would leave an unfunded activation hidden inside this fixture.
  const held=Object.entries(FIELDABLE_DEPTH).flatMap(([position,band])=>hou.filter(p=>p.position===position&&p.rosterSlot!=='practice').slice(0,band.min-(position==='RB'?1:0)));
  held.forEach(p=>p.rosterSlot='active');
  const candidates=hou.filter(p=>p.position==='RB'&&!held.includes(p)).slice(0,2);
  assert.equal(candidates.length,2);
  const [expensive,cheap]=candidates;
  expensive.teamId='FA';expensive.overall=73;expensive.experience=7;
  cheap.teamId='FA';cheap.overall=40;cheap.experience=0;cheap.creditedSeasons=0;
  // Declared fixture experience and the authoritative salary-service ledger
  // must agree; changing a display field cannot erase generated prior service.
  Object.assign(expensive, generatedPlayerService(7));
  Object.assign(cheap, generatedPlayerService(0));
  session.league.players=[...own,...held,expensive,cheap];
  session.league.capLedger.HOU.rollover=0;
  session.league.teamCapOverride.HOU=held.reduce((sum,p)=>sum+p.contract.capHit,0)+session.league.capLedger.HOU.deadCapCurrentYear+2_000_000;
  session.rebuildLookupIndexes();
  const controlledBefore=structuredClone(own),budgetBefore=session.getTeamCapSummary('HOU').capSpace;
  assert.equal(budgetBefore,2_000_000);
  let receipt=null;
  session.runOffseasonCampCutsStage({stage:'camp-cuts'},input=>{receipt=input;return input;});
  const roster=session.league.players.filter(p=>p.teamId==='HOU'&&p.rosterSlot==='active');
  assert.ok(roster.filter(p=>p.position==='RB').length>=FIELDABLE_DEPTH.RB.min,'camp must close the affordable CPU minimum');
  assert.equal(cheap.teamId,'HOU');
  assert.ok(session.getTeamCapSummary('HOU').capSpace>=0);
  assert.deepEqual(session.league.players.filter(p=>p.teamId==='BUF'),controlledBefore,'camp does not transact for controlled GM');
  assert.match(receipt.message,/Depth pass completed/);
});
