// Forward reserve receipts: an old flag cannot establish an unknown placement
// date, missed-game count, physical examination or return designation.
import { canonicalFootballGame, footballGameMedicalWeek } from './footballGameReference.js';
import { validatePracticeSquadAddition } from './practiceSquadEligibility.js';
const invalidPhysicalGame = () => Object.assign(new TypeError('Invalid reserve physical game'),
  {reasonCode:'RESERVE_RECEIPT_INVALID',status:400});
export const RESERVE_LIST_VERSION = 'nfl-reserve-list-v1';
export const isReserveListPlayer = player => player.rosterSlot === 'reserve';

export function transitionReserveList(league, player, context, { designation, active, beginPractice = false, returnEligible = true }) {
  const fail = (reasonCode, error) => ({ ok: false, reasonCode, error });
  if (!['ir', 'pup', 'nfi', 'ps-injured'].includes(designation) || typeof active !== 'boolean'
    || typeof beginPractice !== 'boolean' || typeof returnEligible !== 'boolean' || (active && beginPractice))
    return fail('RESERVE_OPTIONS_INVALID', 'Reserve options require boolean values; beginning practice is a return action.');
  const { year, week, phase, campCuts = false } = context;
  const history = league.reserveReturnHistory || [];
  const forClub = history.filter(row => row.year === year && row.teamId === player.teamId);
  const forPlayer = history.filter(row => row.year === year && row.playerId === player.id);
  const clubLimit = phase === 'postseason' && league.teams?.some(t => t.id === player.teamId && t.playoffSeed > 0) ? 10 : 8;
  const reserve = player.reserveStatus;
  if (active) {
    if (isReserveListPlayer(player)) return reserve?.kind === designation
      ? { ok: true, unchanged: true } : fail('RESERVE_ALREADY_PLACED', 'Activate the existing reserve placement before changing lists.');
    const practiceInjured = designation === 'ps-injured';
    if (practiceInjured ? player.rosterSlot !== 'practice' || player.contract?.kind !== 'weekly-practice-contract-v1'
      || player.contract.year !== year : (player.rosterSlot || 'active') !== 'active')
      return fail('RESERVE_ACTIVE_CONTRACT_REQUIRED', practiceInjured ? 'Practice Squad/Injured requires a current practice contract.' : 'This transition requires an active-roster contract.');
    if (!(player.injury?.weeksRemaining > 0)) return fail('RESERVE_INJURY_REQUIRED', 'A recorded injury or illness is required; this command cannot invent one.');
    if (!campCuts && !['regular-season', 'postseason'].includes(phase)) return fail('RESERVE_PLACEMENT_PHASE', 'Reserve placement is available at camp cuts or during an active season.');
    if (designation === 'pup' && (!campCuts || player.medicalHistory?.failedPreseasonPhysical !== true
      || player.medicalHistory?.practicedThisPreseason !== false || player.injury?.origin === 'nonfootball'))
      return fail('PUP_PRESEASON_HISTORY_REQUIRED', 'Reserve PUP requires a failed preseason physical for a football injury and no preseason practice.');
    if (designation === 'nfi' && player.injury?.origin !== 'nonfootball')
      return fail('NFI_ORIGIN_REQUIRED', 'NFI requires a recorded non-football injury or illness.');
    const cutDesignation = campCuts && designation === 'ir' && returnEligible;
    if (cutDesignation && forClub.filter(row => row.atCut === true).length >= 2)
      return fail('RESERVE_CUT_RETURN_LIMIT', 'Only two final-cut reserve players can be designated to return.');
    const countsAgainstReturnLimit = designation === 'ir' || practiceInjured || (designation === 'nfi' && !campCuts);
    if (cutDesignation && (forClub.length >= 8 || forPlayer.length >= 2))
      return fail('RESERVE_RETURN_LIMIT', 'The club or player has exhausted its return designations.');
    player.reserveStatus = { version: RESERVE_LIST_VERSION, kind: designation, year, placedWeek: week,
      gamesMissed: [], returnEligible, countsAgainstReturnLimit, practiceStartedWeek: null,
      returnCharged: cutDesignation };
    player.rosterSlot = 'reserve';
    player.designations ||= {};
    player.designations[designation] = true;
    if (cutDesignation) {
      league.reserveReturnHistory ||= [];
      league.reserveReturnHistory.push({ year, week, teamId: player.teamId, playerId: player.id, atCut: true });
    }
    return { ok: true, rosterSlot: 'reserve' };
  }
  if (!isReserveListPlayer(player)) return player.designations?.[designation] === true
    ? fail('RESERVE_HISTORY_UNKNOWN', 'This legacy reserve flag has no verified placement history.')
    : { ok: true, unchanged: true };
  if (reserve?.kind !== designation) return fail('RESERVE_LIST_MISMATCH', 'Use the player’s current reserve list.');
  const eligibility = reserveReturnEligibility(player, { year, week, phase, forPractice: beginPractice });
  if (!eligibility.ok) return eligibility;
  if (!beginPractice && player.injury?.weeksRemaining > 0) return fail('RESERVE_STILL_INJURED', 'The player remains unavailable with a recorded injury.');
  const returningToPractice = reserve.kind === 'ps-injured';
  if (!beginPractice && returningToPractice) {
    const eligibility = validatePracticeSquadAddition({ players: league.players.filter(p => p.teamId === player.teamId
      && p.status === 'active' && p.rosterSlot === 'practice'), player, settings: context.practiceSettings || league.settings || {} });
    if (!eligibility.ok) return eligibility;
  }
  if (!beginPractice && !returningToPractice && league.players.filter(p => p.teamId === player.teamId && p.status === 'active'
    && (p.rosterSlot || 'active') === 'active').length >= 53)
    return fail('RESERVE_ACTIVE_ROSTER_FULL', 'Open an active-roster place before activating this player.');
  const charge = reserve.countsAgainstReturnLimit && !reserve.returnCharged;
  if (charge && (forClub.length >= clubLimit || forPlayer.length >= 2))
    return fail('RESERVE_RETURN_LIMIT', 'The club or player has exhausted its return designations.');
  if (charge) {
    league.reserveReturnHistory ||= [];
    league.reserveReturnHistory.push({ year, week, teamId: player.teamId, playerId: player.id, atCut: false });
    reserve.returnCharged = true;
  }
  reserve.practiceStartedWeek ??= week;
  if (beginPractice) return { ok: true, rosterSlot: 'reserve', practiceStartedWeek: reserve.practiceStartedWeek };
  player.reserveHistory ||= [];
  player.reserveHistory.push({ ...structuredClone(reserve), activatedWeek: week });
  player.reserveStatus = null;
  player.rosterSlot = returningToPractice ? 'practice' : 'active';
  player.designations[designation] = false;
  return { ok: true, rosterSlot: player.rosterSlot };
}

