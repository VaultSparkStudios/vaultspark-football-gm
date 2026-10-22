import {fileElevationInjurySalaryClaim} from './injurySalaryClaims.js';
import {regularElevationSalaryForSeason} from '../data/nflElevationSalary.js';
import {projectRehab} from '../engine/injurySystem.js';
import {canonicalFootballGame,footballGameMedicalWeek} from './footballGameReference.js';
import {resolvePracticeContractTerm} from './practiceContractTerm.js';

export const ANNUAL_INJURY_RESOLUTION_VERSION='post-term-injury-claim-retention-v1';
const keys=['version','year','playerId','gameId','teamId','term','termEvidence','claimId','estimate'];
const termKeys=['ok','version','year','teamId','lastGameId','lastGameMedicalWeek','endsAfterMedicalWeek','proof','finalGameId'];
const estimateKeys=['version','advances','weeklyAmountCents','amountCents','kind'];
const gameKeys=['gameId','year','week','seasonType','label','round','homeTeamId','awayTeamId','homeScore','awayScore','winnerId'];
const exact=(x,fields)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const fail=message=>{throw Object.assign(new TypeError(`Invalid annual injury resolution: ${message}`),{status:400,reasonCode:'ELEVATION_INJURY_RESOLUTION_INVALID'});};
function reference(gameId){
 const match=/^(\d{4})-(regular|playoffs)-(regular-season|(?:afc|nfc)-(?:wildcard|divisional|conference)|super-bowl)-(\d+)-([^-]+)-([^-]+)$/.exec(gameId||'');
 if(!match)fail('game reference');
 const [,year,seasonType,label,week,awayTeamId,homeTeamId]=match;
 const game=canonicalFootballGame({year:Number(year),seasonType,label,week:Number(week),awayTeamId,homeTeamId,
  round:seasonType==='regular'?null:label.replace(/^(afc|nfc)-/,'')});
 if(game.gameId!==gameId)fail('canonical reference');return game;
}

function retainedTermEvidence(league,year){
 const candidates=[...(league.gameArchive||[]).filter(g=>g.year===year&&(g.seasonType==='playoffs'||g.week===18)),
  ...(league.history||[]).filter(h=>h.year===year&&h.superBowl).map(h=>({...h.superBowl,year,week:0,seasonType:'playoffs',label:'super-bowl',round:'super-bowl'}))];
 const games=candidates.map(row=>Object.fromEntries(gameKeys.map(key=>[key,key==='round'?(row.round??(row.seasonType==='playoffs'?row.label?.replace(/^(afc|nfc)-/,''):null)):
  key==='winnerId'?(row.winnerId??(row.homeScore===row.awayScore?null:row.homeScore>row.awayScore?row.homeTeamId:row.awayTeamId)):row[key]])));
 return {version:'retained-club-term-games-v1',games};
}

// Called on the calendar's working clone, before post-term recovery. An
// estimate files disputed rights; it is neither wages paid nor an award.
export function preservePostTermElevationInjuryClaim(league,{player,episode,term,getTeamModifiers}={}){
 const existingResolution=league.annualElevationInjuryResolutions?.find(row=>row.playerId===player.id&&row.gameId===episode.gameId);
 if(existingResolution)return existingResolution;
 const projection=projectRehab(player,getTeamModifiers?.(player.teamId,player)||{});
 const advances=Math.ceil(projection.estimatedAdvances);
 const weeklyAmountCents=regularElevationSalaryForSeason(episode.year,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;
 const amountCents=advances*weeklyAmountCents;
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)fail('estimate');
 const existingClaim=league.injurySalaryClaims?.find(row=>row.playerId===player.id&&row.gameId===episode.gameId);
 const claim=existingClaim||fileElevationInjurySalaryClaim(league,{playerId:player.id,gameId:episode.gameId,claimedCents:amountCents}).claim;
 const row={version:ANNUAL_INJURY_RESOLUTION_VERSION,year:episode.year,playerId:player.id,gameId:episode.gameId,teamId:episode.teamId,
  term:structuredClone(term),termEvidence:retainedTermEvidence(league,episode.year),claimId:claim.claimId,
  estimate:{version:'medical-claim-estimate-v1',advances,weeklyAmountCents,amountCents,kind:existingClaim?'existing-disputed-claim':'modeled-medical-estimate'}};
 league.annualElevationInjuryResolutions||=[];league.annualElevationInjuryResolutions.push(row);
 episode.status='claim-pending';
 return row;
}

