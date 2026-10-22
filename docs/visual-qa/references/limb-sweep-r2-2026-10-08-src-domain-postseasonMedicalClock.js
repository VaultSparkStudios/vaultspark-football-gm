import { advanceInjuryRecovery, teamRecoveryModifiers } from '../engine/injurySystem.js';
import { validateSnapshotPracticeContracts } from './practiceContracts.js';
import { validateSnapshotElevationInjuryPay, recordElevationInjuryWeekPay } from './elevationInjuryPay.js';
import { canonicalFootballGame } from './footballGameReference.js';
import {advanceAdmittedPostseasonRecovery,admittedPostseasonPlayerIds,validateAdmittedPostseasonClock} from './admittedPostseasonRecovery.js';

export const POSTSEASON_MEDICAL_CLOCK_VERSION = 'club-postseason-medical-weeks-v1';
export const POSTSEASON_MEDICAL_WEEKS = Object.freeze({ wildcard: 19, divisional: 20, conference: 21, 'super-bowl': 23 });
export const POSTSEASON_RECOVERY_COMPLETION_VERSION = 'league-postseason-recovery-v1';
const fail = () => {
  const error = new TypeError('Invalid postseason medical clock');
  Object.assign(error, { status: 400, reasonCode: 'POSTSEASON_MEDICAL_CLOCK_INVALID' });
  throw error;
};
function recoveryGameId(reference) {
  try { return canonicalFootballGame(reference).gameId; }
  catch { fail(); }
}

function clubsForRound(state, conference, round) {
  const seeds = state.seeds?.[conference];
  if (round === 'super-bowl') return Object.values(state.conferenceChampions || {});
  if (!Array.isArray(seeds)) fail();
  if (round === 'wildcard') return seeds.map(row => row.teamId);
  if (round === 'divisional') return [seeds.find(row => row.seed === 1)?.teamId,
    ...(state.bracket?.[conference]?.wildcard || []).map(game => game.winnerId)];
  if (round === 'conference') return (state.bracket?.[conference]?.divisional || []).map(game => game.winnerId);
  fail();
}

// Derive the last applied period from actual bracket history, including each
// round's resting/other-matchup clubs. Legacy saves start here without replay.
function appliedWeeks(state) {
  const ids = Object.values(state.seeds || {}).flat().map(row => row.teamId);
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) fail();
  const weeks = Object.fromEntries(ids.map(id => [id, 18]));
  for (const game of state.gameArchiveEntries || []) {
    const week = POSTSEASON_MEDICAL_WEEKS[game.round];
    if (!week) fail();
    for (const id of clubsForRound(state, game.conference, game.round)) {
      if (!Object.hasOwn(weeks, id)) fail();
      weeks[id] = Math.max(weeks[id], week);
    }
  }
  return weeks;
}

export function validatePostseasonMedicalClock(state) {
  validateAdmittedPostseasonClock(state);
  validatePostseasonRecoveryCompletion(state);
  if (!state?.medicalClock) {
    if (state && Object.hasOwn(state, 'medicalClock')) fail();
    return;
  }
  const clock = state.medicalClock, expected = appliedWeeks(state);
  if (clock.version !== POSTSEASON_MEDICAL_CLOCK_VERSION || Object.keys(clock).length !== 2
    || !clock.clubWeeks || Array.isArray(clock.clubWeeks)
    || Object.keys(clock.clubWeeks).length !== Object.keys(expected).length
    || Object.entries(expected).some(([id, week]) => clock.clubWeeks[id] !== week)) fail();
}

export function validatePostseasonRecoveryCompletion(state) {
  if (!state || !Object.hasOwn(state, 'medicalRecovery')) return;
  const receipt = state.medicalRecovery, archive = state.gameArchiveEntries, final = archive?.at(-1);
  if (!receipt || Object.keys(receipt).length !== 3 || receipt.version !== POSTSEASON_RECOVERY_COMPLETION_VERSION
    || receipt.year !== state.year || receipt.throughWeek !== 23 || state.status !== 'completed'
    || !Array.isArray(archive) || archive.length !== 13 || final.round !== 'super-bowl'
    || final.year !== receipt.year || final.gameId !== state.superBowl?.gameId) fail();
}

