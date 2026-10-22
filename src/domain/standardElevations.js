import {regularElevationSalaryForSeason} from '../data/nflElevationSalary.js';
import {postseasonElevationSalaryForSeason} from '../data/nflPostseasonSalary.js';
import {playerServiceCount} from './playerService.js';
import {normalizeContract} from './contracts.js';
import {retainedElevationInjuryCap,validateSnapshotElevationInjuryPay} from './elevationInjuryPay.js';
import {canonicalFootballGame} from './footballGameReference.js';

export const STANDARD_ELEVATION_VERSION='standard-elevation-games-v1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;
const fail=message=>{const error=new TypeError(`Invalid standard elevation: ${message}`);error.reasonCode='STANDARD_ELEVATION_INVALID';error.status=400;throw error;};
const refusal=(reasonCode,error)=>({ok:false,status:409,reasonCode,error});
const history=player=>player.standardElevations?.games||[];
const physicalGameKey=game=>JSON.stringify([game.year,game.seasonType,game.week,game.round,game.awayTeamId,game.homeTeamId]);
const exactKeys=(value,required,optional=[])=>object(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>[...required,...optional].includes(key));

export function standardElevationGame({year,week=0,seasonType='regular',homeTeamId,awayTeamId,label='regular-season',round=null}) {
  if(!Number.isSafeInteger(year)||year<2022||year>2200)fail('game reference');
  try { return canonicalFootballGame({year,week,seasonType,homeTeamId,awayTeamId,label,round}); }
  catch (error) { fail(error.message.includes('game label') ? 'canonical game label' : 'game reference'); }
}

export function validatePlayerStandardElevations(player) {
  const state=player.standardElevations;if(state===undefined)return;
  if(!exactKeys(state,['version','games','cycles'],['resetPaths'])||state.version!==STANDARD_ELEVATION_VERSION||!Array.isArray(state.games))fail('unsupported history');
  const seen=new Set(),uses=new Map();
  for(const row of state.games){
    if(!exactKeys(row,['game','teamId','cycle','status','creditedSeasons','weeklyPracticeCents','payCents','capChargeCents','priorClubListGames'],['divisionWinner','won'])
      ||!exactKeys(row.game,['year','week','seasonType','homeTeamId','awayTeamId','label','round','gameId'])||!['declared','reverted'].includes(row.status)||!nonnegative(row.cycle)
      ||typeof row.teamId!=='string'||![row.game.homeTeamId,row.game.awayTeamId].includes(row.teamId)
      ||!nonnegative(row.creditedSeasons)||!nonnegative(row.weeklyPracticeCents)||!nonnegative(row.payCents)
      ||!nonnegative(row.capChargeCents)||!nonnegative(row.priorClubListGames))fail('history row');
    const canonical=standardElevationGame(row.game);
    const key=physicalGameKey(canonical);
    if(canonical.gameId!==row.game.gameId||seen.has(key))fail('duplicate or mismatched game');
    seen.add(key);
    if(row.game.seasonType==='regular'){
      if(row.priorClubListGames!==0||row.divisionWinner!==undefined||row.won!==undefined)fail('regular entitlement metadata');
      const key=JSON.stringify([row.game.year,row.teamId,row.cycle]);uses.set(key,(uses.get(key)||0)+1);
      if(uses.get(key)>3)fail('regular season limit');
      const rate=regularElevationSalaryForSeason(row.game.year,row.creditedSeasons);
      if(row.payCents!==rate.weeklyAmountCents||row.capChargeCents!==Math.max(0,row.payCents-row.weeklyPracticeCents))fail('regular compensation');
    }else if(row.status==='declared'){
      if(row.payCents!==0||row.capChargeCents!==0||row.priorClubListGames!==0||row.divisionWinner!==undefined||row.won!==undefined)fail('unplayed postseason compensation');
    }else{
      if(typeof row.divisionWinner!=='boolean'||typeof row.won!=='boolean')fail('settled postseason entitlement metadata');
      const rate=postseasonElevationSalaryForSeason(row.game.year,{round:row.game.round,divisionWinner:row.divisionWinner,won:row.won,priorClubListGames:row.priorClubListGames});
      if(row.payCents!==rate.amountCents||row.capChargeCents!==0)fail('postseason compensation');
    }
  }
  if(state.games.filter(row=>row.status==='declared').length>1)fail('multiple pending games');
  if(!object(state.cycles)||Object.entries(state.cycles).some(([key,value])=>!key||!nonnegative(value)||['__proto__','constructor','prototype'].includes(key)))fail('club cycles');
  const expectedCycles=new Map();
  if(state.resetPaths!==undefined&&!Array.isArray(state.resetPaths))fail('reset paths');
  const pendingClubs=new Set(),lastResetYear=new Map(),completedResets=new Map();
  for(const path of state.resetPaths||[]){
    if(!exactKeys(path,['teamId','year','cycle','status'])||typeof path.teamId!=='string'||!path.teamId||['__proto__','constructor','prototype'].includes(path.teamId)||!nonnegative(path.cycle)
      ||!Number.isSafeInteger(path.year)||path.year<2022||path.year>2200||!['activated','released','rejoined'].includes(path.status)
      ||path.cycle!==(expectedCycles.get(path.teamId)||0)||pendingClubs.has(path.teamId)
      ||path.year<(lastResetYear.get(path.teamId)||0))fail('reset path');
    lastResetYear.set(path.teamId,path.year);
    if(path.status==='rejoined'){
      expectedCycles.set(path.teamId,path.cycle+1);
      completedResets.set(JSON.stringify([path.teamId,path.cycle+1]),path.year);
    }else pendingClubs.add(path.teamId);
  }
  for(const teamId of new Set([...Object.keys(state.cycles),...expectedCycles.keys()]))if((state.cycles[teamId]||0)!==(expectedCycles.get(teamId)||0))fail('unproven club cycle');
  if(state.games.some(row=>row.cycle>(state.cycles[row.teamId]||0)))fail('history exceeds club cycle');
  if(state.games.some(row=>row.cycle>0&&row.game.year<completedResets.get(JSON.stringify([row.teamId,row.cycle]))))fail('game predates reset');
}

