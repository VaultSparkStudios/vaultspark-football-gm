// CBA Article8 accrued service and Article26 salary-credited service are
// different. This forward ledger does not invent games in imported history.
import { generatedPensionService, validatePensionService } from './pensionService.js';
import { expandSnapshotPensionService } from '../runtime/pensionServiceSnapshot.js';
export const PLAYER_SERVICE_VERSION = 'football-service-games-v1';
const count = value => Number.isInteger(value) && value >= 0;
const popcount = value => { let n = value >>> 0, total = 0; while (n) { total += n & 1; n >>>= 1; } return total; };

export function validateSnapshotPlayerService(snapshot) {
  snapshot = expandSnapshotPensionService(snapshot);
  if ((snapshot.sportId || snapshot.league?.sportId || 'football') !== 'football') return;
  for (const players of [snapshot.league?.players, snapshot.league?.retiredPlayers, snapshot.league?.pendingDraft?.available]) {
    if (Array.isArray(players)) for (const player of players) validatePlayerService(player, snapshot);
  }
}

export function validatePlayerService(player, context) {
  validatePensionService(player, context);
  const ledger = player.serviceLedger;
  if (!ledger) return;
  const fail = () => { const error = new Error(`Invalid service ledger for ${player.id}`); error.reasonCode = 'PLAYER_SERVICE_INVALID'; throw error; };
  if (ledger.version !== PLAYER_SERVICE_VERSION || !ledger.baseline || !ledger.seasons || typeof ledger.seasons !== 'object' || Array.isArray(ledger.seasons)) fail();
  for (const purpose of ['accrued', 'credited']) {
    if (ledger.baseline[purpose] !== null && !count(ledger.baseline[purpose])) fail();
    if (ledger.baseline[purpose] === null && !count(ledger.baseline.proxy)) fail();
  }
  for (const [year, row] of Object.entries(ledger.seasons)) {
    if (!Number.isInteger(Number(year)) || Number(year) <= 0 || !row || typeof row !== 'object') fail();
    for (const key of ['seen', 'accrued', 'credited', 'active']) if (!count(row[key]) || row[key] > 262143 || (key !== 'seen' && (row[key] & row.seen) !== row[key])) fail();
    if (typeof row.activeListKnown !== 'boolean' || (row.postseasonGames && (!Array.isArray(row.postseasonGames) || row.postseasonGames.some(id => typeof id !== 'string')))) fail();
    if (row.finalized && (row.finalized !== true || typeof row.accruedAwarded !== 'boolean' || typeof row.creditedAwarded !== 'boolean')) fail();
    if ((row.accruedAwarded || row.creditedAwarded) && row.finalized !== true) fail();
  }
}

export function generatedPlayerService(experience) {
  return { accruedSeasons: experience, creditedSeasons: experience, pensionService: generatedPensionService(experience),
    serviceLedger: { version: PLAYER_SERVICE_VERSION,
      baseline: { accrued: experience, credited: experience, accruedProvenance: 'fictional-prior-service', creditedProvenance: 'fictional-prior-service' },
      seasons: {} } };
}

function ensureLedger(player) {
  if (player.serviceLedger) {
    validatePlayerService(player);
    return player.serviceLedger;
  }
  const proxy = Math.max(0, Math.floor(Number(player.experience) || 0));
  return player.serviceLedger = { version: PLAYER_SERVICE_VERSION,
    baseline: { accrued: count(player.accruedSeasons) ? player.accruedSeasons : null,
      credited: count(player.creditedSeasons) ? player.creditedSeasons : null,
      accruedProvenance: count(player.accruedSeasons) ? 'declared-prior-service' : 'unknown-prior-service',
      creditedProvenance: count(player.creditedSeasons) ? 'declared-prior-service' : 'unknown-prior-service', proxy },
    seasons: {} };
}

export function playerServiceCount(player, purpose) {
  if (!['accrued', 'credited'].includes(purpose)) throw new Error('Unknown service purpose');
  const ledger = player.serviceLedger;
  const field = purpose === 'accrued' ? 'accruedSeasons' : 'creditedSeasons';
  if (!ledger) return { seasons: count(player[field]) ? player[field] : Math.max(0, Math.floor(Number(player.experience) || 0)),
    provenance: count(player[field]) ? `declared-${purpose}-seasons` : 'experience-proxy-not-service-history', completeHistory: count(player[field]) };
  if (ledger.version !== PLAYER_SERVICE_VERSION) throw new Error('Unsupported player service ledger');
  const observed = Object.values(ledger.seasons).filter(row => row[`${purpose}Awarded`] === true).length;
  const known = count(ledger.baseline[purpose]);
  return { seasons: (known ? ledger.baseline[purpose] : ledger.baseline.proxy) + observed,
    observedSeasons: observed, completeHistory: known,
    provenance: known ? `${ledger.baseline[`${purpose}Provenance`]}-plus-observed-service` : 'frozen-experience-proxy-plus-observed-service' };
}