export function validateSnapshotPostseasonRecovery(snapshot) {
  validatePostseasonMedicalClock(snapshot.postseasonState);
  validateAdmittedPostseasonClock(snapshot.postseasonState,{league:snapshot.league});
  const latest = snapshot.latestPostseason;
  if (!latest || !Object.hasOwn(latest, 'medicalRecovery')) {
    validateAdmittedPostseasonClock(latest,{league:snapshot.league,completed:true});
    return;
  }
  // Snapshot projection intentionally drops the duplicate game archive. Its
  // retained bracket and canonical final still bind the receipt to its season.
  const receipt = latest.medicalRecovery, final = latest.superBowl;
  if (!receipt || Object.keys(receipt).length !== 3 || receipt.version !== POSTSEASON_RECOVERY_COMPLETION_VERSION
    || receipt.throughWeek !== 23 || !final || final.gameId !== recoveryGameId({ year: receipt.year,
      homeTeamId: final.homeTeamId, awayTeamId: final.awayTeamId, seasonType: 'playoffs', round: 'super-bowl', label: 'super-bowl' })
    || latest.bracket?.superBowl?.winnerId !== final.championTeamId) fail();
  for (const conference of ['AFC', 'NFC']) for (const [round, count] of [['wildcard', 3], ['divisional', 2], ['conference', 1]]) {
    const games = latest.bracket?.[conference]?.[round];
    if (!Array.isArray(games) || games.length !== count) fail();
    for (const game of games) if (game.gameId !== recoveryGameId({ year: receipt.year,
      homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, seasonType: 'playoffs', round,
      label: `${conference.toLowerCase()}-${round}` })) fail();
  }
  validateAdmittedPostseasonClock(latest,{league:snapshot.league,completed:true});
}

function lastWeeks(state) {
  validatePostseasonMedicalClock(state);
  return { ...(state.medicalClock?.clubWeeks || appliedWeeks(state)) };
}

function recoverPeriod(league, teamIds, week, year, options) {
  const clubs = new Set(teamIds);
  const admittedIds=admittedPostseasonPlayerIds(league,year);
  // A declared elevation can produce a practice injury before its game. It
  // must not receive recovery for time preceding that very incident period.
  const players = [...league.players,...(league.retiredPlayers||[])].filter(player => {
    const episode = player.elevationInjuryPay?.episodes.find(row => row.status === 'active');
    return !admittedIds.has(player.id)&&clubs.has(player.teamId) && !(episode?.year === year && episode.week >= week);
  });
  return advanceInjuryRecovery({ ...league, players }, { getTeamModifiers: options.getTeamModifiers
    || (teamId => teamRecoveryModifiers(league.teams.find(team => team.id === teamId))),
    onRecovered: (receipt, player) => options.onRecovered?.({ ...receipt, year, week }, player) });
}

export function postseasonRecoveryPlan({ state, league, next, year }) {
  if (state?.year !== year) fail();
  const week = POSTSEASON_MEDICAL_WEEKS[next?.round], clubWeeks = lastWeeks(state);
  const teamIds = clubsForRound(state, next?.conference, next?.round);
  if (!week || !teamIds.length || teamIds.some(id => !Object.hasOwn(clubWeeks, id)
    || !league.teams.some(team => team.id === id) || clubWeeks[id] > week)) fail();
  return { week, teamIds, clubWeeks };
}

function copyRecoveryLeague(league) {
  return structuredClone(league);
}

