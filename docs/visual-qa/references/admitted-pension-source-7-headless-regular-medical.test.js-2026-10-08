import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/regularMedicalFixture.js';
import {createSession} from '../src/runtime/bootstrap.js';
import {simulateSeason,simulateHeadlessRegularSeasonWeek} from '../src/engine/seasonSimulator.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {validateSnapshotAdmittedInjuryPayroll} from '../src/domain/admittedInjuryPayroll.js';

const play=(s,week=1)=>simulateHeadlessRegularSeasonWeek({league:s.league,statBook:s.statBook,year:s.currentYear,
  weekBlock:s.seasonSchedule[week-1],rng:s.rng,mode:'stat'});

for(const retired of [false,true])test(`actual headless week pays old ${retired?'retired':'active'} clearance and preserves source/service`,()=>{
 const {s,l,p}=fixture({retired}),service=structuredClone([p.serviceHistory,p.pensionService]);
 const result=play(s);assert.ok(result.games.length>0);assert.equal(p.injury,null);
 assert.equal(l.admittedInjuryPayroll.length,1);const row=l.admittedInjuryPayroll[0];
 assert.equal(row.teamId,'BUF');assert.equal(row.earningYear,2027);assert.equal(row.injuryYear,2026);assert.equal(row.week,1);
 assert.equal(row.amountCents,l.admittedInjuryContinuations[0].weeklyRateCents);
 assert.deepEqual(p.serviceHistory,service[0]);
 assert.equal(p.pensionService.planYears[2027].games[0].reason,'admitted-injury-continuation');validateSnapshotAdmittedInjuryPayroll(l);
 play(s,2);assert.equal(l.admittedInjuryPayroll.length,1,'healthy next interval adds no wages');
});

test('headless recovery and current-year clearance reconcile actual practice base once',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const matchup=s.seasonSchedule[0].games.find(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'));
 const game=standardElevationGame({...matchup,year:2026,week:1});
 assert.equal(declareStandardElevation({league:l,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:l,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Headless clearance',weeksRemaining:1},{gameId:game.gameId});
 play(s,2);assert.equal(p.injury,null);
 const rows=p.elevationInjuryPay.payroll.filter(row=>row.week===2);assert.equal(rows.length,1);
 assert.equal(rows[0].payCents,rows[0].practiceCents+rows[0].additionalCents);
 assert.equal(rows[0].practiceCents,1375000);assert.equal(rows[0].additionalCents,1486111);
 assert.equal(l.capLedger.BUF.elevationInjuryCharges.filter(row=>row.playerId===p.id&&row.week===2).length,1);
});

test('headless readiness refusal leaves wages, clinical state, stats and RNG unchanged',()=>{
 const {s,l}=fixture(),club=s.seasonSchedule[0].games[0].homeTeamId;
 for(const p of l.players.filter(p=>p.teamId===club))applyInjury(p,{type:'Unavailable',weeksRemaining:16});
 const before=JSON.stringify(s.toSnapshot());assert.throws(()=>play(s));
 assert.equal(JSON.stringify(s.toSnapshot()),before);
});

test('full headless source/year validation refuses before schedule RNG or any state mutation',()=>{
 for(const kind of ['source','year']){
  const {s,l}=fixture();if(kind==='source')l.admittedInjuryContinuations[0].weeklyRateCents++;else l.financialYear=2028;
  const before=JSON.stringify(s.toSnapshot());
  assert.throws(()=>simulateSeason({league:l,statBook:s.statBook,year:2027,rng:s.rng,mode:'stat'}));
  assert.equal(JSON.stringify(s.toSnapshot()),before);
 }
});

test('actual complete headless season pays each elapsed old-source interval before clearance',()=>{
 const {s,l,p}=fixture({retired:true});p.injury.weeksRemaining=3;
 const service=structuredClone([p.serviceHistory,p.pensionService]);
 const result=simulateSeason({league:l,statBook:s.statBook,year:2027,rng:s.rng,mode:'stat'});
 assert.ok(result.superBowl.championTeamId);assert.equal(p.injury,null);
 assert.deepEqual(l.admittedInjuryPayroll.map(row=>[row.phase,row.week]),[['regular-season',1],['regular-season',2],['regular-season',3]]);
 assert.deepEqual(p.serviceHistory,service[0]);
 assert.equal(p.pensionService.planYears[2027].games.length,3);
 assert.ok(l.teams.every(team=>team.season.wins+team.season.losses+team.season.ties===17));
 validateSnapshotAdmittedInjuryPayroll(l);
});

test('source injury does not heal before its recorded incident week',()=>{
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const matchup=s.seasonSchedule[0].games.find(g=>[g.homeTeamId,g.awayTeamId].includes('BUF'));
 const game=standardElevationGame({...matchup,year:2026,week:1});
 assert.equal(declareStandardElevation({league:l,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:l,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Recorded incident',weeksRemaining:3},{gameId:game.gameId});
 play(s);assert.equal(p.injury.weeksRemaining,3);
 assert.ok(!p.elevationInjuryPay.payroll.some(row=>row.week===1));
});