export function recordReserveGameAbsences({ league, result }) {
  if (!['regular', 'playoffs'].includes(result.seasonType)) return;
  let physical = null;
  if (result.gameId !== undefined) {
    try {
      const round = result.round || ['wildcard','divisional','conference','super-bowl'].find(value => String(result.label).endsWith(value));
      physical = canonicalFootballGame({ ...result, round: result.seasonType === 'regular' ? null : round });
      if (physical.gameId !== result.gameId) return;
      result = { ...result, week: footballGameMedicalWeek(physical) };
    } catch { return; } // Custom tactical games are not season absences.
  }
  if (!physical && result.seasonType === 'playoffs' && result.week === 23) return;
  // Standalone matchup previews can use week zero. They are not an indexed
  // season game and cannot create reserve eligibility or an invalid save.
  if (!Number.isInteger(result.year) || result.year < 1000 || result.year > 9999
    || !Number.isInteger(result.week) || result.week < 1
    || (result.seasonType === 'regular' ? result.week > 18 : result.week < 19 || result.week > 23 || result.week === 22 && physical)
    || result.homeTeamId === result.awayTeamId
    || ![result.homeTeamId, result.awayTeamId].every(id => (league.teams || []).some(team => team.id === id))) return;
  const key = `${result.year}:${result.seasonType}:${result.week}:${result.homeTeamId}:${result.awayTeamId}`;
  if (league.reserveGameHistory?.some(row => row.key === key)) return;
  if (result.seasonType === 'playoffs' && [22,23].includes(result.week)
    && league.reserveGameHistory?.some(row => row.key === `${result.year}:playoffs:${result.week === 22 ? 23 : 22}:${result.homeTeamId}:${result.awayTeamId}`)) return;
  const missed = [];
  for (const p of league.players) {
    const reserve = p.reserveStatus;
    if (p.status !== 'active' || !isReserveListPlayer(p) || reserve?.version !== RESERVE_LIST_VERSION
      || reserve.year !== result.year || result.week < reserve.placedWeek
      || ![result.homeTeamId, result.awayTeamId].includes(p.teamId)) continue;
    if (!reserve.gamesMissed.includes(key)) reserve.gamesMissed.push(key);
    missed.push(p.id);
  }
  // Save the applied boundary and affected players, rather than trusting an
  // arbitrary string count when a franchise is restored. Duplicate application
  // cannot retrospectively add a newly placed player to an earlier receipt.
  league.reserveGameHistory ||= [];
  league.reserveGameHistory.push({ key, playerIds: missed, ...(physical ? { game: physical } : {}) });
}

