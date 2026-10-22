import {validatePlayerElevationInjuryPay} from './elevationInjuryPay.js';
import {validatePlayerStandardElevations} from './standardElevations.js';
import {resolvePracticeContractTerm} from './practiceContractTerm.js';
import {canonicalFootballGame} from './footballGameReference.js';
import {regularElevationSalaryForSeason} from '../data/nflElevationSalary.js';

export const ADMITTED_CONTINUATION_VERSION='admitted-elevation-continuation-v1';
const rightKeys=['version','rightId','playerId','gameId','teamId','injuryYear','creditedSeasons','authority','term','termEvidence','weeklyRateCents'];
const termKeys=['ok','version','year','teamId','lastGameId','lastGameMedicalWeek','endsAfterMedicalWeek','proof','finalGameId'];
const gameKeys=['gameId','year','week','seasonType','label','round','homeTeamId','awayTeamId','homeScore','awayScore','winnerId'];
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const identity=(playerId,gameId)=>JSON.stringify([playerId,gameId]);
const fail=message=>{throw Object.assign(new TypeError(`Invalid admitted injury continuation: ${message}`),{status:400,reasonCode:'ADMITTED_INJURY_CONTINUATION_INVALID'});};
const players=league=>[...(league.players||[]),...(league.retiredPlayers||[])];
function originalGames(league,year){
 return [...(league.gameArchive||[]).filter(g=>g.year===year&&(g.seasonType==='playoffs'||g.week===18)),
  ...(league.history||[]).filter(h=>h.year===year&&h.superBowl).map(h=>({...h.superBowl,year,week:0,seasonType:'playoffs',label:'super-bowl',round:'super-bowl'}))];
}
function retainedGames(league,year){
 return originalGames(league,year).map(row=>{
  const game=canonicalFootballGame({...row,round:row.seasonType==='playoffs'?(row.round||row.label?.replace(/^(afc|nfc)-/,'')):null});
  return Object.fromEntries(gameKeys.map(key=>[key,Object.hasOwn(game,key)?game[key]:key==='winnerId'?(row.winnerId??(row.homeScore===row.awayScore?null:row.homeScore>row.awayScore?row.homeTeamId:row.awayTeamId)):row[key]]));
 });
}
function source(league,right){
 const player=players(league).find(player=>player.id===right.playerId);
 if(!player)fail('missing player');
 validatePlayerElevationInjuryPay(player);validatePlayerStandardElevations(player);
 const episode=player.elevationInjuryPay?.episodes.find(row=>row.gameId===right.gameId);
 const elevation=player.standardElevations?.games.find(row=>row.game.gameId===right.gameId);
 const clubs=new Set((league.teams||[]).map(team=>team.id));
 if(!episode||!elevation||elevation.status!=='reverted'||episode.teamId!==right.teamId||episode.year!==right.injuryYear
  ||episode.creditedSeasons!==right.creditedSeasons||elevation.teamId!==right.teamId||elevation.game.year!==right.injuryYear
  ||elevation.creditedSeasons!==right.creditedSeasons||!clubs.has(right.teamId))fail('injury/elevation source');
 const game=canonicalFootballGame(elevation.game);
 if(game.gameId!==right.gameId||![game.homeTeamId,game.awayTeamId].includes(right.teamId)
  ||!clubs.has(game.homeTeamId)||!clubs.has(game.awayTeamId))fail('injury game/payer');
 if(league.injurySalaryClaims?.some(claim=>claim.playerId===right.playerId&&claim.gameId===right.gameId))fail('disputed claim has separate authority');
 return {player,episode};
}

