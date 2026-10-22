import {advanceInjuryRecovery,teamRecoveryModifiers} from '../engine/injurySystem.js';
import {financialYearForLeague} from '../data/nflSalaryCap.js';
import {validatePreRolloverMedicalCalendar} from './elevationInjuryPay.js';
import {recordAdmittedInjuryPeriodPay,validateSnapshotAdmittedInjuryPayroll} from './admittedInjuryPayroll.js';

export const OFFSEASON_MEDICAL_VERSION='offseason-medical-interval-v1';
// Explicit weekly simulation approximation, not official event dates or
// clinical prognosis: March market -> spring draft -> summer/camp -> Week1.
export const OFFSEASON_MEDICAL_STAGE_WEEK=Object.freeze({retirements:0,'coaching-carousel':0,combine:0,'pro-days':0,'free-agency':6,draft:7,udfa:8,'camp-cuts':25});
const fields=['injury','developmentHealth','reinjuryRisk','elevationInjuryPay'];
const keys=['version','sourceYear','earningYear','finalGameId','throughWeek'];
const exact=(row)=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===keys.length&&keys.every(key=>Object.hasOwn(row,key));
const fail=message=>{throw Object.assign(new TypeError(`Invalid offseason medical calendar: ${message}`),{status:400,reasonCode:'OFFSEASON_MEDICAL_CALENDAR_INVALID'});};
const people=league=>[...(league.players||[]),...(league.retiredPlayers||[])];
export function validateSnapshotOffseasonMedicalCalendar(snapshot){
 const league=snapshot.league||snapshot;
 const rows=league.offseasonMedicalCalendar;if(rows===undefined)return;
 validatePreRolloverMedicalCalendar(league);validateSnapshotAdmittedInjuryPayroll(league);
 if(!Array.isArray(rows))fail('receipts');
 const seen=new Set(),current=financialYearForLeague(league);
 for(const row of rows){
  const anchor=league.preRolloverMedicalCalendar?.find(period=>period.year===row.sourceYear);
  if(!exact(row)||row.version!==OFFSEASON_MEDICAL_VERSION||!Number.isSafeInteger(row.sourceYear)||row.sourceYear<2022||row.sourceYear>=2200
   ||row.earningYear!==row.sourceYear+1||row.sourceYear>league.year||row.earningYear>current||!anchor||row.finalGameId!==anchor.finalGameId
   ||!Number.isSafeInteger(row.throughWeek)||![0,6,7,8,25].includes(row.throughWeek)||seen.has(row.earningYear)
   ||row.earningYear<=league.year&&row.throughWeek!==25)fail('interval authority');
  if(league.admittedInjuryPayroll?.some(pay=>pay.earningYear===row.earningYear&&pay.phase==='offseason'&&pay.week>row.throughWeek))fail('wage outside elapsed interval');
  seen.add(row.earningYear);
 }
}

// Called only on a newly applied roster rollover. Legacy resumed rollovers
// do not call this: never invent historical healing or retrospective wages.
export function startOffseasonMedicalCalendar(league,{completedYear}={}){
 validateSnapshotOffseasonMedicalCalendar(league);
 if(!Number.isSafeInteger(completedYear)||completedYear<1900||completedYear>2200||league.year!==completedYear)fail('source year');
 if(completedYear<2022||completedYear===2200)return {notApplicable:true,throughWeek:0};
 validatePreRolloverMedicalCalendar(league);validateSnapshotAdmittedInjuryPayroll(league);
 const prior=league.offseasonMedicalCalendar?.find(row=>row.sourceYear===completedYear);
 if(prior)return {alreadyRun:true,throughWeek:prior.throughWeek};
 const anchor=league.preRolloverMedicalCalendar?.find(row=>row.year===completedYear);
 if(!anchor)return {notApplicable:true,throughWeek:0};
 const earningYear=completedYear+1;
 if(financialYearForLeague(league)!==earningYear||league.teams.some(team=>league.capLedger?.[team.id]?.rolloverAppliedThroughYear!==completedYear))fail('new financial boundary');
 if(league.admittedInjuryPayroll?.some(row=>row.earningYear===earningYear&&row.phase==='offseason'))fail('already earned without calendar');
 league.offseasonMedicalCalendar||=[];
 league.offseasonMedicalCalendar.push({version:OFFSEASON_MEDICAL_VERSION,sourceYear:completedYear,earningYear,finalGameId:anchor.finalGameId,throughWeek:0});
 return {alreadyRun:false,throughWeek:0};
}

export function advanceOffseasonMedicalCalendar(league,{completedYear,stage,getTeamModifiers}={}){
 validateSnapshotOffseasonMedicalCalendar(league);
 if(!Number.isSafeInteger(completedYear)||completedYear<1900||completedYear>2200||!Object.hasOwn(OFFSEASON_MEDICAL_STAGE_WEEK,stage))fail('stage/year');
 const authority=league.offseasonMedicalCalendar?.find(row=>row.sourceYear===completedYear);
 if(!authority)return {notApplicable:true,weeksAdvanced:0,recovered:0};
 const throughWeek=OFFSEASON_MEDICAL_STAGE_WEEK[stage];
 if(throughWeek<=authority.throughWeek)return {alreadyRun:true,weeksAdvanced:0,recovered:0};
 if(league.year!==completedYear||financialYearForLeague(league)!==authority.earningYear)fail('closed interval');
 const planned=structuredClone(league),teams=new Map(planned.teams.map(team=>[team.id,team]));
 const modifiers=getTeamModifiers||((id)=>teamRecoveryModifiers(teams.get(id)));
 let recovered=0;
 for(let week=authority.throughWeek+1;week<=throughWeek;week++){
  // Capture incapacity before recovery, including people no longer employed.
  recordAdmittedInjuryPeriodPay(planned,{earningYear:authority.earningYear,phase:'offseason',week});
  recovered+=advanceInjuryRecovery({...planned,players:people(planned)},{getTeamModifiers:modifiers}).recovered;
 }
 planned.offseasonMedicalCalendar.find(row=>row.sourceYear===completedYear).throughWeek=throughWeek;
 validateSnapshotOffseasonMedicalCalendar(planned);
 const byId=new Map(people(planned).map(player=>[player.id,player]));
 for(const player of people(league))for(const field of fields){
  const next=byId.get(player.id);
  if(Object.hasOwn(next,field))player[field]=next[field];else delete player[field];
 }
 league.offseasonMedicalCalendar=planned.offseasonMedicalCalendar;
 league.capLedger=planned.capLedger;
 if(planned.admittedInjuryPayroll!==undefined)league.admittedInjuryPayroll=planned.admittedInjuryPayroll;
 return {alreadyRun:false,weeksAdvanced:throughWeek-authority.throughWeek,recovered};
}
