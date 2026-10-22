import {canonicalFootballGame,footballGameMedicalWeek} from './footballGameReference.js';

// Appendix J ends employment one week after the club's last game. This is
// the game's weekly projection of that boundary, not a calendar-date claim.
export const PRACTICE_CONTRACT_TERM_VERSION='club-final-game-practice-term-v1';
const unresolved=()=>({ok:false,reasonCode:'PRACTICE_CONTRACT_TERM_UNPROVED',error:'The club final-game evidence is incomplete; preserve the contract and unresolved injury rights.'});

function played(row,year,teams){
 if(!row||row.year!==year||!Number.isSafeInteger(row.homeScore)||row.homeScore<0||!Number.isSafeInteger(row.awayScore)||row.awayScore<0)return null;
 try{
  const round=row.seasonType==='playoffs'?(row.round||row.label?.replace(/^(afc|nfc)-/,'')):null;
  const game=canonicalFootballGame({...row,round});
  if(row.gameId!==game.gameId||!teams.has(game.homeTeamId)||!teams.has(game.awayTeamId)
    ||game.seasonType==='playoffs'&&row.homeScore===row.awayScore)return null;
  const winnerId=row.homeScore===row.awayScore?null:row.homeScore>row.awayScore?game.homeTeamId:game.awayTeamId;
  if(row.winnerId!=null&&row.winnerId!==winnerId)return null;
  return {...game,winnerId,homeScore:row.homeScore,awayScore:row.awayScore,medicalWeek:footballGameMedicalWeek(game)};
 }catch{return null;}
}

function completedBracket(games,teams,final){
 if(games.length!==13)return false;
 const champions=[];
 for(const conference of ['AFC','NFC']){
  const stages=['wildcard','divisional','conference'].map(round=>games.filter(g=>g.label===`${conference.toLowerCase()}-${round}`));
  if(stages.some((stage,index)=>stage.length!==[3,2,1][index]))return false;
  for(const stage of stages){
   const clubs=stage.flatMap(g=>[g.homeTeamId,g.awayTeamId]);
   if(new Set(clubs).size!==clubs.length||clubs.some(id=>teams.get(id)?.conference!==conference))return false;
  }
  const wildcardClubs=new Set(stages[0].flatMap(g=>[g.homeTeamId,g.awayTeamId]));
  const divisionClubs=new Set(stages[1].flatMap(g=>[g.homeTeamId,g.awayTeamId]));
  if(stages[0].some(g=>!divisionClubs.has(g.winnerId))||[...divisionClubs].filter(id=>!wildcardClubs.has(id)).length!==1)return false;
  const conferenceClubs=new Set(stages[2].flatMap(g=>[g.homeTeamId,g.awayTeamId]));
  if(stages[1].some(g=>!conferenceClubs.has(g.winnerId)))return false;
  champions.push(stages[2][0].winnerId);
 }
 return games.filter(g=>g.round==='super-bowl').length===1&&champions.includes(final.homeTeamId)&&champions.includes(final.awayTeamId);
}

export function resolvePracticeContractTerm(league,{teamId,year}={}){
 if(!Number.isSafeInteger(year)||year<2022||year>2200||!league||!Array.isArray(league.teams))return unresolved();
 const teams=new Map(league.teams.map(t=>[t.id,t]));if(!teams.has(teamId))return unresolved();
 const candidates=(league.gameArchive||[]).map(row=>played(row,year,teams)).filter(Boolean);
 // History can retain the canonical final after compact archive retention.
 for(const history of league.history||[])if(history.year===year&&history.superBowl){
  const row=history.superBowl;
  const game=played({...row,year,week:0,seasonType:'playoffs',round:'super-bowl',label:'super-bowl'},year,teams);
  if(game)candidates.push(game);
 }
 const unique=new Map();
 for(const game of candidates){
  const existing=unique.get(game.gameId);
  if(existing&&(existing.homeScore!==game.homeScore||existing.awayScore!==game.awayScore))return unresolved();
  unique.set(game.gameId,game);
 }
 const games=[...unique.values()],finals=games.filter(g=>g.round==='super-bowl');
 if(finals.length!==1)return unresolved();const final=finals[0];
 const playoff=games.filter(g=>g.seasonType==='playoffs'&&[g.homeTeamId,g.awayTeamId].includes(teamId)).sort((a,b)=>b.medicalWeek-a.medicalWeek);
 const losses=playoff.filter(g=>g.winnerId!==teamId);
 if(new Set(playoff.map(g=>g.medicalWeek)).size!==playoff.length||losses.length>1
   ||losses.length&&playoff[0].gameId!==losses[0].gameId)return unresolved();
 let last,proof;
 if([final.homeTeamId,final.awayTeamId].includes(teamId)){last=final;proof='completed-final';}
 else{
  // A proved playoff loss is terminal. Contradictory later participation is
  // not repaired by guessing a date or discarding a result.
  if(losses.length){
   if(losses.length!==1||playoff[0].gameId!==losses[0].gameId)return unresolved();
   last=losses[0];proof='playoff-elimination';
  }else{
   const bracket=games.filter(g=>g.seasonType==='playoffs');
   if(playoff.length||!completedBracket(bracket,teams,final))return unresolved();
   last=games.find(g=>g.seasonType==='regular'&&g.week===18&&[g.homeTeamId,g.awayTeamId].includes(teamId));
   if(!last)return unresolved();proof='completed-bracket-nonparticipant';
  }
 }
 return {ok:true,version:PRACTICE_CONTRACT_TERM_VERSION,year,teamId,lastGameId:last.gameId,lastGameMedicalWeek:last.medicalWeek,
  endsAfterMedicalWeek:last.medicalWeek+1,proof,finalGameId:final.gameId};
}
