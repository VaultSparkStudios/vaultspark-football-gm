import {recordElevationInjuryWeekPay,validateSnapshotElevationInjuryPay,INJURY_CAP_TREATMENT_VERSION} from './elevationInjuryPay.js';
import {validateSnapshotStandardElevations} from './standardElevations.js';
const fail=message=>{throw Object.assign(new TypeError(`Invalid regular injury accrual: ${message}`),{status:400,reasonCode:'REGULAR_INJURY_ACCRUAL_INVALID'});};
const rowKey=row=>JSON.stringify([row.year,row.week,row.playerId]);
const same=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);

// Capture eligibility before the elapsed weekly recovery step. The working
// copy owns all payroll/contract/cap mutations; no wages are committed here.
export function previewRegularInjuryAccrual(league,{year,week}={}){
 const planned={...league,capLedger:structuredClone(league.capLedger),players:league.players.map(player=>({...player,
  contract:player.contract?structuredClone(player.contract):player.contract,
  elevationInjuryPay:player.elevationInjuryPay?structuredClone(player.elevationInjuryPay):undefined}))};
 return recordElevationInjuryWeekPay(planned,{year,week});
}

function paidPracticeBase(player,{teamId,year,week}){
 const receipts=[player.contract,...(player.practiceContractHistory||[])].filter(contract=>contract?.kind==='weekly-practice-contract-v1'&&contract.year===year)
  .map(contract=>contract.payLedger?.[`${year}:${week}`]).filter(row=>row?.teamId===teamId);
 // Activation/release may retain the same original ledger in history. It is
 // one paycheck, not one additional paycheck per retained contract copy.
 if(receipts.some(row=>row.amount!==receipts[0].amount))fail('conflicting paid practice base');
 return (receipts[0]?.amount||0)*100;
}

// Actual base payroll runs first. Reconcile the old payer even if clearance
// allowed a roster/contract change during the week's maintenance. A same-club
// settled elevation already covering the weekly minimum needs no second top-up.
export function commitRegularInjuryAccrual(league,{year,week,receipts}={}){
 if(!Array.isArray(receipts)||!Number.isSafeInteger(year)||!Number.isSafeInteger(week)||week<1||week>18)fail('period');
 validateSnapshotElevationInjuryPay(league);validateSnapshotStandardElevations({league});
 const planned={...league,capLedger:structuredClone(league.capLedger),players:league.players.map(player=>({...player,
  elevationInjuryPay:player.elevationInjuryPay?structuredClone(player.elevationInjuryPay):undefined}))};
 const seen=new Set(),changes=[];let coveredByElevation=0;
 for(const receipt of receipts){
  if(!receipt||typeof receipt!=='object')fail('receipt');
  const {playerId,...captured}=receipt,key=rowKey(receipt);
  const player=planned.players.find(p=>p.id===playerId),episode=player?.elevationInjuryPay?.episodes.find(e=>e.gameId===captured.gameId);
  if(!episode||!['active','recovered','active-contract'].includes(episode.status)||captured.year!==year||captured.week!==week
   ||captured.teamId!==episode.teamId||captured.capTreatmentVersion!==INJURY_CAP_TREATMENT_VERSION||seen.has(key))fail('source');
  seen.add(key);
  // Validate the captured row itself before using only its gross entitlement.
  // A fresh private copy supplies its matching cap receipt to the validator.
  const validationPlayer={...player,elevationInjuryPay:structuredClone(player.elevationInjuryPay)};
  const validationLeague={...planned,players:planned.players.map(p=>p.id===playerId?validationPlayer:p),capLedger:structuredClone(planned.capLedger)};
  validationPlayer.elevationInjuryPay.payroll=validationPlayer.elevationInjuryPay.payroll.filter(r=>r.year!==year||r.week!==week);
  validationPlayer.elevationInjuryPay.payroll.push(captured);
  const validationLedger=validationLeague.capLedger[captured.teamId];
  validationLedger.elevationInjuryCharges=(validationLedger.elevationInjuryCharges||[]).filter(r=>r.playerId!==playerId||r.year!==year||r.week!==week);
  validationLedger.elevationInjuryCharges.push({gameId:captured.gameId,playerId,year,week,amountCents:captured.capChargeCents});
  validateSnapshotElevationInjuryPay(validationLeague);
  const elevated=player.standardElevations?.games.find(g=>g.status==='reverted'&&g.teamId===captured.teamId
   &&g.game.year===year&&g.game.week===week&&g.game.seasonType==='regular');
  if(elevated&&elevated.payCents>=captured.payCents){coveredByElevation++;continue;}
  const practiceCents=paidPracticeBase(player,{teamId:captured.teamId,year,week});
  const additionalCents=Math.max(0,captured.payCents-practiceCents);
  const row={...captured,practiceCents,additionalCents,capChargeCents:additionalCents};
  const existing=player.elevationInjuryPay.payroll.find(r=>r.year===year&&r.week===week);
  if(existing){if(!same(existing,row))fail('conflicting earned receipt');continue;}
  if(year!==(league.financialYear??league.year)||league.capLedger?.[row.teamId]?.rolloverAppliedThroughYear>=year)fail('financial year closed');
  player.elevationInjuryPay.payroll.push(row);
  const ledger=planned.capLedger[row.teamId];ledger.elevationInjuryCharges||=[];
  ledger.elevationInjuryCharges.push({gameId:row.gameId,playerId,year,week,amountCents:row.capChargeCents});
  changes.push({playerId,row});
 }
 validateSnapshotElevationInjuryPay(planned);
 for(const {playerId,row} of changes)league.players.find(p=>p.id===playerId).elevationInjuryPay.payroll.push({...row});
 if(changes.length)league.capLedger=planned.capLedger;
 return {applied:changes.length,coveredByElevation};
}
