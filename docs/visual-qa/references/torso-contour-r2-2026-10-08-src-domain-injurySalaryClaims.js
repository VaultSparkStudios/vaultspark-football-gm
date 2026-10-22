// CBA Art13 §5(e): filed salary claims carry a 40% provisional attribution;
// a later-year award adjusts that original attribution in its payment year.
// This authority records a claim, not a guaranteed entitlement or a new contract.
import {canonicalFootballGame} from './footballGameReference.js';
import {validatePlayerElevationInjuryPay} from './elevationInjuryPay.js';
export const INJURY_SALARY_CLAIM_VERSION='elevation-injury-salary-claim-v1';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const cents=x=>Number.isSafeInteger(x)&&x>=0;
const year=x=>Number.isSafeInteger(x)&&x>=2022&&x<=2200;
const fail=message=>{throw Object.assign(new TypeError(`Invalid injury salary claim: ${message}`),{status:400,reasonCode:'INJURY_SALARY_CLAIM_INVALID'});};
const identity=(playerId,gameId)=>JSON.stringify([playerId,gameId]);
const reserve=amount=>Number((BigInt(amount)*2n+2n)/5n);
const claimKeys=['version','claimId','playerId','gameId','teamId','injuryYear','filedYear','claimedCents','reservedCents','status'];
const resolutionKeys=['year','paidCents','regularGameEquivalents','clubAccepted','playerAccepted','statutoryRightsPreserved','pensionTreatment'];
const chargeKeys=['version','claimId','kind','year','amountCents'];

export function retainedInjurySalaryClaimCap(ledger={}){
 const rows=ledger.injurySalaryClaimCharges;if(rows===undefined)return 0;
 if(!Array.isArray(rows))fail('cap receipts');
 let total=0n;const seen=new Set();
 for(const row of rows){
  const key=JSON.stringify([row.claimId,row.kind]);
  if(!exact(row,chargeKeys)||row.version!==INJURY_SALARY_CLAIM_VERSION||typeof row.claimId!=='string'||!row.claimId
    ||!['filed','settled'].includes(row.kind)||!year(row.year)||!Number.isSafeInteger(row.amountCents)
    ||row.kind==='filed'&&row.amountCents<0||seen.has(key))fail('cap receipt');
  seen.add(key);total+=BigInt(row.amountCents);
 }
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER))fail('cap total');
 // A lower later award legitimately credits prior provisional attribution.
 return Number(total)/100;
}

export function validateSnapshotInjurySalaryClaims(snapshot){
 const league=snapshot.league||snapshot,claims=league.injurySalaryClaims===undefined?[]:league.injurySalaryClaims;
 if(!Array.isArray(claims))fail('claims');
 const players=[...(league.players||[]),...(league.retiredPlayers||[])],teams=new Set((league.teams||[]).map(t=>t.id));
 const current=league.financialYear??league.year,seen=new Set(),expected=new Map();
 for(const claim of claims){
  const settled=claim.status==='settled';
  if(!exact(claim,settled?[...claimKeys,'resolution']:claimKeys)||claim.version!==INJURY_SALARY_CLAIM_VERSION
    ||!['filed','settled'].includes(claim.status)||!teams.has(claim.teamId)||!year(claim.injuryYear)||!year(claim.filedYear)
    ||claim.filedYear<claim.injuryYear||claim.filedYear>current||!cents(claim.claimedCents)||claim.claimedCents===0
    ||claim.reservedCents!==reserve(claim.claimedCents)||claim.claimId!==identity(claim.playerId,claim.gameId)||seen.has(claim.claimId))fail('claim');
  const player=players.find(p=>p.id===claim.playerId);
  const episode=player?.elevationInjuryPay?.episodes.find(row=>row.gameId===claim.gameId);
  const elevation=player?.standardElevations?.games?.find(row=>row.game?.gameId===claim.gameId);
  if(!episode||!elevation||elevation.status!=='reverted'||episode.teamId!==claim.teamId||episode.year!==claim.injuryYear
    ||elevation.teamId!==claim.teamId||elevation.game.year!==claim.injuryYear)fail('injury source');
  try{
   validatePlayerElevationInjuryPay(player);
   const game=canonicalFootballGame(elevation.game);
   if(game.gameId!==claim.gameId||!teams.has(game.homeTeamId)||!teams.has(game.awayTeamId)
     ||![game.homeTeamId,game.awayTeamId].includes(claim.teamId))fail('canonical injury source');
  }catch{fail('canonical injury source');}
  seen.add(claim.claimId);
  expected.set(`${claim.claimId}:filed`,{teamId:claim.teamId,year:claim.filedYear,amountCents:claim.reservedCents});
  if(settled){
   const row=claim.resolution;
   if(!exact(row,resolutionKeys)||!year(row.year)||row.year<claim.filedYear||row.year>current||!cents(row.paidCents)
     ||!Number.isSafeInteger(row.regularGameEquivalents)||row.regularGameEquivalents<0||row.regularGameEquivalents>18
     ||row.clubAccepted!==true||row.playerAccepted!==true||row.statutoryRightsPreserved!==true
     ||row.pensionTreatment!=='separate-review-required')fail('settlement');
   expected.set(`${claim.claimId}:settled`,{teamId:claim.teamId,year:row.year,amountCents:row.paidCents-claim.reservedCents});
  }
 }
 const found=new Set();
 for(const [teamId,ledger]of Object.entries(league.capLedger||{})){
  retainedInjurySalaryClaimCap(ledger);
  for(const row of ledger.injurySalaryClaimCharges||[]){
   const key=`${row.claimId}:${row.kind}`,source=expected.get(key);
   if(!source||source.teamId!==teamId||source.year!==row.year||source.amountCents!==row.amountCents
     ||row.year!==current||ledger.rolloverAppliedThroughYear>=row.year||found.has(key))fail('unmatched cap receipt');
   found.add(key);
  }
 }
 for(const [key,source]of expected)if(source.year===current&&!(league.capLedger?.[source.teamId]?.rolloverAppliedThroughYear>=current)&&!found.has(key))fail('missing cap receipt');
}

