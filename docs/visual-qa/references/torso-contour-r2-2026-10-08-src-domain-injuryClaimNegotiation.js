import {validateSnapshotInjurySalaryClaims,settleElevationInjurySalaryClaim} from './injurySalaryClaims.js';
import {validateSnapshotAnnualElevationInjuryResolutions} from './annualElevationInjuryResolution.js';

// Declared bargaining design, not an NFL prevalence estimate or legal award.
// Reservation varies per claim, never with race, nationality or athletic skill.
export const INJURY_CLAIM_BARGAINING_VERSION='fictional-claim-bargaining-v1';
const fail=(reasonCode,error,status=409)=>({ok:false,status,reasonCode,error});
function reservation(claim){
 let hash=2166136261;
 for(const c of claim.claimId)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const percent=80+hash%21;
 return Number((BigInt(claim.claimedCents)*BigInt(percent)+99n)/100n);
}

export function previewInjuryClaimNegotiation(league,{teamId,claimId}={}){
 validateSnapshotInjurySalaryClaims(league);validateSnapshotAnnualElevationInjuryResolutions(league);
 const claim=league.injurySalaryClaims?.find(c=>c.claimId===claimId);
 if(!claim)return fail('INJURY_CLAIM_UNKNOWN','This salary claim does not exist.',404);
 if(teamId!==claim.teamId)return fail('INJURY_CLAIM_WRONG_CLUB','Only the original injury club can negotiate this claim.',403);
 const player=[...(league.players||[]),...(league.retiredPlayers||[])].find(p=>p.id===claim.playerId);
 const year=league.financialYear??league.year;
 const open=!(league.capLedger?.[teamId]?.rolloverAppliedThroughYear>=year);
 return {ok:true,version:INJURY_CLAIM_BARGAINING_VERSION,teamId,claimId,playerId:claim.playerId,playerName:player.name,
  injuryYear:claim.injuryYear,paymentYear:year,status:claim.status,claimedCents:claim.claimedCents,reservedCents:claim.reservedCents,
  requestedCents:claim.status==='settled'?claim.resolution.paidCents:reservation(claim),canOffer:open&&claim.status==='filed',
  unavailableReason:!open?'The completed financial year is closed. Review the claim when the next financial year opens.':claim.status==='settled'?'This claim is already settled.':null,
  agreementScope:'Salary claim only. Injury, employment, statutory rights and separate pension review remain unchanged.',
  bargainingBasis:'Simulation assumption: the player representative requests a stable 80–100% of the disputed claim. This is not a measured NFL settlement rate.'};
}

export function offerInjuryClaimSettlement(league,{teamId,claimId,paidCents,expectedPaymentYear}={}){
 const preview=previewInjuryClaimNegotiation(league,{teamId,claimId});if(!preview.ok)return preview;
 if(!Number.isSafeInteger(paidCents)||paidCents<0)return fail('INJURY_CLAIM_OFFER_INVALID','Offer must be a nonnegative whole-cent amount.',400);
 if(expectedPaymentYear!==preview.paymentYear)return fail('INJURY_CLAIM_YEAR_CHANGED','The payment year changed. Review the claim again.');
 if(preview.status==='settled'){
  if(paidCents!==preview.requestedCents)return fail('INJURY_CLAIM_ALREADY_SETTLED','This claim was settled for a different amount.');
  return {ok:true,alreadySettled:true,claim:structuredClone(league.injurySalaryClaims.find(c=>c.claimId===claimId))};
 }
 if(!preview.canOffer)return fail('INJURY_CLAIM_FINANCIAL_YEAR_CLOSED',preview.unavailableReason);
 if(paidCents<preview.requestedCents)return {ok:true,accepted:false,requestedCents:preview.requestedCents,
  reasonCode:'INJURY_CLAIM_COUNTEROFFER',message:'The player representative declined. The claim and franchise remain unchanged.'};
 const result=settleElevationInjurySalaryClaim(league,{claimId,paidCents,regularGameEquivalents:0,clubAccepted:true,playerAccepted:true,statutoryRightsPreserved:true});
 return {ok:true,accepted:true,...result,capAdjustmentCents:paidCents-preview.reservedCents};
}

export function settleCpuInjuryClaims(league,{controlledTeamId=null,excludeTeamIds=[]}={}){
 const planned=structuredClone(league),results=[];
 for(const claim of planned.injurySalaryClaims||[]){
  if(claim.status!=='filed'||claim.teamId===controlledTeamId||excludeTeamIds.includes(claim.teamId))continue;
  const preview=previewInjuryClaimNegotiation(planned,{teamId:claim.teamId,claimId:claim.claimId});
  if(!preview.canOffer)continue;
  const result=offerInjuryClaimSettlement(planned,{teamId:claim.teamId,claimId:claim.claimId,paidCents:preview.requestedCents,expectedPaymentYear:preview.paymentYear});
  if(!result.ok||!result.accepted)throw new Error('CPU claim negotiation failed');results.push(result);
 }
 if(results.length){league.injurySalaryClaims=planned.injurySalaryClaims;league.capLedger=planned.capLedger;}
 return {ok:true,settled:results.length,results};
}
