import {advanceInjuryRecovery,teamRecoveryModifiers} from '../engine/injurySystem.js';
import {validateSnapshotPracticeContracts} from './practiceContracts.js';
import {resolvePracticeContractTerm} from './practiceContractTerm.js';
import {preservePostTermElevationInjuryClaim} from './annualElevationInjuryResolution.js';
import {retainAdmittedInjuryContinuation,validateSnapshotAdmittedInjuryContinuations} from './admittedInjuryContinuation.js';
import {recordAdmittedInjuryPeriodPay,validateSnapshotAdmittedInjuryPayroll} from './admittedInjuryPayroll.js';
import {validateSnapshotElevationInjuryPay,recordElevationInjuryWeekPay,assertElevationInjuryContractTransition,assertAnnualElevationInjuryContractTransition,elevationInjuryReleaseRefusal,
 PRE_ROLLOVER_MEDICAL_VERSION,PRE_ROLLOVER_MEDICAL_END_WEEK,validatePreRolloverMedicalCalendar,completedMedicalCalendarFinal} from './elevationInjuryPay.js';

export {PRE_ROLLOVER_MEDICAL_VERSION,PRE_ROLLOVER_MEDICAL_END_WEEK};
// A declared weekly simulation approximation of the final-to-league-year
// interval. It is calendar recovery, never football participation or service.
const fields=['injury','developmentHealth','reinjuryRisk','elevationInjuryPay'];
const people=league=>[...(league.players||[]),...(league.retiredPlayers||[])];
const fail=()=>{throw Object.assign(new TypeError('Invalid pre-rollover medical calendar'),{status:400,reasonCode:'PRE_ROLLOVER_MEDICAL_INVALID'});};