export function validateAdmittedInjuryContinuation(league,right){
 if(!exact(right,rightKeys)||right.version!==ADMITTED_CONTINUATION_VERSION
  ||right.authority!=='modeled-qualifying-injury-admission'||right.rightId!==identity(right.playerId,right.gameId))fail('right');
 const {player,episode}=source(league,right);
 if(!exact(right.term,termKeys)||right.term.ok!==true||right.term.year!==right.injuryYear||right.term.teamId!==right.teamId)fail('employment term');
 const evidence=right.termEvidence;
 if(!exact(evidence,['version','games'])||evidence.version!=='retained-club-term-games-v1'||!Array.isArray(evidence.games)
  ||!evidence.games.length||evidence.games.some(game=>!exact(game,gameKeys)||game.year!==right.injuryYear))fail('term evidence');
 const clubs=new Set((league.teams||[]).map(team=>team.id));
 for(const row of evidence.games){
  const game=canonicalFootballGame(row);
  if(game.gameId!==row.gameId||!clubs.has(game.homeTeamId)||!clubs.has(game.awayTeamId)
   ||!Number.isSafeInteger(row.homeScore)||row.homeScore<0||!Number.isSafeInteger(row.awayScore)||row.awayScore<0
   ||game.seasonType==='playoffs'&&row.homeScore===row.awayScore
   ||row.winnerId!==(row.homeScore===row.awayScore?null:row.homeScore>row.awayScore?row.homeTeamId:row.awayTeamId))fail('retained result');
 }
 // Prefer the retained authority on retry. Still-available originals must agree;
 // the resolver rejects conflicting scores, chronology and participating clubs.
 const resolved=resolvePracticeContractTerm({...league,gameArchive:[...evidence.games,...originalGames(league,right.injuryYear)],history:[]},
  {teamId:right.teamId,year:right.injuryYear});
 if(!resolved.ok||termKeys.some(key=>resolved[key]!==right.term[key]))fail('unproved/contradictory term');
 const rate=regularElevationSalaryForSeason(right.injuryYear,right.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;
 if(right.weeklyRateCents!==rate)fail('source rate');
 return {playerId:player.id,sourceTeamId:right.teamId,injuryYear:right.injuryYear,
  injuryOngoing:player.injury?.weeksRemaining>0,episodeStatus:episode.status,employmentRequired:false};
}

export function validateSnapshotAdmittedInjuryContinuations(snapshot){
 const league=snapshot.league||snapshot,rights=league.admittedInjuryContinuations;
 if(rights===undefined)return;
 if(!Array.isArray(rights))fail('rights collection');
 const seen=new Set();
 for(const right of rights){
  validateAdmittedInjuryContinuation(league,right);
  if(seen.has(right.rightId))fail('duplicate right');seen.add(right.rightId);
 }
}

// Retaining an admitted source does not pay a future interval, award pension
// service, extend employment or file a player grievance. Calendar/payment and
// dispute commands consume this authority separately.
export function retainAdmittedInjuryContinuation(league,{playerId,gameId}={}){
 validateSnapshotAdmittedInjuryContinuations(league);
 const existing=league.admittedInjuryContinuations?.find(right=>right.rightId===identity(playerId,gameId));
 if(existing)return {alreadyRetained:true,right:structuredClone(existing)};
 const player=players(league).find(player=>player.id===playerId);
 const episode=player?.elevationInjuryPay?.episodes.find(row=>row.gameId===gameId);
 if(!episode||episode.status!=='active'||!(player.injury?.weeksRemaining>0))fail('ongoing qualifying episode required');
 const term=resolvePracticeContractTerm(league,{teamId:episode.teamId,year:episode.year});
 if(!term.ok)fail('club final-game evidence required');
 const right={version:ADMITTED_CONTINUATION_VERSION,rightId:identity(playerId,gameId),playerId,gameId,teamId:episode.teamId,
  injuryYear:episode.year,creditedSeasons:episode.creditedSeasons,authority:'modeled-qualifying-injury-admission',term,
  termEvidence:{version:'retained-club-term-games-v1',games:retainedGames(league,episode.year)},
  weeklyRateCents:regularElevationSalaryForSeason(episode.year,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents};
 validateAdmittedInjuryContinuation(league,right);
 league.admittedInjuryContinuations||=[];league.admittedInjuryContinuations.push(right);
 return {alreadyRetained:false,right:structuredClone(right)};
}
