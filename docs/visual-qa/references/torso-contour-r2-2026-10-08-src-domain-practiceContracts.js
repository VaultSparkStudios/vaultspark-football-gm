import { practiceSalaryForSeason } from '../data/nflPracticeSalary.js';
import { practiceEligibilityGroup } from './practiceSquadEligibility.js';
import { playerServiceCount } from './playerService.js';
import { minimumSalaryForSeason } from '../data/nflSalaryMinimum.js';
import { normalizeContract } from './contracts.js';
import { getSportRules } from '../sport/registry.js';
import { retainedPracticeCap, retainedRosterCompensationCap } from './earnedPracticeCap.js';
import { financialYearForLeague } from '../data/nflSalaryCap.js';
import { standardElevationRosterRefusal,recordPermanentElevationActivation } from './standardElevations.js';
import { recordElevationInjuryWeekPay,endElevationInjuryPay } from './elevationInjuryPay.js';
import { validateSnapshotInjurySalaryClaims } from './injurySalaryClaims.js';
import { validateSnapshotAnnualElevationInjuryResolutions } from './annualElevationInjuryResolution.js';

export const PRACTICE_CONTRACT_VERSION='weekly-practice-contract-v1';
export function validateSnapshotPracticeContracts(snapshot) {
  validateSnapshotInjurySalaryClaims(snapshot);
  validateSnapshotAnnualElevationInjuryResolutions(snapshot);
  for (const ledger of Object.values(snapshot.league?.capLedger || {})) {
    try { retainedPracticeCap(ledger); }
    catch(error) { error.reasonCode='PRACTICE_CONTRACT_INVALID'; throw error; }
  }
  for(const players of [snapshot.league?.players,snapshot.league?.retiredPlayers,snapshot.league?.pendingDraft?.available]) {
    if(!Array.isArray(players)) continue;
    for(const player of players) {
      try {
        if(player.contract?.kind?.startsWith?.('weekly-practice-contract-') || player.contract?.practiceEarnedCharge != null) normalizeContract(player.contract);
        if(player.practiceContractHistory!=null&&!Array.isArray(player.practiceContractHistory)) throw new TypeError('Invalid practice contract history');
        for(const contract of player.practiceContractHistory||[]) {
          if(!contract||contract.kind!==PRACTICE_CONTRACT_VERSION) throw new TypeError('Unsupported practice contract history');
          normalizeContract(contract);
        }
      } catch(error) {error.reasonCode='PRACTICE_CONTRACT_INVALID';throw error;}
    }
  }
}
export function buildPracticeContract(player,{year,weeklySalary=null,startWeek=1}={}) {
  if(!Number.isInteger(startWeek)||startWeek<1||startWeek>18) throw new TypeError('Practice signing requires a regular-season week');
  const group=practiceEligibilityGroup(player).group;
  const schedule=practiceSalaryForSeason(year,group);
  const amount=weeklySalary??schedule.minimum;
  if(!Number.isInteger(amount)||amount<schedule.minimum||amount>schedule.maximum) throw new RangeError('Practice weekly salary is outside its schedule');
  const regularWeeks=19-startWeek;
  return normalizeContract({kind:PRACTICE_CONTRACT_VERSION,year,eligibilityGroup:group,weeklySalary:amount,startWeek,regularWeeks,
    payProvenance:schedule.kind,serviceProvenance:practiceEligibilityGroup(player).provenance,
    yearsRemaining:1,salary:amount*regularWeeks,baseSalary:amount*regularWeeks,capHit:amount*regularWeeks,
    signingBonus:0,guaranteed:0,deadCapRemaining:0,payLedger:{}});
}

// All clubs, including scheduled byes, receive their regular-season week pay.
// Ledger keys survive retries/restores; legacy annual terms are never converted.
export function recordPracticeWeekPay(league,{year,week}) {
  if(!Number.isInteger(year)||!Number.isInteger(week)||week<1||week>18) throw new TypeError('Practice payroll requires a year and regular-season week');
  for(const player of league.players) if(player.contract?.kind===PRACTICE_CONTRACT_VERSION) normalizeContract(player.contract);
  const receipts=recordElevationInjuryWeekPay(league,{year,week}).map(row=>({kind:'elevation-injury-adjustment',amount:row.additionalCents/100,...row}));
  for(const player of league.players) {
    const contract=player.contract;
    if(player.status!=='active'||!(player.rosterSlot==='practice'||player.rosterSlot==='reserve'&&player.reserveStatus?.kind==='ps-injured')||contract?.kind!==PRACTICE_CONTRACT_VERSION
      ||contract.year!==year||week<contract.startWeek||!league.teams.some(team=>team.id===player.teamId)) continue;
    const key=`${year}:${week}`;
    if(contract.payLedger[key]) continue;
    const receipt={teamId:player.teamId,amount:contract.weeklySalary,year,week};
    contract.payLedger[key]=receipt;
    receipts.push({playerId:player.id,...receipt});
  }
  return receipts;
}

