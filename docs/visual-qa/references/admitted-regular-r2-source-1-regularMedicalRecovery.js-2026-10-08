import {advanceInjuryRecovery} from '../engine/injurySystem.js';
import {recordAdmittedInjuryPeriodPay} from './admittedInjuryPayroll.js';
import {financialYearForLeague} from '../data/nflSalaryCap.js';

const fields=['injury','developmentHealth','reinjuryRisk','elevationInjuryPay'];
const people=league=>[...(league.players||[]),...(league.retiredPlayers||[])];

// The session's scheduled week is the elapsed interval authority. This helper
// does not advance the season or make an entire weekly command retryable.
// Stage both wages and medical changes privately so a late recovery failure
// cannot commit compensation without the corresponding medical interval.
export function previewRegularMedicalRecovery(league,{year,week,getTeamModifiers,deferAdmittedPay=false}={}){
 if(year!==league.year||year!==financialYearForLeague(league))
  throw Object.assign(new TypeError('Invalid regular medical recovery: year is not the open season'),{status:400,reasonCode:'REGULAR_MEDICAL_RECOVERY_INVALID'});
 const planned=structuredClone(league);
 // Still preflight the complete source/period batch when deferring wages to
 // the caller's post-base reconciliation. A throw must precede recovery.
 const payTarget=deferAdmittedPay?structuredClone(planned):planned;
 recordAdmittedInjuryPeriodPay(payTarget,{earningYear:year,phase:'regular-season',week});
 // A source incident in this or a later scheduled week cannot have elapsed
 // recovery before it occurs. Ordinary injuries and previous-year sources
 // remain eligible, including retired people.
 const eligible=people(planned).filter(player=>!player.elevationInjuryPay?.episodes.some(episode=>
  episode.status==='active'&&episode.year===year&&episode.week>=week));
 const recovery=advanceInjuryRecovery({...planned,players:eligible},{getTeamModifiers});
 return {planned,recovery};
}

export function applyRegularMedicalRecovery(league,options){
 const {planned,recovery}=previewRegularMedicalRecovery(league,options);
 const byId=new Map(people(planned).map(player=>[player.id,player]));
 for(const player of people(league))for(const field of fields){
  const next=byId.get(player.id);
  if(Object.hasOwn(next,field))player[field]=next[field];else delete player[field];
 }
 league.capLedger=planned.capLedger;
 if(planned.admittedInjuryPayroll!==undefined)league.admittedInjuryPayroll=planned.admittedInjuryPayroll;
 return recovery;
}