export function advancePreRolloverMedicalCalendar(league,{completedYear,getTeamModifiers,preservePostTermClaims=false,preserveAdmittedRights=false,annualTransition=false}={}){
 if(typeof annualTransition!=='boolean'||annualTransition&&!preserveAdmittedRights||typeof preservePostTermClaims!=='boolean'||typeof preserveAdmittedRights!=='boolean'||preservePostTermClaims&&preserveAdmittedRights)fail();
 if(!Number.isSafeInteger(completedYear)||completedYear<1900||completedYear>2200)fail();
 validatePreRolloverMedicalCalendar(league);
 validateSnapshotPracticeContracts({league});validateSnapshotElevationInjuryPay({league});
 validateSnapshotAdmittedInjuryContinuations({league});
 validateSnapshotAdmittedInjuryPayroll(league);
 // Legacy/unplayed headless offseasons retain their existing behavior. A
 // modern calendar interval needs an actual canonical completed final, not
 // merely a caller-supplied year or a pipeline label.
 const finalGameId=completedMedicalCalendarFinal(league,completedYear);
 if(completedYear<2022||completedYear!==league.year||!finalGameId)return {notApplicable:true,weeksAdvanced:0,recovered:0};
 // Legacy applied boundaries cannot acquire a retrospective summer anchor.
 // Refuse before recovery could erase an unresolved source or payroll could
 // commit into a source financial year whose cap boundary is already closed.
 if(annualTransition&&(league.financialYear??league.year)===completedYear
   &&league.teams.some(team=>league.capLedger?.[team.id]?.rolloverAppliedThroughYear>=completedYear)){
  const unresolved=people(league).find(elevationInjuryReleaseRefusal);
  if(unresolved)throw Object.assign(new Error('An unresolved elevation injury requires a proved annual medical and payroll boundary.'),{status:409,reasonCode:'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED',playerId:unresolved.id});
 }
 if(league.preRolloverMedicalCalendar?.some(row=>row.year===completedYear)){
  if(annualTransition)assertAnnualElevationInjuryContractTransition(league);
  else assertElevationInjuryContractTransition(league,{allowAdmittedSourceYear:preserveAdmittedRights,allowAdmittedEarningCalendar:preserveAdmittedRights});
  return {alreadyRun:true,weeksAdvanced:0,recovered:0};
 }
 // Payroll/recovery and the remaining-rights guard are planned on a clone.
 // Admitted mode preserves compensation authority without electing a
 // dispute. An already elected claim retains its separate authority.
 // Unsupported transitions refuse without consuming any state.
 const planned=structuredClone(league);
 planned.preRolloverMedicalCalendar||=[];
 planned.preRolloverMedicalCalendar.push({version:PRE_ROLLOVER_MEDICAL_VERSION,year:completedYear,throughWeek:PRE_ROLLOVER_MEDICAL_END_WEEK,finalGameId});
 let recovered=0;
 const teams=new Map(planned.teams.map(team=>[team.id,team]));
 const modifiers=getTeamModifiers||((id)=>teamRecoveryModifiers(teams.get(id)));
 const terms=new Map();
 if(preservePostTermClaims||preserveAdmittedRights)for(const player of planned.players){
  const episode=player.elevationInjuryPay?.episodes.find(row=>row.status==='active');
  if(!episode||!(player.injury?.weeksRemaining>0))continue;
  // An existing admission is not a newly elected grievance. Its original
  // authority already proves the old term and survives this year's boundary.
  if(episode.year<completedYear&&planned.admittedInjuryContinuations?.some(right=>right.playerId===player.id&&right.gameId===episode.gameId))continue;
  const term=resolvePracticeContractTerm(planned,{teamId:episode.teamId,year:episode.year});
  if(!term.ok)throw Object.assign(new Error(term.error),{status:409,reasonCode:'ELEVATION_INJURY_TERM_REQUIRED',playerId:player.id});
  terms.set(player.id,term);
 }
 for(let week=24;week<=PRE_ROLLOVER_MEDICAL_END_WEEK;week++){
  if(preservePostTermClaims||preserveAdmittedRights)for(const player of planned.players){
   const episode=player.elevationInjuryPay?.episodes.find(row=>row.status==='active');
   const term=terms.get(player.id);
   if(episode&&term&&week>term.endsAfterMedicalWeek&&player.injury?.weeksRemaining>0){
    if(preserveAdmittedRights&&!planned.injurySalaryClaims?.some(claim=>claim.playerId===player.id&&claim.gameId===episode.gameId))retainAdmittedInjuryContinuation(planned,{playerId:player.id,gameId:episode.gameId});
    else preservePostTermElevationInjuryClaim(planned,{player,episode,term,getTeamModifiers:modifiers});
   }
  }
  recordElevationInjuryWeekPay(planned,{year:completedYear,week,practicePayMode:'recorded'});
  if(completedYear>=2023)recordAdmittedInjuryPeriodPay(planned,{earningYear:completedYear,phase:'pre-rollover',week});
  recovered+=advanceInjuryRecovery({...planned,players:people(planned)},{getTeamModifiers:modifiers}).recovered;
 }
 if(annualTransition)assertAnnualElevationInjuryContractTransition(planned);
 else assertElevationInjuryContractTransition(planned,{allowAdmittedSourceYear:preserveAdmittedRights,allowAdmittedEarningCalendar:preserveAdmittedRights});
 validateSnapshotAdmittedInjuryPayroll(planned);
 validateSnapshotPracticeContracts({league:planned});validateSnapshotElevationInjuryPay({league:planned});
 const plannedPlayers=new Map(people(planned).map(player=>[player.id,player]));
 for(const player of people(league)){
  const next=plannedPlayers.get(player.id);
  for(const field of fields){if(Object.hasOwn(next,field))player[field]=next[field];else delete player[field];}
 }
 league.preRolloverMedicalCalendar=planned.preRolloverMedicalCalendar;
 league.capLedger=planned.capLedger;
 if(planned.injurySalaryClaims!==undefined)league.injurySalaryClaims=planned.injurySalaryClaims;
 if(planned.annualElevationInjuryResolutions!==undefined)league.annualElevationInjuryResolutions=planned.annualElevationInjuryResolutions;
 if(planned.admittedInjuryContinuations!==undefined)league.admittedInjuryContinuations=planned.admittedInjuryContinuations;
 if(planned.admittedInjuryPayroll!==undefined)league.admittedInjuryPayroll=planned.admittedInjuryPayroll;
 return {alreadyRun:false,weeksAdvanced:4,recovered};
}