// Only the complete permanent-active-contract → release/waivers → weekly
// practice re-sign route creates another three-game regular-season cycle.
// A direct practice release/re-sign preserves the current cycle.
export function recordPermanentElevationActivation(player,{teamId,year}){
  if(!player.standardElevations)return;
  validatePlayerStandardElevations(player);
  if(player.teamId!==teamId||player.rosterSlot!=='active'||player.contract?.kind==='weekly-practice-contract-v1'
    ||!Number.isSafeInteger(year)||year<2022||year>2200
    ||history(player).some(row=>row.teamId===teamId&&row.game.year>year)
    ||player.standardElevations.resetPaths?.some(path=>path.teamId===teamId&&path.year>year))fail('permanent activation evidence');
  const state=player.standardElevations;
  const existing=state.resetPaths?.find(path=>path.teamId===teamId&&path.status!=='rejoined');
  if(existing)return;
  state.resetPaths||=[];
  state.resetPaths.push({teamId,year,cycle:state.cycles[teamId]||0,status:'activated'});
}

export function recordElevationActiveRelease(player,{teamId}){
  if(!player.standardElevations)return;
  validatePlayerStandardElevations(player);
  if(player.teamId!==teamId||player.rosterSlot!=='active'||player.contract?.kind==='weekly-practice-contract-v1')return;
  const path=player.standardElevations.resetPaths?.find(row=>row.teamId===teamId&&row.status==='activated');
  if(path)path.status='released';
}

export function recordElevationPracticeRejoin(player,{teamId}){
  if(!player.standardElevations)return;
  validatePlayerStandardElevations(player);
  if(player.teamId!==teamId||player.rosterSlot!=='practice'||player.contract?.kind!=='weekly-practice-contract-v1')fail('practice rejoin evidence');
  const state=player.standardElevations,path=state.resetPaths?.find(row=>row.teamId===teamId&&row.status==='released');
  if(!path)return;
  path.status='rejoined';state.cycles[teamId]=path.cycle+1;
}

