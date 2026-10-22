import {regularElevationSalaryForSeason} from '../data/nflElevationSalary.js';
import {normalizeContract} from './contracts.js';
import {canonicalFootballGame} from './footballGameReference.js';
import {validateSnapshotAnnualElevationInjuryResolutions} from './annualElevationInjuryResolution.js';
import {validateSnapshotInjurySalaryClaims} from './injurySalaryClaims.js';
import {validateSnapshotAdmittedInjuryContinuations} from './admittedInjuryContinuation.js';
import {validateSnapshotAdmittedInjuryPayroll} from './admittedInjuryPayroll.js';
import {validateSnapshotOffseasonMedicalCalendar} from './offseasonMedicalCalendar.js';

export const ELEVATION_INJURY_PAY_VERSION='elevation-injury-pay-v1';
export const INJURY_CAP_TREATMENT_VERSION='injury-compensation-cap-v2';
const salaryPeriod=week=>week<=18||week>=24;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const exact=(value,keys)=>object(value)&&keys.length===Object.keys(value).length&&keys.every(key=>Object.hasOwn(value,key));
const fail=message=>{const error=new TypeError(`Invalid elevation injury pay: ${message}`);error.reasonCode='ELEVATION_INJURY_PAY_INVALID';error.status=400;throw error;};
const sourceWeek=game=>game.seasonType==='regular'?game.week:{wildcard:19,divisional:20,conference:21,'super-bowl':23}[game.round];
const key=row=>JSON.stringify([row.year,row.week,row.playerId]);