export function reserveReturnEligibility(player, { year, week, phase, forPractice = false }) {
  const r = player.reserveStatus;
  const fail = (reasonCode, error) => ({ ok: false, reasonCode, error });
  if (r?.version !== RESERVE_LIST_VERSION || !isReserveListPlayer(player))
    return fail('RESERVE_HISTORY_UNKNOWN', 'Reserve placement history is unavailable; a flag alone cannot establish return eligibility.');
  if (r.year !== year || !r.returnEligible)
    return fail('RESERVE_SEASON_ENDING', 'This reserve placement is not eligible to return this season.');
  if (!['regular-season', 'postseason'].includes(phase))
    return fail('RESERVE_RETURN_PHASE', 'Reserve returns require an active season.');
  const required = forPractice && r.kind === 'pup' && year >= 2026 ? 2 : 4;
  if (r.gamesMissed.length < required)
    return fail('RESERVE_GAMES_REQUIRED', `The player must miss ${required} team games; ${r.gamesMissed.length} have been recorded.`);
  if (r.practiceStartedWeek != null && week > r.practiceStartedWeek + 3)
    return fail('RESERVE_PRACTICE_EXPIRED', 'The 21-day return practice window has expired.');
  return { ok: true };
}

export function describeReserveReturn(league, player, context) {
  const r = player.reserveStatus;
  if (!r || !isReserveListPlayer(player)) return null;
  const check = forPractice => {
    const result = reserveReturnEligibility(player, { ...context, forPractice });
    if (!result.ok) return result;
    if (!forPractice && player.injury?.weeksRemaining > 0)
      return { ok: false, error: 'The player remains injured.' };
    if (!forPractice && r.kind === 'ps-injured') {
      const eligible = validatePracticeSquadAddition({ players: league.players.filter(p => p.teamId === player.teamId
        && p.status === 'active' && p.rosterSlot === 'practice'), player, settings: context.practiceSettings || league.settings || {} });
      if (!eligible.ok) return eligible;
    }
    if (!forPractice && r.kind !== 'ps-injured' && league.players.filter(p => p.teamId === player.teamId && p.status === 'active'
      && (p.rosterSlot || 'active') === 'active').length >= 53)
      return { ok: false, error: 'Open an active-roster place before activation.' };
    if (r.countsAgainstReturnLimit && !r.returnCharged) {
      const history = league.reserveReturnHistory || [];
      const limit = context.phase === 'postseason' && league.teams.some(t => t.id === player.teamId && t.playoffSeed > 0) ? 10 : 8;
      if (history.filter(row => row.year === context.year && row.teamId === player.teamId).length >= limit
        || history.filter(row => row.year === context.year && row.playerId === player.id).length >= 2)
        return { ok: false, error: 'The club or player has exhausted its return designations.' };
    }
    return { ok: true };
  };
  return { kind: r.kind, year: r.year, placedWeek: r.placedWeek, gamesMissed: r.gamesMissed.length,
    returnEligible: r.returnEligible, practiceStartedWeek: r.practiceStartedWeek,
    practiceWindowEndWeek: r.practiceStartedWeek == null ? null : r.practiceStartedWeek + 3,
    returnCharged: r.returnCharged, practice: check(true), activation: check(false) };
}