export function previewPostseasonGameRecovery(args) {
  const plan = postseasonRecoveryPlan(args), league = copyRecoveryLeague(args.league);
  if(args.year>=2023)advanceAdmittedPostseasonRecovery({state:structuredClone(args.state),league,year:args.year,throughWeek:plan.week,getTeamModifiers:args.getTeamModifiers});
  for (let week = 19; week <= plan.week; week++) {
    const teamIds = plan.teamIds.filter(id => plan.clubWeeks[id] < week);
    if (!teamIds.length) continue;
    // Preserve eligibility at the beginning of the elapsed interval on the
    // isolated preview. The real franchise earns nothing until play applies.
    const receipts = recordElevationInjuryWeekPay(league, {year:args.year,week,teamIds,
      practicePayMode: week === 22 && args.state.practicePayrollVersion !== 'postseason-practice-weeks-v1' ? 'recorded' : 'scheduled'});
    args.onInjuryAccrualPreview?.(receipts);
    recoverPeriod(league, teamIds, week, args.year, args);
  }
  return league;
}

// Apply only compensation staged by the medical preview after a successful
// game and its ordinary base payroll. Clearance must not erase earned cash.
// The recovered episode stays recovered; this does not revive future rights.
export function commitPostseasonInjuryAccrual({league,year,receipts}) {
  validateSnapshotElevationInjuryPay({league});
  if (!Array.isArray(receipts)) fail();
  if (!receipts.length) return {applied:0};
  const changes = [], keys = new Set();
  const projected = {...league,players:league.players.map(player=>({...player,
    elevationInjuryPay:player.elevationInjuryPay ? structuredClone(player.elevationInjuryPay) : undefined}))};
  for (const receipt of receipts) {
    const {playerId,...row} = receipt;
    const player = projected.players.find(player=>player.id===playerId);
    const episode = player?.elevationInjuryPay?.episodes.find(episode=>episode.gameId===row.gameId);
    const key = `${playerId}:${row.year}:${row.week}`;
    if (row.year!==year || !Number.isInteger(row.week) || row.week<19 || row.week>23
      || keys.has(key) || !episode || !['active','recovered'].includes(episode.status)
      || player.teamId!==episode.teamId || row.teamId!==episode.teamId) fail();
    keys.add(key);
    const paidBase = player.contract?.postseasonPayLedger?.[`${year}:postseason:${row.week}`];
    if (row.practiceCents !== (paidBase?.amount||0)*100) fail();
    const existing = player.elevationInjuryPay.payroll.find(paid=>paid.year===year && paid.week===row.week);
    if (existing) {
      if (Object.keys(row).some(key=>existing[key]!==row[key]) || Object.keys(existing).length!==Object.keys(row).length) fail();
      continue;
    }
    player.elevationInjuryPay.payroll.push(row);
    changes.push({playerId,row});
  }
  validateSnapshotElevationInjuryPay({league:projected});
  for (const {playerId,row} of changes) league.players.find(player=>player.id===playerId).elevationInjuryPay.payroll.push({...row});
  return {applied:changes.length};
}

export function applyPostseasonGameRecovery(args) {
  const plan = postseasonRecoveryPlan(args);
  if(args.year>=2023)advanceAdmittedPostseasonRecovery({...args,throughWeek:plan.week});
  for (let week = 19; week <= plan.week; week++) {
    const teamIds = plan.teamIds.filter(id => plan.clubWeeks[id] < week);
    if (!teamIds.length) continue;
    recoverPeriod(args.league, teamIds, week, args.year, args);
    args.onPeriod?.({ week, teamIds });
  }
  for (const id of plan.teamIds) plan.clubWeeks[id] = plan.week;
  args.state.medicalClock = { version: POSTSEASON_MEDICAL_CLOCK_VERSION, clubWeeks: plan.clubWeeks };
}