function qualifications(player, year, week, elevated=false) {
  const d = player.designations || {};
  const explicitPay = player.serviceHistory?.fullPayByGame?.[`${year}:${week}`];
  const defaultPay = !d.nfi && Number(player.contract?.baseSalary ?? player.contract?.salary ?? 0) > 0;
  const fullPay = (player.suspensionWeeks || 0) <= 0 && (typeof explicitPay === 'boolean' ? explicitPay : defaultPay);
  // Reserve placement does not convert ordinary practice compensation into
  // active-contract full-pay service. Elevation remains separately proved.
  const excluded = ((player.rosterSlot === 'practice' || player.contract?.kind === 'weekly-practice-contract-v1')&&!elevated) || d.exemptCommissioner === true
    || (d.pup === true && player.serviceHistory?.pupOrigin !== 'football');
  return { accrued: fullPay && !excluded, credited: fullPay && !excluded && d.ir !== true };
}

// Called only after an actual game is applied. Week bits deduplicate retries
// and trades between clubs in the same regular-season week. A dressed player
// needs no snaps to be on the Active List; undressed53-list players can earn
// full-pay service but do not count toward the nine Active List game boundary.
export function recordFootballGameService({ league, result, elevatedPlayerIds=[] }) {
  const { year, week, seasonType } = result;
  if (!Number.isInteger(year) || !['regular', 'playoffs'].includes(seasonType)) return [];
  const regular = seasonType === 'regular';
  if (regular && (!Number.isInteger(week) || week < 1 || week > 18)) return [];
  const teams = new Set([result.homeTeamId, result.awayTeamId]);
  const receipts = result.boxScore?.gameDayRosters;
  const dressed = new Set([...(receipts?.home?.playerIds || []), ...(receipts?.away?.playerIds || [])]);
  const activeListKnown = Array.isArray(receipts?.home?.playerIds) && Array.isArray(receipts?.away?.playerIds);
  const processed = [];
  const elevated=new Set(elevatedPlayerIds);
  for (const player of league.players) {
    if (player.status !== 'active' || !teams.has(player.teamId)) continue;
    const ledger = ensureLedger(player);
    const row = ledger.seasons[year] ||= { seen: 0, accrued: 0, credited: 0, active: 0, activeListKnown: true,
      payModel: 'annual-contract-full-pay-unless-explicit-status; unknown-NFI/PUP-conservative' };
    if (row.finalized) continue;
    if (!regular) {
      if (!result.gameId) continue;
      row.postseasonGames ||= [];
      if (row.postseasonGames.includes(result.gameId)) continue;
      row.postseasonGames.push(result.gameId);
    } else {
      const bit = 1 << (week - 1);
      if (row.seen & bit) continue;
      row.seen |= bit;
      const service = qualifications(player, year, week,elevated.has(player.id));
      if (service.accrued) row.accrued |= bit;
      if (service.credited) row.credited |= bit;
      if (dressed.has(player.id)) row.active |= bit;
      row.activeListKnown &&= activeListKnown;
    }
    processed.push(player.id);
  }
  return processed;
}

export function finalizeFootballServiceSeason(league, year) {
  for (const player of [...league.players, ...(league.retiredPlayers || [])]) {
    const ledger = player.serviceLedger, row = ledger?.seasons?.[year];
    if (!row || row.finalized) continue;
    const restriction = player.serviceHistory?.accrualRestrictions?.[year] || {};
    const denied = (restriction.reportedToCamp === false || restriction.materialHoldout === true) && restriction.hardshipExceptionGranted !== true;
    row.accruedAwarded = popcount(row.accrued) >= 6 && !denied;
    row.creditedAwarded = popcount(row.credited) >= 3;
    row.finalized = true;
    if (denied) row.accrualDenied = 'reporting-or-material-holdout';
    for (const purpose of ['accrued', 'credited']) {
      const service = playerServiceCount(player, purpose);
      if (service.completeHistory) player[purpose === 'accrued' ? 'accruedSeasons' : 'creditedSeasons'] = service.seasons;
    }
    if (row.accruedAwarded && playerServiceCount(player, 'accrued').completeHistory
      && player.accruedSeasons === 1 && row.activeListKnown) {
      player.serviceHistory ||= {};
      player.serviceHistory.loneAccruedSeasonActiveGames = popcount(row.active);
    }
  }
}