export function validateReserveListState(snapshot) {
  const league = snapshot.league || snapshot;
  const teams = new Set((league.teams || []).map(t => t.id));
  const parseGame = key => {
    if (typeof key !== 'string') return null;
    const parts = key.split(':');
    if (parts.length !== 5 || !/^\d{4}$/.test(parts[0]) || !/^[1-9]\d*$/.test(parts[2])
      || !['regular', 'playoffs'].includes(parts[1]) || !teams.has(parts[3]) || !teams.has(parts[4]) || parts[3] === parts[4]) return null;
    const week = Number(parts[2]);
    if (parts[1] === 'regular' ? week > 18 : week < 19 || week > 23) return null;
    return { year: Number(parts[0]), week };
  };
  const applied = new Map();
  const finals = new Set();
  if (league.reserveGameHistory != null) {
    if (!Array.isArray(league.reserveGameHistory)) throw new Error('Invalid reserve game ledger');
    for (const row of league.reserveGameHistory) {
      if (!row || !parseGame(row.key) || applied.has(row.key) || !Array.isArray(row.playerIds)
        || row.playerIds.some(id => typeof id !== 'string') || new Set(row.playerIds).size !== row.playerIds.length)
        throw new Error('Invalid reserve game ledger');
      if (Object.hasOwn(row, 'game')) {
        let physical;
        try { physical = canonicalFootballGame(row.game); } catch { throw invalidPhysicalGame(); }
        if (physical.gameId !== row.game.gameId
          || row.key !== `${physical.year}:${physical.seasonType}:${footballGameMedicalWeek(physical)}:${physical.homeTeamId}:${physical.awayTeamId}`)
          throw invalidPhysicalGame();
      }
      const parts = row.key.split(':');
      if (parts[1] === 'playoffs' && ['22','23'].includes(parts[2])) {
        const alias = `${parts[0]}:${parts[3]}:${parts[4]}`;
        if (finals.has(alias) || parts[2] === '23' && !Object.hasOwn(row,'game')) throw invalidPhysicalGame();
        finals.add(alias);
      }
      applied.set(row.key, new Set(row.playerIds));
    }
  }
  for (const p of league.players || []) {
    const r = p.reserveStatus;
    if (r == null) continue;
    if (r.version !== RESERVE_LIST_VERSION || !['ir', 'pup', 'nfi', 'ps-injured'].includes(r.kind)
      || (r.kind === 'ps-injured' && (p.contract?.kind !== 'weekly-practice-contract-v1'
        || p.contract.year !== r.year || !r.countsAgainstReturnLimit))
      || !Number.isInteger(r.year) || !Number.isInteger(r.placedWeek) || r.placedWeek < 1
      || p.rosterSlot !== 'reserve' || p.designations?.[r.kind] !== true
      || !Array.isArray(r.gamesMissed) || r.gamesMissed.some(key => {
        const game = parseGame(key);
        return !game || game.year !== r.year || game.week < r.placedWeek || !applied.get(key)?.has(p.id);
      })
      || new Set(r.gamesMissed).size !== r.gamesMissed.length || typeof r.returnEligible !== 'boolean'
      || new Set(r.gamesMissed.map(key => parseGame(key)?.week)).size !== r.gamesMissed.length
      || typeof r.countsAgainstReturnLimit !== 'boolean' || typeof r.returnCharged !== 'boolean'
      || (r.practiceStartedWeek !== null && (!Number.isInteger(r.practiceStartedWeek) || r.practiceStartedWeek < r.placedWeek))) {
      const error = new Error(`Invalid reserve receipt for ${p.id}`);
      error.reasonCode = 'RESERVE_RECEIPT_INVALID'; throw error;
    }
  }
  if (league.reserveReturnHistory != null && (!Array.isArray(league.reserveReturnHistory)
    || league.reserveReturnHistory.some(row => !row || !Number.isInteger(row.year) || !Number.isInteger(row.week)
      || typeof row.playerId !== 'string' || typeof row.teamId !== 'string' || typeof row.atCut !== 'boolean')))
    throw new Error('Invalid reserve return ledger');
}

export function resetReserveListsForYear(league, year) {
  for (const p of league.players) {
    const r = p.reserveStatus;
    if (r?.version !== RESERVE_LIST_VERSION || r.year >= year) continue;
    p.reserveHistory ||= [];
    p.reserveHistory.push({ ...structuredClone(r), endedBeforeYear: year });
    p.reserveStatus = null;
    if (p.rosterSlot === 'reserve') p.rosterSlot = r.kind === 'ps-injured' ? 'practice' : 'active';
    if (p.designations) p.designations[r.kind] = false;
  }
}