export function retainedElevationCap(ledger={}) {
  const charges=ledger.elevationCharges;
  if(charges===undefined)return retainedElevationInjuryCap(ledger);
  if(!Array.isArray(charges))fail('cap receipts');
  const keys=new Set();let cents=0;
  for(const row of charges){
    if(!exactKeys(row,['year','gameId','playerId','amountCents','status'])||typeof row.playerId!=='string'||!row.playerId||typeof row.gameId!=='string'||!row.gameId
      ||!nonnegative(row.amountCents)||!Number.isSafeInteger(row.year)||row.year<2022||row.year>2200||!['reserved','earned'].includes(row.status))fail('cap receipt');
    const key=JSON.stringify([row.playerId,row.gameId]);if(keys.has(key))fail('duplicate cap receipt');keys.add(key);cents+=row.amountCents;
  }
  if(!nonnegative(cents))fail('cap receipt sum');
  return cents/100+retainedElevationInjuryCap(ledger);
}

export function validateSnapshotStandardElevations(snapshot) {
  const league=snapshot.league||snapshot;
  const clubIds=new Set((league.teams||[]).map(team=>team.id)),gameCounts=new Map();
  for(const list of [league.players,league.retiredPlayers,league.pendingDraft?.available])if(Array.isArray(list))for(const player of list)validatePlayerStandardElevations(player);
  for(const list of [league.players,league.retiredPlayers,league.pendingDraft?.available])if(Array.isArray(list))for(const player of list)for(const path of player.standardElevations?.resetPaths||[]){
    if(!clubIds.has(path.teamId)||path.year>(league.financialYear??league.year))fail('reset club/year missing');
  }
  for(const list of [league.players,league.retiredPlayers,league.pendingDraft?.available])if(Array.isArray(list))for(const player of list)for(const row of history(player)){
    if(row.status==='declared'&&list!==league.players)fail('pending elevation outside live roster');
    const key=JSON.stringify([row.teamId,physicalGameKey(row.game)]);gameCounts.set(key,(gameCounts.get(key)||0)+1);
    if(gameCounts.get(key)>2)fail('team game limit');
  }
  for(const ledger of Object.values(league.capLedger||{}))retainedElevationCap(ledger);
  // A declaration is still on its original club and practice contract.
  // Its reserved regular charge cannot disappear from the team's cap record.
  for(const player of league.players||[])for(const row of history(player).filter(row=>row.status==='declared')){
    if(player.status!=='active'||player.rosterSlot!=='practice'||player.teamId!==row.teamId||player.contract?.kind!=='weekly-practice-contract-v1')fail('pending roster/contract mismatch');
    if(!clubIds.has(row.game.homeTeamId)||!clubIds.has(row.game.awayTeamId))fail('pending game club missing');
    normalizeContract(player.contract);
    if(player.contract.year!==row.game.year||player.contract.weeklySalary*100!==row.weeklyPracticeCents
      ||(row.game.seasonType==='regular'&&player.contract.startWeek>row.game.week))fail('pending contract terms');
    if(row.game.seasonType==='regular'){
      const charge=league.capLedger?.[row.teamId]?.elevationCharges?.find(c=>c.playerId===player.id&&c.gameId===row.game.gameId);
      if(!charge||charge.status!=='reserved'||charge.amountCents!==row.capChargeCents||charge.year!==row.game.year)fail('missing reservation');
    }
  }
  for(const player of [...(league.players||[]),...(league.retiredPlayers||[])])for(const row of history(player)){
    const ledger=league.capLedger?.[row.teamId];
    if(row.game.seasonType!=='regular'||row.status!=='reverted'||row.game.year!==(league.financialYear??league.year)
      ||(Number.isInteger(ledger?.rolloverAppliedThroughYear)&&ledger.rolloverAppliedThroughYear>=row.game.year))continue;
    const charge=ledger?.elevationCharges?.find(c=>c.playerId===player.id&&c.gameId===row.game.gameId);
    if(!charge||charge.status!=='earned'||charge.amountCents!==row.capChargeCents||charge.year!==row.game.year)fail('missing earned compensation');
  }
  for(const [teamId,ledger]of Object.entries(league.capLedger||{}))for(const charge of ledger.elevationCharges||[]){
    const player=(league.players||[]).find(p=>p.id===charge.playerId)|| (league.retiredPlayers||[]).find(p=>p.id===charge.playerId);
    const row=player&&history(player).find(r=>r.game.gameId===charge.gameId&&r.teamId===teamId);
    if(!row||row.game.seasonType!=='regular'||row.game.year!==charge.year||row.capChargeCents!==charge.amountCents
      ||charge.status!==(row.status==='declared'?'reserved':'earned'))fail('unmatched cap receipt');
  }
  validateSnapshotElevationInjuryPay({league});
}

