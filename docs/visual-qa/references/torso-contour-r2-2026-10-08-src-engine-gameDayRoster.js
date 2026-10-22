import { assignFieldableActiveRoster } from "./capCompliance.js";
import { depthOrderedPlayers } from "./depthChartUsage.js";
import { getTeamPlayers } from "../domain/teamFactory.js";
import { recordFootballGameService, validatePlayerService } from '../domain/playerService.js';
import { recordReserveGameAbsences } from '../domain/reserveLists.js';
import {pendingStandardElevation,validateSnapshotStandardElevations,settleStandardElevationGame} from '../domain/standardElevations.js';
import {recordActiveInactiveGame,validateActiveInactiveHistory,priorActiveInactiveGames} from '../domain/activeInactiveHistory.js';
import {postseasonElevationSalaryForSeason} from '../data/nflPostseasonSalary.js';
import { recordPensionGameService, pensionGameWeek } from '../domain/pensionService.js';
import { recordElevationInjuryWeekPay } from '../domain/elevationInjuryPay.js';

export function getGameTeamPlayers(league,teamId,game=null){
  const ordinary=getTeamPlayers(league,teamId).filter(p=>p.designations?.exemptCommissioner!==true);
  if(!game)return ordinary;
  const elevated=league.players.filter(p=>p.teamId===teamId&&p.status==='active'&&p.rosterSlot==='practice'
    &&pendingStandardElevation(p,game)&&!['ir','pup','nfi','exemptCommissioner','gameDayInactive'].some(key=>p.designations?.[key]===true)
    &&(!p.injury||p.injury.weeksRemaining<=0)&&(p.suspensionWeeks||0)<=0);
  return [...ordinary,...elevated];
}

function elevationAuthority(league,game,postseasonState){
  return {
    priorClubListGames:(player,teamId,year,gameId)=>priorActiveInactiveGames({league,player,teamId,year,gameId,postseasonState,
      thresholdRequired:['conference','super-bowl'].includes(pendingStandardElevation(player,game)?.game.round)}),
    divisionWinner:teamId=>{
      const club=league.teams.find(t=>t.id===teamId),seeds=postseasonState?.seeds?.[club?.conference];
      const entry=seeds?.find(row=>row.teamId===teamId);
      if(postseasonState?.year!==game.year||!entry||!Number.isInteger(entry.seed)||entry.seed<1||entry.seed>7)throw new TypeError('Elevated postseason pay requires the current playoff seeds');
      return entry.seed<=4;
    }
  };
}

function preflightElevations(league,game,postseasonState){
  validateSnapshotStandardElevations({league});validateActiveInactiveHistory(league);
  if(!game)return;
  const authority=elevationAuthority(league,game,postseasonState);
  for(const player of league.players){
    const row=pendingStandardElevation(player,game);if(!row||row.game.seasonType!=='playoffs')continue;
    postseasonElevationSalaryForSeason(row.game.year,{round:row.game.round,
      priorClubListGames:authority.priorClubListGames(player,row.teamId,row.game.year,game.gameId),divisionWinner:authority.divisionWinner(row.teamId)});
  }
}

export function checkFootballReadiness({ league, teamIds,game=null,postseasonState=null,year,weekBlock=null }) {
  if(weekBlock&&Array.isArray(weekBlock.games)){
    for(const matchup of weekBlock.games){
      const week=weekBlock.week,label='regular-season',seasonType='regular';
      const ref={...matchup,year,week,label,seasonType,gameId:`${year}-${seasonType}-${label}-${week}-${matchup.awayTeamId}-${matchup.homeTeamId}`};
      const ready=checkFootballReadiness({league,teamIds:[matchup.homeTeamId,matchup.awayTeamId],game:ref});
      if(!ready.ok)return ready;
    }
    return {ok:true};
  }
  preflightElevations(league,game,postseasonState);
  const teams = new Set(teamIds);
  for (const player of league.players) if (teams.has(player.teamId)) validatePlayerService(player, league);
  const unavailableTeamIds = [...new Set(teamIds)].filter(teamId => !getGameTeamPlayers(league, teamId,game).length);
  if (!unavailableTeamIds.length) return { ok: true };
  return { ok: false, status: 409, reasonCode: "GAME_DAY_ROSTER_EMPTY", teamIds: unavailableTeamIds,
    error: `${unavailableTeamIds.join(", ")} has no available game-day players. Activate an eligible player or clear inactive designations before advancing.`,
    prerequisite: "simulator-availability" };
}