export function practicePaidSalary(contract) {
  return Object.values(contract.payLedger||{}).reduce((sum,row)=>sum+row.amount,0);
}

// CBA Article12 §2(a)(ix): postseason practice compensation is a Benefit,
// separate from regular-season Team Salary. Payroll weeks include the final's
// preparation week; they are not the UI's compressed round numbers.
export function recordPracticePostseasonPay(league,{year,week,teamIds}) {
  if(!Number.isInteger(year)||!Number.isInteger(week)||week<19||week>23
    ||!Array.isArray(teamIds)||teamIds.some(id=>!league.teams.some(team=>team.id===id))) throw new TypeError('Invalid postseason practice payroll week');
  for(const player of league.players) if(player.contract?.kind===PRACTICE_CONTRACT_VERSION) normalizeContract(player.contract);
  const eligible=new Set(teamIds),receipts=recordElevationInjuryWeekPay(league,{year,week,teamIds}).map(row=>({kind:'elevation-injury-adjustment',amount:row.additionalCents/100,...row}));
  for(const player of league.players) {
    const contract=player.contract;
    if(player.status!=='active'||!(player.rosterSlot==='practice'||player.rosterSlot==='reserve'&&player.reserveStatus?.kind==='ps-injured')||contract?.kind!==PRACTICE_CONTRACT_VERSION
      ||contract.year!==year||!eligible.has(player.teamId)) continue;
    const key=`${year}:postseason:${week}`;
    if(contract.postseasonPayLedger?.[key]) continue;
    const receipt={year,week,teamId:player.teamId,amount:contract.weeklySalary,
      kind:'practice-postseason-benefit-v1',capCharge:0};
    contract.postseasonPayLedger||={};
    contract.postseasonPayLedger[key]=receipt;
    receipts.push({playerId:player.id,...receipt});
  }
  return receipts;
}

// Permanent activation, distinct from a standard game-day elevation.
export function practiceActivationContract(player,{year}={}) {
  const previous=normalizeContract(player.contract);
  const baseSalary=minimumSalaryForSeason(year,playerServiceCount(player,'credited').seasons).salary;
  const earned=practicePaidSalary(previous);
  const contract=normalizeContract({salary:baseSalary,baseSalary,capHit:baseSalary+earned,yearsRemaining:1,
    signingBonus:0,guaranteed:0,deadCapRemaining:0,practiceEarnedCharge:earned});
  return {previous,contract,baseSalary,earned};
}

export function activatePracticePlayer(league,player,{year}={}) {
  const elevationRefusal=standardElevationRosterRefusal(player);if(elevationRefusal)return elevationRefusal;
  if(player.rosterSlot==='reserve') return {ok:false,reasonCode:'RESERVE_ACTIVATION_REQUIRED',error:'Use the reserve return process.'};
  if(player.contract?.kind!==PRACTICE_CONTRACT_VERSION) {player.rosterSlot='active';return {ok:true,legacyTermsPreserved:true};}
  year ??= financialYearForLeague(league);
  const {previous,contract,baseSalary,earned}=practiceActivationContract(player,{year});
  const ledger=league.capLedger?.[player.teamId]||{};
  const room=(league.teamCapOverride?.[player.teamId]||getSportRules(league.sportId).structure.salaryCap)
    +(ledger.rollover||0)-(ledger.deadCapCurrentYear||0)-retainedRosterCompensationCap(ledger)
    -league.players.filter(p=>p.teamId===player.teamId&&p.status==='active').reduce((sum,p)=>sum+normalizeContract(p.contract).capHit,0);
  if(contract.capHit-previous.capHit>room) return {ok:false,reasonCode:'PRACTICE_ACTIVATION_CAP',error:'Insufficient cap room for an active contract.'};
  player.practiceContractHistory||=[];
  player.practiceContractHistory.push(previous);
  player.contract=contract;
  player.rosterSlot='active';
  recordPermanentElevationActivation(player,{teamId:player.teamId,year});
  endElevationInjuryPay(player,{activeContract:true});
  return {ok:true,capDelta:contract.capHit-previous.capHit,baseSalary,practiceEarnedCharge:earned};
}