export function pendingStandardElevation(player,game=null) {
  validatePlayerStandardElevations(player);
  return history(player).find(row=>row.status==='declared'&&(!game||row.game.gameId===game.gameId))||null;
}

export function standardElevationRosterRefusal(player){
  return pendingStandardElevation(player)?refusal('ELEVATION_PENDING','This player is elevated for a scheduled game. Personnel moves become available after the game and practice-squad reversion.'):null;
}

export function standardElevationPracticeEligibility(player,{teamId,year}) {
  if(!player||player.teamId!==teamId||player.status!=='active'||player.rosterSlot!=='practice')
    return refusal('ELEVATION_NOT_PRACTICE','Select a player on this club’s practice squad.');
  if(player.contract?.kind!=='weekly-practice-contract-v1'||player.contract.year!==year)
    return refusal('ELEVATION_CONTRACT_REQUIRED','A current weekly practice contract is required.');
  normalizeContract(player.contract);
  if(['ir','pup','nfi','exemptCommissioner'].some(key=>player.designations?.[key]===true)||(player.injury?.weeksRemaining||0)>0||(player.suspensionWeeks||0)>0)
    return refusal('ELEVATION_PLAYER_UNAVAILABLE','An injured, suspended or reserve-designated player cannot be elevated.');
  return {ok:true};
}

export function previewStandardElevation({league,player,teamId,game,capSpace}) {
  validateSnapshotStandardElevations({league});
  const canonical=standardElevationGame(game);
  if(canonical.year!==(league.financialYear??league.year)||league.capLedger?.[teamId]?.rolloverAppliedThroughYear>=canonical.year)return refusal('ELEVATION_YEAR_CLOSED','Elevations require an open league year.');
  if(!league.teams.some(t=>t.id===teamId)||![canonical.homeTeamId,canonical.awayTeamId].includes(teamId)
    ||![canonical.homeTeamId,canonical.awayTeamId].every(id=>league.teams.some(t=>t.id===id)))return refusal('ELEVATION_NO_SCHEDULED_GAME','Elevations require this club’s scheduled game.');
  if(!league.players.includes(player))return refusal('ELEVATION_NOT_PRACTICE','Select a player on this club’s practice squad.');
  const eligible=standardElevationPracticeEligibility(player,{teamId,year:canonical.year});
  if(!eligible.ok&&eligible.reasonCode!=='ELEVATION_PLAYER_UNAVAILABLE')return eligible;
  if(canonical.seasonType==='regular'&&player.contract.startWeek>canonical.week)return refusal('ELEVATION_CONTRACT_REQUIRED','This practice contract has not started.');
  const existing=pendingStandardElevation(player);
  if(existing)return existing.game.gameId===canonical.gameId?{ok:true,unchanged:true,elevation:structuredClone(existing)}:refusal('ELEVATION_ALREADY_PENDING','This player already has a pending elevation.');
  if(history(player).some(row=>physicalGameKey(row.game)===physicalGameKey(canonical)))return refusal('ELEVATION_GAME_ALREADY_PLAYED','This game’s elevation has already been applied.');
  if(!eligible.ok)return eligible;
  const gameUses=[...league.players,...(league.retiredPlayers||[])].flatMap(p=>history(p)).filter(row=>row.teamId===teamId&&physicalGameKey(row.game)===physicalGameKey(canonical));
  if(gameUses.some(row=>row.status==='reverted'))return refusal('ELEVATION_GAME_ALREADY_PLAYED','This club’s elevation game has already been settled.');
  if(gameUses.length>=2)return refusal('ELEVATION_GAME_LIMIT','Two standard elevations have already been declared for this game.');
  const cycle=player.standardElevations?.cycles?.[teamId]||0;
  const uses=history(player).filter(row=>row.teamId===teamId&&row.cycle===cycle&&row.game.year===canonical.year&&row.game.seasonType==='regular').length;
  if(canonical.seasonType==='regular'&&uses>=3)return refusal('ELEVATION_SEASON_LIMIT','This player needs permanent activation after three regular-season elevations.');
  const creditedSeasons=playerServiceCount(player,'credited').seasons,weeklyPracticeCents=player.contract.weeklySalary*100;
  const payCents=canonical.seasonType==='regular'?regularElevationSalaryForSeason(canonical.year,creditedSeasons).weeklyAmountCents:0;
  const capChargeCents=canonical.seasonType==='regular'?Math.max(0,payCents-weeklyPracticeCents):0;
  if(!Number.isFinite(capSpace))fail('cap room');
  if(capChargeCents>Math.round(capSpace*100))return refusal('ELEVATION_CAP_ROOM','Insufficient cap room for the additional elevation compensation.');
  return {ok:true,elevation:{game:canonical,teamId,cycle,status:'declared',creditedSeasons,weeklyPracticeCents,payCents,capChargeCents,priorClubListGames:0},uses,remainingRegular:3-uses};
}