// NFL current active list. The existing roster allocator supplies fieldable
// positional depth; a stable depth-chart comparator respects user starters.
export function selectGameDayRoster({ league, teamId, roster }) {
  const offensiveLinemenAvailable = roster.filter(p => p.position === "OL").length;
  const limit = offensiveLinemenAvailable >= 8 ? 48 : 47;
  const ranks = new Map();
  for (const position of new Set(roster.map(p => p.position))) {
    depthOrderedPlayers(league, teamId, position, roster).forEach((p, rank) => ranks.set(p.id, rank));
  }
  const { active } = assignFieldableActiveRoster(roster, { activeLimit: limit,
    comparePlayers: (a, b) => (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER) || b.overall - a.overall || String(a.id).localeCompare(String(b.id))
  });
  const offensiveLinemen = active.filter(p => p.position === "OL").length;
  if (active.length > 47 && offensiveLinemen < 8) throw new Error("48-player game-day list requires eight offensive linemen");
  return { players: active, receipt: { limit, offensiveLinemen, playerIds: active.map(p => p.id) } };
}

// These are one-game instructions. A bye or an unrelated playoff game must
// not consume them; clearing happens only after that club's game is applied.
export function clearGameDayInactives(league, teamIds) {
  const played = new Set(teamIds);
  for (const player of league.players) {
    if (played.has(player.teamId) && player.designations) player.designations.gameDayInactive = false;
  }
}

export function applyFootballPostGame({ league, result,postseasonState=null }) {
  preflightElevations(league,result,postseasonState);
  for (const player of league.players) if ([result.homeTeamId, result.awayTeamId].includes(player.teamId)) validatePlayerService(player, league);
  const elevatedPlayerIds=league.players.filter(p=>pendingStandardElevation(p,result)).map(p=>p.id);
  recordActiveInactiveGame({league,result});
  recordReserveGameAbsences({ league, result });
  const processed = new Set(recordFootballGameService({ league, result,elevatedPlayerIds }));
  const elevationPayroll=settleStandardElevationGame({league,result,...elevationAuthority(league,result,postseasonState)});
  // A continuation paycheck alone is not a pension game. Join it to this
  // applied club game; later weekly payroll calls are idempotent.
  const pensionGame = result.seasonType === 'regular' ? result.label === 'regular-season'
    : result.seasonType === 'playoffs' && /^(?:super-bowl|(?:afc|nfc)-(?:wildcard|divisional|conference))$/.test(result.label || '');
  if (pensionGame && Array.isArray(league.teams) && league.players.some(player =>
    [result.homeTeamId, result.awayTeamId].includes(player.teamId) && player.elevationInjuryPay?.episodes.some(row => row.status === 'active')))
    recordElevationInjuryWeekPay(league, { year: result.year, week: pensionGameWeek(result), teamIds: [result.homeTeamId, result.awayTeamId] });
  // Standalone tactical experiments retain their custom labels and existing
  // simulation behavior; they cannot manufacture a scheduled pension game.
  const pensionPlayerIds = pensionGame ? recordPensionGameService({ league, result, elevatedPlayerIds }) : [];
  for (const player of league.players) {
    if (processed.has(player.id) && (player.suspensionWeeks || 0) > 0) player.suspensionWeeks -= 1;
  }
  clearGameDayInactives(league, [result.homeTeamId, result.awayTeamId]);
  return {elevationPayroll,pensionPlayerIds};
}
