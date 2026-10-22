import {pendingStandardElevation} from './standardElevations.js';

export const ACTIVE_INACTIVE_HISTORY_VERSION='active-inactive-club-games-v1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const mask=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const popcount=value=>{let total=0;while(value){total+=value&1;value>>>=1;}return total;};
const fail=message=>{const error=new TypeError(`Invalid Active/Inactive history: ${message}`);error.reasonCode='ACTIVE_INACTIVE_HISTORY_INVALID';throw error;};
const keys=(value,expected)=>object(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));

export function validateActiveInactiveHistory(league){
  const state=league.activeInactiveHistory;if(state===undefined)return;
  if(!keys(state,['version','year','clubs'])||state.version!==ACTIVE_INACTIVE_HISTORY_VERSION||!Number.isSafeInteger(state.year)
    ||state.year<2020||state.year>2200||state.year>league.year||!object(state.clubs))fail('version or year');
  for(const [teamId,row]of Object.entries(state.clubs)){
    if(!league.teams.some(t=>t.id===teamId)||!keys(row,['regularSeen','postseasonGames','membership'])||!mask(row.regularSeen,262143)
      ||!Array.isArray(row.postseasonGames)||row.postseasonGames.length>4||new Set(row.postseasonGames).size!==row.postseasonGames.length
      ||row.postseasonGames.some(id=>typeof id!=='string'||!id.startsWith(`${state.year}-playoffs-`))||!object(row.membership))fail('club row');
    const postseasonSeen=(1<<row.postseasonGames.length)-1;
    for(const [id,value]of Object.entries(row.membership))if(!id||['__proto__','constructor','prototype'].includes(id)||!Array.isArray(value)||value.length!==2
      ||!mask(value[0],262143)||(value[0]&row.regularSeen)!==value[0]||!mask(value[1],postseasonSeen))fail('membership masks');
  }
}

// Active/Inactive membership is the 53-player list plus this game's declared
// elevations. Dressing, injury absences and snap counts are separate questions.
export function onActiveInactiveList(player,game){
  const designated=['ir','pup','nfi','exemptCommissioner'].some(key=>player.designations?.[key]===true);
  return player.status==='active'&&!designated&&((player.rosterSlot||'active')==='active'
    ||Boolean(pendingStandardElevation(player,game)));
}

// Compact current-season membership per club: regular-week and playoff masks
// per listed player. Prior imported games remain unknown; no retroactive fill.
export function recordActiveInactiveGame({league,result}){
  // Standalone service callers can supply only players. A complete league is
  // required to establish club coverage rather than inventing missing clubs.
  if(!Array.isArray(league.teams)||!Number.isInteger(league.year))return;
  if(!Number.isInteger(result.year)||!['regular','playoffs'].includes(result.seasonType))return;
  if(result.seasonType==='regular'&&(!Number.isInteger(result.week)||result.week<1||result.week>18))return;
  if(result.seasonType==='playoffs'&&(typeof result.gameId!=='string'||!result.gameId.startsWith(`${result.year}-playoffs-`)))return;
  validateActiveInactiveHistory(league);
  if(league.activeInactiveHistory?.year>result.year)fail('out-of-order year');
  const updates=[];
  for(const teamId of [result.homeTeamId,result.awayTeamId]){
    if(!league.teams.some(t=>t.id===teamId))fail('game club');
    const existing=league.activeInactiveHistory?.year===result.year?league.activeInactiveHistory.clubs[teamId]:null;
    const row=existing?structuredClone(existing):{regularSeen:0,postseasonGames:[],membership:{}};
    const regular=result.seasonType==='regular';
    if(regular?Boolean(row.regularSeen&(1<<(result.week-1))):row.postseasonGames.includes(result.gameId))continue;
    if(!regular&&row.postseasonGames.length>=4)fail('too many playoff games');
    const bit=regular?1<<(result.week-1):1<<row.postseasonGames.length;
    if(regular)row.regularSeen|=bit;else row.postseasonGames.push(result.gameId);
    for(const player of league.players)if(player.teamId===teamId&&onActiveInactiveList(player,result)){
      if(typeof player.id!=='string'||!player.id||['__proto__','constructor','prototype'].includes(player.id))fail('player id');
      if(!Object.hasOwn(row.membership,player.id))row.membership[player.id]=[0,0];
      row.membership[player.id][regular?0:1]|=bit;
    }
    updates.push([teamId,row]);
  }
  if(!updates.length)return;
  if(league.activeInactiveHistory?.year!==result.year)league.activeInactiveHistory={version:ACTIVE_INACTIVE_HISTORY_VERSION,year:result.year,clubs:{}};
  for(const [teamId,row]of updates)league.activeInactiveHistory.clubs[teamId]=row;
}

export function priorActiveInactiveGames({league,player,teamId,year,gameId,postseasonState,thresholdRequired=true}){
  validateActiveInactiveHistory(league);
  const row=league.activeInactiveHistory?.year===year?league.activeInactiveHistory.clubs[teamId]:null;
  const member=row?.membership[player.id]||[0,0];
  const currentIndex=row?.postseasonGames.indexOf(gameId)??-1;
  const priorPostseasonMask=currentIndex>=0?member[1]&~(1<<currentIndex):member[1];
  const observed=popcount(member[0])+popcount(priorPostseasonMask);
  // Three observed games already prove the full-pay threshold, even if an
  // imported career has other unknown games. This number is a lower bound.
  if(observed>=3||!thresholdRequired)return observed;
  const club=league.teams.find(t=>t.id===teamId);
  if(!club||postseasonState?.year!==year||!Array.isArray(postseasonState.gameArchiveEntries))fail('postseason coverage authority');
  const expectedWeeks=club.season?.weekResults;
  const counters=['wins','losses','ties'].map(key=>club.season?.[key]);
  const completeResults=Array.isArray(expectedWeeks)&&counters.every(value=>Number.isSafeInteger(value)&&value>=0)
    &&expectedWeeks.length===counters.reduce((sum,value)=>sum+value,0)&&new Set(expectedWeeks.map(g=>g.week)).size===expectedWeeks.length;
  const priorPlayoffs=postseasonState.gameArchiveEntries.filter(g=>g.gameId!==gameId&&[g.homeTeamId,g.awayTeamId].includes(teamId));
  if(!completeResults||expectedWeeks.some(g=>!Number.isInteger(g.week)||g.week<1||g.week>18||!((row?.regularSeen||0)&(1<<(g.week-1))))
    ||priorPlayoffs.some(g=>!row?.postseasonGames.includes(g.gameId))){
    const error=new Error('Prior Active/Inactive membership is unknown for this club. Three observed games or complete current-season history is required to determine elevated postseason pay.');
    error.reasonCode='ELEVATION_HISTORY_UNKNOWN';error.status=409;throw error;
  }
  return observed;
}
