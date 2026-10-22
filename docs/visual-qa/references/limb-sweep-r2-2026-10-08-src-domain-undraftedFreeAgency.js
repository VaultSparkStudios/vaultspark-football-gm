import { normalizeContract } from './contracts.js';
export const UNDRAFTED_FREE_AGENCY_VERSION = 'completed-draft-free-agents-v1';

// Admission is not a signing: existing prospect identity/ratings and unpaid
// terms move into the unsigned pool. Active or weekly offers use their normal
// funding/authority paths later. Do not revive stale drafts or retired IDs.
export function admitUndraftedFreeAgents(league, draft, { year } = {}) {
  if (!Number.isInteger(year)) throw new TypeError('Invalid undrafted admission year');
  if (!league || !Array.isArray(league.players) ||
    (league.retiredPlayers != null && !Array.isArray(league.retiredPlayers)))
    throw new TypeError('Invalid unsigned league population');
  if (!draft || draft.completed !== true) return { year, admitted: [], reason: 'draft-not-complete' };
  if (draft.year !== year) return { year, admitted: [], reason: 'draft-year-mismatch' };
  if (!Array.isArray(draft.available) || (draft.selections != null && !Array.isArray(draft.selections)))
    throw new TypeError('Invalid completed draft population');
  const receipt=draft.undraftedFreeAgency;
  if (receipt && (receipt.version !== UNDRAFTED_FREE_AGENCY_VERSION || receipt.year !== year ||
    !Array.isArray(receipt.playerIds) || receipt.playerIds.some(id=>typeof id!=='string') ||
    new Set(receipt.playerIds).size !== receipt.playerIds.length))
    throw new TypeError('Invalid undrafted admission receipt');
  const existing=new Set([...(league.players || []),...(league.retiredPlayers || [])].map(p=>p.id));
  const selected=new Set((draft.selections || []).map(row=>row.playerId));
  const seen=new Set(),admitted=[];
  for (const player of draft.available) {
    if (!player || typeof player.id !== 'string' || !player.id || seen.has(player.id))
      throw new TypeError('Invalid or duplicate undrafted prospect');
    seen.add(player.id);
    if (existing.has(player.id) || selected.has(player.id)) continue;
    // Validate using the persistence/financial authority, without replacing
    // original terms. Unsupported versions and retained charges are not an
    // unsigned rookie contract even when the three headline fields are zero.
    normalizeContract(player.contract);
    if (player.teamId !== 'FA' || player.status !== 'active' || !player.contract ||
      ['salary','capHit','yearsRemaining'].some(key=>player.contract[key] !== 0) ||
      ['baseSalary','signingBonus','guaranteed','deadCapRemaining','practiceEarnedCharge'].some(key=>
        player.contract[key] != null && player.contract[key] !== 0))
      throw new TypeError('Undrafted prospect must have unsigned terms');
    admitted.push(player);
  }
  // Validate the whole batch before changing either collection.
  for (const player of admitted) {
    player.draftEntry={version:UNDRAFTED_FREE_AGENCY_VERSION,year,status:'undrafted'};
    league.players.push(player);
  }
  draft.available=[];
  draft.undraftedFreeAgency={version:UNDRAFTED_FREE_AGENCY_VERSION,year,
    playerIds:[...new Set([...(receipt?.playerIds || []),...admitted.map(p=>p.id)])]};
  return {year,admitted,reason:admitted.length?'admitted':'already-reconciled'};
}