export function declareStandardElevation(context) {
  const result=previewStandardElevation(context);if(!result.ok||result.unchanged)return result;
  const {league,player}=context,row=result.elevation;
  player.standardElevations||={version:STANDARD_ELEVATION_VERSION,games:[],cycles:{}};
  player.standardElevations.games.push(row);
  if(row.game.seasonType==='regular'){
    league.capLedger||={};const ledger=league.capLedger[row.teamId]||={};ledger.elevationCharges||=[];
    ledger.elevationCharges.push({year:row.game.year,gameId:row.game.gameId,playerId:player.id,amountCents:row.capChargeCents,status:'reserved'});
  }
  return {...result,elevation:structuredClone(row),deadlineModel:'weekly-command-boundary',reversionModel:'postgame-business-day-boundary'};
}

// The engine must call this after service credit and before roster mutations.
// Zero-snap/inactive elevated players still revert and earn elevation pay.
export function settleStandardElevationGame({league,result,priorClubListGames,divisionWinner}) {
  validateSnapshotStandardElevations({league});const receipts=[],changes=[];
  for(const player of league.players){
    const row=pendingStandardElevation(player,{gameId:result.gameId});if(!row)continue;
    if(['year','week','seasonType','homeTeamId','awayTeamId','label'].some(key=>result[key]!==row.game[key]))fail('settlement game mismatch');
    const update={status:'reverted'};let charge=null;
    if(row.game.seasonType==='playoffs'){
      if(typeof priorClubListGames!=='function'||typeof divisionWinner!=='function'
        ||![result.homeTeamId,result.awayTeamId].includes(result.winnerId))fail('postseason entitlement authority missing');
      update.priorClubListGames=priorClubListGames(player,row.teamId,row.game.year,result.gameId);
      update.divisionWinner=divisionWinner(row.teamId);update.won=result.winnerId===row.teamId;
      const rate=postseasonElevationSalaryForSeason(row.game.year,{round:row.game.round,...update});
      update.payCents=rate.amountCents;
    }else{
      charge=league.capLedger[row.teamId].elevationCharges.find(c=>c.playerId===player.id&&c.gameId===result.gameId);
    }
    changes.push({row,update,charge});
    receipts.push({playerId:player.id,teamId:row.teamId,gameId:result.gameId,seasonType:row.game.seasonType,
      payCents:update.payCents??row.payCents,additionalCapCents:row.capChargeCents,revertedTo:'practice',waiversRequired:false});
  }
  // Calculate every entitlement before committing any player's pay or reversion.
  for(const {row,update,charge}of changes){Object.assign(row,update);if(charge)charge.status='earned';}
  return receipts;
}
