import assert from 'node:assert/strict';
import {createSession,createSessionFromSnapshot} from '../../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../../src/domain/footballGameReference.js';
import {applyInjury} from '../../src/engine/injurySystem.js';
import {advancePreRolloverMedicalCalendar} from '../../src/domain/preRolloverMedicalCalendar.js';

export function fixture({retired=false}={}){
 const old=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=old.league;
 const p=l.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league:l,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:l,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Qualifying previous-year injury',weeksRemaining:20},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 l.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 advancePreRolloverMedicalCalendar(l,{completedYear:2026,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
 p.practiceContractHistory=[structuredClone(p.contract)];p.teamId='FA';p.rosterSlot='active';
 p.contract={salary:0,yearsRemaining:0,capHit:0,baseSalary:0,signingBonus:0,guaranteed:0,deadCapRemaining:0,restructureCount:0};
 p.injury.weeksRemaining=1;
 const s=createSession({seed:118,startYear:2027,controlledTeamId:'BUF'});
 s.league.gameArchive.push(...l.gameArchive);s.league.admittedInjuryContinuations=structuredClone(l.admittedInjuryContinuations);
 s.league.preRolloverMedicalCalendar=structuredClone(l.preRolloverMedicalCalendar);
 assert.ok(!s.league.players.some(row=>row.id===p.id));
 if(retired){p.status='retired';s.league.retiredPlayers.push(p);}else s.league.players.push(p);
 return {s,l:s.league,p};
}