export function validateSnapshotAnnualElevationInjuryResolutions(snapshot){
 const league=snapshot.league||snapshot,rows=league.annualElevationInjuryResolutions;
 if(rows===undefined)return;
 if(!Array.isArray(rows))fail('receipts');
 const players=[...(league.players||[]),...(league.retiredPlayers||[])],teams=new Set((league.teams||[]).map(t=>t.id)),seen=new Set();
 for(const row of rows){
  const identity=JSON.stringify([row.playerId,row.gameId]);
  const player=players.find(p=>p.id===row.playerId),episode=player?.elevationInjuryPay?.episodes.find(e=>e.gameId===row.gameId);
  const claim=league.injurySalaryClaims?.find(c=>c.claimId===row.claimId),term=row.term,estimate=row.estimate;
  if(!exact(row,keys)||row.version!==ANNUAL_INJURY_RESOLUTION_VERSION||seen.has(identity)||!episode||!claim
    ||row.year!==episode.year||row.teamId!==episode.teamId||!teams.has(row.teamId)||episode.status!=='claim-pending'
    ||claim.playerId!==row.playerId||claim.gameId!==row.gameId||claim.teamId!==row.teamId||claim.injuryYear!==row.year
    ||!league.preRolloverMedicalCalendar?.some(period=>period.year===row.year&&period.throughWeek===27))fail('source linkage');
  if(!exact(term,termKeys)||term.ok!==true||term.version!=='club-final-game-practice-term-v1'||term.year!==row.year||term.teamId!==row.teamId
    ||!['completed-final','playoff-elimination','completed-bracket-nonparticipant'].includes(term.proof))fail('term');
  const last=reference(term.lastGameId),final=reference(term.finalGameId);
  if(last.year!==row.year||![last.homeTeamId,last.awayTeamId].includes(row.teamId)||final.year!==row.year||final.round!=='super-bowl'
    ||!teams.has(last.homeTeamId)||!teams.has(last.awayTeamId)||!teams.has(final.homeTeamId)||!teams.has(final.awayTeamId)
    ||term.lastGameMedicalWeek!==footballGameMedicalWeek(last)||term.endsAfterMedicalWeek!==term.lastGameMedicalWeek+1
    ||term.proof==='completed-final'&&last.gameId!==final.gameId
    ||term.proof==='playoff-elimination'&&(last.seasonType!=='playoffs'||last.round==='super-bowl')
    ||term.proof==='completed-bracket-nonparticipant'&&(last.seasonType!=='regular'||last.week!==18))fail('term reference');
  const calendar=league.preRolloverMedicalCalendar.find(period=>period.year===row.year);
  if(calendar.finalGameId!==final.gameId)fail('final linkage');
  const evidence=row.termEvidence;
  if(!exact(evidence,['version','games'])||evidence.version!=='retained-club-term-games-v1'||!Array.isArray(evidence.games)
    ||!evidence.games.length||evidence.games.some(g=>!exact(g,gameKeys)||g.year!==row.year))fail('term evidence');
  // Retained results survive pruning but cannot contradict still-available
  // originals. The shared resolver rejects duplicate scores and chronology.
  const proved=resolvePracticeContractTerm({teams:league.teams,gameArchive:[...evidence.games,...(league.gameArchive||[])],history:league.history},
   {teamId:row.teamId,year:row.year});
  if(!proved.ok||termKeys.some(key=>proved[key]!==term[key]))fail('unproved retained term');
  const weekly=regularElevationSalaryForSeason(row.year,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;
  if(!exact(estimate,estimateKeys)||estimate.version!=='medical-claim-estimate-v1'||!Number.isSafeInteger(estimate.advances)||estimate.advances<=0
    ||estimate.weeklyAmountCents!==weekly||!Number.isSafeInteger(estimate.amountCents)||estimate.amountCents!==weekly*estimate.advances
    ||!['existing-disputed-claim','modeled-medical-estimate'].includes(estimate.kind)
    ||estimate.kind==='modeled-medical-estimate'&&claim.claimedCents!==estimate.amountCents)fail('estimate');
  seen.add(identity);
 }
}
