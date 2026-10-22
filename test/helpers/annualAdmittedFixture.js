import assert from 'node:assert/strict';
import {createSession} from '../../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../../src/domain/footballGameReference.js';
import {applyInjury} from '../../src/engine/injurySystem.js';
// Controlled canonical final and qualifying injury; not a played career proof.
export function fixture(weeks=16){
 const s=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),l=s.league;
 const p=l.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 assert.equal(declareStandardElevation({league:l,player:p,teamId:'BUF',game,capSpace:1e8}).ok,true);
 settleStandardElevationGame({league:l,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Controlled qualifying incapacity',weeksRemaining:weeks},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 l.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});
 s.phase='offseason';s.currentWeek=19;delete l.offseasonPipeline;
 return{s,l,p,game};
}