export const PRE_ROLLOVER_MEDICAL_VERSION='pre-rollover-medical-calendar-v1';
export const PRE_ROLLOVER_MEDICAL_END_WEEK=27;
export function completedMedicalCalendarFinal(league,year){
  const teams=new Set((league.teams||[]).map(team=>team.id));
  const candidates=[...(league.history||[]).filter(row=>row.year===year).map(row=>row.superBowl),
    ...(league.gameArchive||[]).filter(row=>row.year===year&&row.seasonType==='playoffs'&&row.label==='super-bowl')];
  for(const row of candidates){
    if(!row||!teams.has(row.homeTeamId)||!teams.has(row.awayTeamId)
      ||!integer(row.homeScore)||!integer(row.awayScore)||row.homeScore===row.awayScore)continue;
    try{
      const game=canonicalFootballGame({year,homeTeamId:row.homeTeamId,awayTeamId:row.awayTeamId,seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
      if(row.gameId===game.gameId)return game.gameId;
    }catch{/* A custom/tactical fixture cannot establish a season boundary. */}
  }
  return null;
}
export function validatePreRolloverMedicalCalendar(league){
  const rows=league.preRolloverMedicalCalendar;if(rows===undefined)return;
  if(!Array.isArray(rows))fail('pre-rollover calendar');
  const seen=new Set();
  for(const row of rows){
    if(!exact(row,['version','year','throughWeek','finalGameId'])||row.version!==PRE_ROLLOVER_MEDICAL_VERSION
      ||!Number.isSafeInteger(row.year)||row.year<2022||row.year>2200
      ||!Number.isSafeInteger(league.year)||row.year>league.year
      ||typeof row.finalGameId!=='string'||!row.finalGameId
      ||row.finalGameId!==completedMedicalCalendarFinal(league,row.year)
      ||row.throughWeek!==PRE_ROLLOVER_MEDICAL_END_WEEK||seen.has(row.year))fail('pre-rollover calendar receipt');
    seen.add(row.year);
  }
}

export function validatePlayerElevationInjuryPay(player){
  const state=player.elevationInjuryPay;if(state===undefined)return;
  if(!exact(state,['version','episodes','payroll'])||state.version!==ELEVATION_INJURY_PAY_VERSION||!Array.isArray(state.episodes)||!Array.isArray(state.payroll))fail('unsupported state');
  const episodes=new Map();
  for(const row of state.episodes){
    const elevation=player.standardElevations?.games?.find(game=>game.game.gameId===row.gameId);
    if(!exact(row,['gameId','teamId','year','week','origin','creditedSeasons','status'])||!elevation
      ||row.teamId!==elevation.teamId||row.year!==elevation.game.year||row.week!==sourceWeek(elevation.game)
      ||row.creditedSeasons!==elevation.creditedSeasons||!['game','elevated-practice'].includes(row.origin)
      ||!['active','recovered','active-contract','claim-pending'].includes(row.status)||episodes.has(row.gameId))fail('injury episode');
    episodes.set(row.gameId,row);
  }
  if(state.episodes.filter(row=>row.status==='active').length>1)fail('multiple active injuries');
  const seen=new Set();
  for(const row of state.payroll){
    const episode=episodes.get(row.gameId),receiptKey=key({...row,playerId:player.id});
    const currentCapPolicy=row.capTreatmentVersion===INJURY_CAP_TREATMENT_VERSION;
    const receiptKeys=['gameId','teamId','year','week','payCents','practiceCents','additionalCents','capChargeCents'];
    if(currentCapPolicy)receiptKeys.push('capTreatmentVersion');
    if(!exact(row,receiptKeys)||!episode
      ||row.teamId!==episode.teamId||row.year!==episode.year||!Number.isSafeInteger(row.week)||row.week<=episode.week||row.week>27
      ||!integer(row.payCents)||!integer(row.practiceCents)||!integer(row.additionalCents)||!integer(row.capChargeCents)
      ||row.payCents!==regularElevationSalaryForSeason(row.year,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents
      ||row.additionalCents!==Math.max(0,row.payCents-row.practiceCents)
      ||row.capChargeCents!==((currentCapPolicy?salaryPeriod(row.week):row.week<=18)?row.additionalCents:0)||seen.has(receiptKey))fail('payroll receipt');
    if(player.standardElevations.games.find(game=>game.game.gameId===episode.gameId).status!=='reverted')fail('unsettled injury source game');
    seen.add(receiptKey);
  }
}

export function retainedElevationInjuryCap(ledger={}){
  if(ledger.elevationInjuryCharges===undefined)return 0;
  if(!Array.isArray(ledger.elevationInjuryCharges))fail('cap receipts');
  const seen=new Set();let cents=0;
  for(const row of ledger.elevationInjuryCharges){
    if(!exact(row,['gameId','playerId','year','week','amountCents'])||typeof row.gameId!=='string'||!row.gameId
      ||typeof row.playerId!=='string'||!row.playerId||!Number.isSafeInteger(row.year)||row.year<2022||row.year>2200
      ||!Number.isSafeInteger(row.week)||row.week<1||row.week>27||!salaryPeriod(row.week)||!integer(row.amountCents)||seen.has(key(row)))fail('cap receipt');
    seen.add(key(row));cents+=row.amountCents;
  }
  if(!integer(cents))fail('cap total');return cents/100;
}

export function validateSnapshotElevationInjuryPay(snapshot){
  const league=snapshot.league||snapshot;
  validatePreRolloverMedicalCalendar(league);
  const players=[...(league.players||[]),...(league.retiredPlayers||[]),...(league.pendingDraft?.available||[])];
  for(const player of players){
    validatePlayerElevationInjuryPay(player);
    for(const episode of player.elevationInjuryPay?.episodes||[])if(episode.status==='claim-pending'){
      const retained=league.annualElevationInjuryResolutions?.find(row=>row.playerId===player.id&&row.gameId===episode.gameId);
      const claim=league.injurySalaryClaims?.find(row=>row.claimId===retained?.claimId);
      if(!retained||!claim||claim.playerId!==player.id||claim.gameId!==episode.gameId||claim.teamId!==episode.teamId||claim.injuryYear!==episode.year)fail('unretained injury claim');
    }
    for(const row of player.elevationInjuryPay?.payroll||[]){
      if(row.week>23&&!league.preRolloverMedicalCalendar?.some(period=>period.year===row.year&&period.throughWeek>=row.week))fail('unproved pre-rollover payroll');
      const ledger=league.capLedger?.[row.teamId];
      if(!salaryPeriod(row.week)||(row.week>=24&&row.capTreatmentVersion!==INJURY_CAP_TREATMENT_VERSION)
        ||row.year!==(league.financialYear??league.year)||ledger?.rolloverAppliedThroughYear>=row.year)continue;
      const receipt=ledger?.elevationInjuryCharges?.find(charge=>charge.playerId===player.id&&charge.year===row.year&&charge.week===row.week);
      if(!receipt||receipt.gameId!==row.gameId||receipt.amountCents!==row.capChargeCents)fail('missing earned charge');
    }
  }
  for(const [teamId,ledger]of Object.entries(league.capLedger||{})){
    retainedElevationInjuryCap(ledger);
    for(const charge of ledger.elevationInjuryCharges||[]){
      const row=players.find(player=>player.id===charge.playerId)?.elevationInjuryPay?.payroll.find(row=>row.year===charge.year&&row.week===charge.week);
      if(!row||row.teamId!==teamId||row.gameId!==charge.gameId||row.capChargeCents!==charge.amountCents)fail('unmatched earned charge');
    }
  }
}

// Called by an actual football-injury event. Missing elevation evidence never
// turns an ordinary practice injury into salary continuation.
export function recordElevationFootballInjury(player,{gameId,origin='game'}={}){
  validatePlayerElevationInjuryPay(player);
  const elevation=player.standardElevations?.games?.find(row=>row.game.gameId===gameId);
  if(!elevation||player.teamId!==elevation.teamId||player.contract?.kind!=='weekly-practice-contract-v1'
    ||player.contract.year!==elevation.game.year||!(player.injury?.weeksRemaining>0))return null;
  if(!['game','elevated-practice'].includes(origin))fail('injury origin');
  if(origin==='elevated-practice'&&elevation.status!=='declared')fail('practice injury outside elevation');
  const prior=player.elevationInjuryPay?.episodes.find(row=>row.gameId===gameId);
  if(prior)return structuredClone(prior);
  if(player.elevationInjuryPay?.episodes.some(row=>row.status==='active'))fail('existing injury entitlement');
  player.elevationInjuryPay||={version:ELEVATION_INJURY_PAY_VERSION,episodes:[],payroll:[]};
  const episode={gameId,teamId:elevation.teamId,year:elevation.game.year,week:sourceWeek(elevation.game),
    origin,creditedSeasons:elevation.creditedSeasons,status:'active'};
  player.elevationInjuryPay.episodes.push(episode);return structuredClone(episode);
}

export function endElevationInjuryPay(player,{activeContract=false}={}){
  validatePlayerElevationInjuryPay(player);
  if(!activeContract&&player.injury?.weeksRemaining>0)return;
  for(const row of player.elevationInjuryPay?.episodes||[])if(row.status==='active')row.status=activeContract?'active-contract':'recovered';
}

export function elevationInjuryReleaseRefusal(player){
  validatePlayerElevationInjuryPay(player);
  return player.injury?.weeksRemaining>0&&player.elevationInjuryPay?.episodes.some(row=>row.status==='active')
    ?{ok:false,status:409,reasonCode:'ELEVATION_INJURY_SETTLEMENT_REQUIRED',error:'This player has qualifying elevation injury salary continuation. Resolve recovery or an injury settlement before releasing or trading the practice contract.'}:null;
}

export function assertElevationInjuryContractTransition(league,{allowAdmittedSourceYear=false,allowAdmittedEarningCalendar=false,allowAdmittedAnnualCalendar=false}={}){
  if([allowAdmittedSourceYear,allowAdmittedEarningCalendar,allowAdmittedAnnualCalendar].some(value=>typeof value!=='boolean'))fail('admitted calendar scope');
  validateSnapshotElevationInjuryPay({league});
  validateSnapshotInjurySalaryClaims({league});
  validateSnapshotAnnualElevationInjuryResolutions({league});
  validateSnapshotAdmittedInjuryContinuations({league});
  if(allowAdmittedEarningCalendar||allowAdmittedAnnualCalendar)validateSnapshotAdmittedInjuryPayroll(league);
  if(allowAdmittedAnnualCalendar)validateSnapshotOffseasonMedicalCalendar(league);
  const earningYear=league.financialYear??league.year;
  const earningCalendar=allowAdmittedEarningCalendar&&earningYear===league.year
    &&league.preRolloverMedicalCalendar?.some(row=>row.year===earningYear&&row.throughWeek===27);
  const annualAnchor=allowAdmittedAnnualCalendar&&league.preRolloverMedicalCalendar?.find(row=>row.year===league.year&&row.throughWeek===27);
  const annualCalendar=annualAnchor&&(earningYear===league.year&&league.teams.every(team=>(league.capLedger?.[team.id]?.rolloverAppliedThroughYear??-Infinity)<league.year)
    ||earningYear===league.year+1&&league.offseasonMedicalCalendar?.some(row=>row.sourceYear===league.year&&row.earningYear===earningYear&&row.finalGameId===annualAnchor.finalGameId)
      &&league.teams.every(team=>league.capLedger?.[team.id]?.rolloverAppliedThroughYear===league.year));
  for(const player of [...league.players,...(league.retiredPlayers||[])]){
    const refusal=elevationInjuryReleaseRefusal(player);
    const retained=league.admittedInjuryContinuations?.some(right=>right.playerId===player.id
      &&(allowAdmittedSourceYear&&right.injuryYear===earningYear
        ||earningCalendar&&right.injuryYear<earningYear&&[24,25,26,27].every(week=>league.admittedInjuryPayroll?.some(row=>row.rightId===right.rightId&&row.earningYear===earningYear&&row.phase==='pre-rollover'&&row.week===week))
        ||annualCalendar&&right.injuryYear<=league.year&&[24,25,26,27].every(week=>right.injuryYear===league.year
          ?player.elevationInjuryPay?.payroll.some(row=>row.gameId===right.gameId&&row.year===league.year&&row.week===week)
          :league.admittedInjuryPayroll?.some(row=>row.rightId===right.rightId&&row.earningYear===league.year&&row.phase==='pre-rollover'&&row.week===week)))
      &&player.elevationInjuryPay?.episodes.some(episode=>episode.status==='active'&&episode.gameId===right.gameId));
    if(refusal&&!retained){
      const error=new Error('An unresolved elevation injury requires a cross-year continuation or settlement decision before annual contract transitions.');
      Object.assign(error,{status:409,reasonCode:'ELEVATION_INJURY_YEAR_TRANSITION_REQUIRED',playerId:player.id});throw error;
    }
  }
}

// Annual consumers require all elapsed pre-boundary wages and a proved
// calendar. After the cap boundary, the anchored summer calendar must also
// exist. A retained right alone never authorizes expiry, aging or rollover.
export function assertAnnualElevationInjuryContractTransition(league){
  return assertElevationInjuryContractTransition(league,{allowAdmittedAnnualCalendar:true});
}

// Practice base remains in its existing payroll. This ledger records only the
// adjustment. League postseason periods19–23 are Benefits; subsequent
// pre-rollover calendar periods are salary in the still-open source year.
// Old untagged receipts retain their recorded accounting policy on restore.
// A proved admitted right permits post-term pay in the still-open source
// year, independent of current employment. Cross-year payroll still refuses
// until a separate interval/rate/accounting authority covers that calendar.
export function recordElevationInjuryWeekPay(league,{year,week,teamIds=league.teams.map(team=>team.id),practicePayMode='scheduled'}){
  if(!Number.isSafeInteger(year)||year<2020||year>2200||!Number.isSafeInteger(week)||week<1||week>27
    ||!Array.isArray(teamIds)||teamIds.some(id=>!league.teams.some(team=>team.id===id))
    ||!['scheduled','recorded'].includes(practicePayMode))fail('payroll period');
  validateSnapshotElevationInjuryPay({league});
  validateSnapshotAdmittedInjuryContinuations({league});
  if(week>23&&!league.preRolloverMedicalCalendar?.some(period=>period.year===year&&period.throughWeek>=week))fail('unproved pre-rollover period');
  const clubs=new Set(teamIds),changes=[],ended=[];
  for(const player of league.players){
    const episode=player.elevationInjuryPay?.episodes.find(row=>row.status==='active');
    if(!episode||!clubs.has(episode.teamId))continue;
    if(!(player.injury?.weeksRemaining>0)){ended.push(player);continue;}
    const contract=player.contract;
    const right=league.admittedInjuryContinuations?.find(row=>row.playerId===player.id&&row.gameId===episode.gameId);
    // A retained prior-year source is paid by the earning-period ledger. Do
    // not turn it into a new current-year practice/elevation adjustment.
    // Unproved old episodes still reach the existing transition refusal.
    if(right&&episode.year<year)continue;
    const postTerm=right&&year===right.injuryYear&&week>right.term.endsAfterMedicalWeek;
    if(episode.year!==year||!postTerm&&(player.teamId!==episode.teamId
      ||!(player.rosterSlot==='practice'||player.rosterSlot==='reserve'&&player.reserveStatus?.kind==='ps-injured')
      ||contract?.kind!=='weekly-practice-contract-v1'||contract.year!==year))fail('unresolved injury contract transition');
    if(!postTerm)normalizeContract(contract);
    if(week<=episode.week||!postTerm&&week<contract.startWeek||player.elevationInjuryPay.payroll.some(row=>row.year===year&&row.week===week))continue;
    if(year!==(league.financialYear??league.year)||league.capLedger?.[episode.teamId]?.rolloverAppliedThroughYear>=year)fail('injury payroll year closed');
    if(player.standardElevations.games.find(game=>game.game.gameId===episode.gameId).status!=='reverted')fail('unsettled injury source game');
    const payCents=regularElevationSalaryForSeason(year,episode.creditedSeasons,{rate:'injury-continuation-down'}).weeklyAmountCents;
    // Applied-game/ordinary payroll plans the practice base separately. A
    // closed-season reconciliation can offset only a base actually paid.
    const baseReceipt=postTerm?null:week<=18?contract.payLedger?.[`${year}:${week}`]:contract.postseasonPayLedger?.[`${year}:postseason:${week}`];
    const practiceCents=postTerm?0:practicePayMode==='recorded'?(baseReceipt?.amount||0)*100:contract.weeklySalary*100;
    const additionalCents=Math.max(0,payCents-practiceCents);
    changes.push({player,row:{gameId:episode.gameId,teamId:episode.teamId,year,week,payCents,practiceCents,additionalCents,
      capChargeCents:salaryPeriod(week)?additionalCents:0,capTreatmentVersion:INJURY_CAP_TREATMENT_VERSION}});
  }
  for(const player of ended)endElevationInjuryPay(player);
  for(const {player,row}of changes){
    player.elevationInjuryPay.payroll.push(row);
    if(salaryPeriod(week)){
      league.capLedger||={};const ledger=league.capLedger[row.teamId]||={};ledger.elevationInjuryCharges||=[];
      ledger.elevationInjuryCharges.push({gameId:row.gameId,playerId:player.id,year,week,amountCents:row.capChargeCents});
    }
  }
  return changes.map(({player,row})=>({playerId:player.id,...row}));
}