function openYear(league){
 const value=league.financialYear??league.year;
 if(!year(value))fail('financial year');return value;
}
function charge(league,claim,kind,amountCents){
 const current=openYear(league);
 if(league.capLedger?.[claim.teamId]?.rolloverAppliedThroughYear>=current)fail('financial year closed');
 league.capLedger||={};const ledger=league.capLedger[claim.teamId]||={};
 ledger.injurySalaryClaimCharges||=[];
 ledger.injurySalaryClaimCharges.push({version:INJURY_SALARY_CLAIM_VERSION,claimId:claim.claimId,kind,year:current,amountCents});
}
function commit(league,planned){
 validateSnapshotInjurySalaryClaims(planned);
 league.injurySalaryClaims=planned.injurySalaryClaims;league.capLedger=planned.capLedger;
}

export function fileElevationInjurySalaryClaim(league,{playerId,gameId,claimedCents}={}){
 validateSnapshotInjurySalaryClaims(league);
 if(!cents(claimedCents)||claimedCents===0)fail('claim amount');
 const claimId=identity(playerId,gameId),existing=league.injurySalaryClaims?.find(row=>row.claimId===claimId);
 if(existing){if(existing.claimedCents!==claimedCents)fail('conflicting claim retry');return {alreadyFiled:true,claim:structuredClone(existing)};}
 if(league.admittedInjuryContinuations?.some(right=>right.playerId===playerId&&right.gameId===gameId))fail('admitted continuation has separate authority');
 const player=league.players?.find(p=>p.id===playerId),episode=player?.elevationInjuryPay?.episodes.find(row=>row.gameId===gameId);
 if(!episode||episode.status!=='active'||!(player.injury?.weeksRemaining>0))fail('unresolved qualifying injury required');
 const claim={version:INJURY_SALARY_CLAIM_VERSION,claimId,playerId,gameId,teamId:episode.teamId,injuryYear:episode.year,
  filedYear:openYear(league),claimedCents,reservedCents:reserve(claimedCents),status:'filed'};
 const planned=structuredClone(league);planned.injurySalaryClaims||=[];planned.injurySalaryClaims.push(claim);
 charge(planned,claim,'filed',claim.reservedCents);commit(league,planned);
 return {alreadyFiled:false,claim:structuredClone(claim)};
}

export function settleElevationInjurySalaryClaim(league,{claimId,paidCents,regularGameEquivalents=0,clubAccepted=false,playerAccepted=false,statutoryRightsPreserved=false}={}){
 validateSnapshotInjurySalaryClaims(league);
 const existing=league.injurySalaryClaims?.find(row=>row.claimId===claimId);
 if(!existing)fail('unknown claim');
 const resolution={year:openYear(league),paidCents,regularGameEquivalents,clubAccepted,playerAccepted,statutoryRightsPreserved,pensionTreatment:'separate-review-required'};
 if(existing.status==='settled'){
  // A repeat in a later year is also inert; its original payment date remains.
  if(Object.keys(resolution).some(key=>key!=='year'&&resolution[key]!==existing.resolution[key]))fail('conflicting settlement retry');
  return {alreadySettled:true,claim:structuredClone(existing)};
 }
 const planned=structuredClone(league),claim=planned.injurySalaryClaims.find(row=>row.claimId===claimId);
 claim.status='settled';claim.resolution=resolution;
 charge(planned,claim,'settled',paidCents-claim.reservedCents);commit(league,planned);
 // No medical healing, retirement credit, release or contract mutation here.
 return {alreadySettled:false,claim:structuredClone(claim)};
}