// An all-surviving-clubs command preflight projects each club to its own next
// match, so a bye or the other conference cannot prevent legitimate recovery.
export function previewPostseasonClubAvailability({ state, league, teamIds, year, ...options }) {
  if (state.year !== year) fail();
  const clubWeeks = lastWeeks(state), preview = copyRecoveryLeague(league);
  const round=state.stage?.replace(/^(AFC|NFC|NFL)-/,'');
  if(year>=2023&&POSTSEASON_MEDICAL_WEEKS[round])advanceAdmittedPostseasonRecovery({state:structuredClone(state),league:preview,year,throughWeek:POSTSEASON_MEDICAL_WEEKS[round],getTeamModifiers:options.getTeamModifiers});
  for (const id of new Set(teamIds)) {
    if (!Object.hasOwn(clubWeeks, id)) fail();
    const games = (state.gameArchiveEntries || []).filter(game => [game.homeTeamId, game.awayTeamId].includes(id));
    const last = games.at(-1);
    const seed = Object.values(state.seeds).flat().find(row => row.teamId === id)?.seed;
    const target = last ? { wildcard: 20, divisional: 21, conference: 23, 'super-bowl': 23 }[last.round]
      : seed === 1 ? 20 : 19;
    for (let week = clubWeeks[id] + 1; week <= target; week++) recoverPeriod(preview, [id], week, year, options);
  }
  return preview;
}

function finishRecovery({ state, league, year, getTeamModifiers, onRecovered, clockWeeks }) {
  const clubWeeks = clockWeeks || lastWeeks(state);
  const allIds = [...new Set([...league.teams.map(team => team.id), ...league.players.map(player => player.teamId),...(league.retiredPlayers||[]).map(player=>player.teamId)])];
  for (let week = 19; week <= 23; week++) {
    const teamIds = allIds.filter(id => (clubWeeks[id] ?? 18) < week);
    if (!teamIds.length) continue;
    const payingClubs = teamIds.filter(id => league.teams.some(team => team.id === id));
    // No fictitious practice base or club game is created after elimination.
    // Accrue the elapsed injured interval before clearance can end its source.
    // Only qualifying continuation is reconciled; this creates no game/service.
    recordElevationInjuryWeekPay(league, { year, week, teamIds: payingClubs, practicePayMode: 'recorded' });
    recoverPeriod(league, teamIds, week, year, { getTeamModifiers, onRecovered });
  }
  state.medicalRecovery = { version: POSTSEASON_RECOVERY_COMPLETION_VERSION, year, throughWeek: 23 };
}

export function previewPostseasonCompletionRecovery({ state, league, next, year, getTeamModifiers }) {
  if (next.round !== 'super-bowl') return;
  const clockWeeks = lastWeeks(state);
  for (const id of [next.homeTeamId, next.awayTeamId]) clockWeeks[id] = 23;
  validateSnapshotPracticeContracts({ league });
  validateSnapshotElevationInjuryPay({ league });
  const previewState=structuredClone(state),previewLeague=structuredClone(league);
  if(year>=2023)advanceAdmittedPostseasonRecovery({state:previewState,league:previewLeague,year,throughWeek:23,getTeamModifiers});
  finishRecovery({ state: previewState, league: previewLeague, year, getTeamModifiers, clockWeeks });
}

export function finishPostseasonRecovery(args) {
  const { state, league, year } = args;
  if (state?.status !== 'completed' || state.year !== year || state.gameArchiveEntries?.length !== 13
    || state.gameArchiveEntries.at(-1)?.round !== 'super-bowl') fail();
  validatePostseasonMedicalClock(state);
  validateSnapshotPracticeContracts({ league });
  validateSnapshotElevationInjuryPay({ league });
  if (state.medicalRecovery) return { ok: true, alreadyApplied: true };
  if(year>=2023)advanceAdmittedPostseasonRecovery({...args,throughWeek:23});
  // Refuse invalid source/payroll data without partially healing other clubs.
  finishRecovery({ state: structuredClone(state), league: structuredClone(league), year,
    getTeamModifiers: args.getTeamModifiers });
  finishRecovery(args);
  return { ok: true, alreadyApplied: false };
}
