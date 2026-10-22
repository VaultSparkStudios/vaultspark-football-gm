import {advanceInjuryRecovery,teamRecoveryModifiers} from '../engine/injurySystem.js';
import {recordAdmittedInjuryPeriodPay,validateSnapshotAdmittedInjuryPayroll} from './admittedInjuryPayroll.js';
import {financialYearForLeague} from '../data/nflSalaryCap.js';

export const ADMITTED_POSTSEASON_CLOCK_VERSION='admitted-postseason-interval-v1';
const roundWeeks={wildcard:19,divisional:20,conference:21,'super-bowl':23};
const people=league=>[...(league.players||[]),...(league.retiredPlayers||[])];
const fields=['injury','developmentHealth','reinjuryRisk','elevationInjuryPay'];
const fail=message=>{throw Object.assign(new TypeError(`Invalid admitted postseason clock: ${message}`),{status:400,reasonCode:'ADMITTED_POSTSEASON_CLOCK_INVALID'});};
function appliedThrough(state){
 let through=18;
 const archive=state.gameArchiveEntries===undefined?[]:state.gameArchiveEntries;
 if(!Array.isArray(archive))fail('archive');
 for(const game of archive){
  if(!game||!Object.hasOwn(roundWeeks,game.round))fail('archive round');
  const week=roundWeeks[game.round];if(!Number.isSafeInteger(week))fail('archive round');through=Math.max(through,week);
 }
 return through;
}
export function validateAdmittedPostseasonClock(state,{league,completed=false}={}){
 if(!state||!Object.hasOwn(state,'admittedMedicalClock'))return;
 const row=state.admittedMedicalClock;
 if(!row||Array.isArray(row)||Object.keys(row).length!==3||row.version!==ADMITTED_POSTSEASON_CLOCK_VERSION
  ||!Number.isSafeInteger(row.year)||row.year<2023||row.year>2200||row.year!==(completed?state.medicalRecovery?.year:state.year)
  ||row.throughWeek!==(completed?23:appliedThrough(state)))fail('elapsed authority');
 if(league?.admittedInjuryPayroll?.some(pay=>pay.earningYear===row.year&&pay.phase==='postseason'&&pay.week>row.throughWeek))fail('wage beyond elapsed authority');
}

// Admitted incapacity survives employment and a club's elimination. Its old
// source is not healed a second time by the current roster's club clock.
export function admittedPostseasonPlayerIds(league,year){
 const byId=new Map(people(league).map(player=>[player.id,player])),ids=new Set();
 for(const right of league.admittedInjuryContinuations||[]){
  const player=byId.get(right.playerId),episode=player?.elevationInjuryPay?.episodes.find(row=>row.gameId===right.gameId);
  if(right.injuryYear<year&&episode?.status==='active'&&player.injury?.weeksRemaining>0)ids.add(player.id);
 }
 return ids;
}

// The first applied game in a round consumes its new league interval; later
// games at that medical week are inert. Missing legacy clocks start at actual
// archived play, never at an invented earlier calendar. These remain modeled
// medical weeks, not a clinical prognosis or a new Salary/Benefits ruling.
export function advanceAdmittedPostseasonRecovery({state,league,year,throughWeek,getTeamModifiers,onRecovered}){
 validateSnapshotAdmittedInjuryPayroll(league);validateAdmittedPostseasonClock(state,{league});
 if(state?.year!==year||year!==league.year||year!==financialYearForLeague(league)
  ||!Number.isSafeInteger(year)||year<2023||year>2200||![19,20,21,23].includes(throughWeek))fail('open season/period');
 const prior=state.admittedMedicalClock?.throughWeek??appliedThrough(state);
 if(league.admittedInjuryPayroll?.some(pay=>pay.earningYear===year&&pay.phase==='postseason'&&pay.week>prior))fail('wage without elapsed authority');
 if(throughWeek<=prior)return {alreadyApplied:true,weeksAdvanced:0,receipts:[]};
 const planned=structuredClone(league),receipts=[];
 const modifiers=getTeamModifiers||(teamId=>teamRecoveryModifiers(planned.teams.find(team=>team.id===teamId)));
 for(let week=prior+1;week<=throughWeek;week++){
  const ids=admittedPostseasonPlayerIds(planned,year);
  recordAdmittedInjuryPeriodPay(planned,{earningYear:year,phase:'postseason',week});
  const recovery=advanceInjuryRecovery({...planned,players:people(planned).filter(player=>ids.has(player.id))},{getTeamModifiers:modifiers});
  receipts.push(...recovery.receipts.map(receipt=>({...receipt,year,week})));
 }
 const byId=new Map(people(planned).map(player=>[player.id,player]));
 for(const player of people(league))for(const field of fields){
  const next=byId.get(player.id);if(Object.hasOwn(next,field))player[field]=next[field];else delete player[field];
 }
 league.capLedger=planned.capLedger;
 if(planned.admittedInjuryPayroll!==undefined)league.admittedInjuryPayroll=planned.admittedInjuryPayroll;
 state.admittedMedicalClock={version:ADMITTED_POSTSEASON_CLOCK_VERSION,year,throughWeek};
 for(const receipt of receipts)onRecovered?.(receipt,people(league).find(player=>player.id===receipt.playerId));
 return {alreadyApplied:false,weeksAdvanced:throughWeek-prior,receipts};
}
