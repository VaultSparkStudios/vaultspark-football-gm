import { FIELDABLE_DEPTH } from '../config.js';
import { getGameTeamPlayers, selectGameDayRoster } from './gameDayRoster.js';
import { capSpaceForTeam } from './capCompliance.js';
import { standardElevationGame, declareStandardElevation, validateSnapshotStandardElevations } from '../domain/standardElevations.js';

export const CPU_STANDARD_ELEVATION_POLICY = 'fieldable-game-depth-v1';
const merit = player => Number(player.overall || 0);
const compare = (a, b) => merit(b) - merit(a) || String(a.id).localeCompare(String(b.id));

// A declaration plan owns only the state its shared domain command can change.
// It never consumes simulation randomness or changes personnel/contract terms.
export function copyElevationPlanningLeague(league) {
  return { ...league, players: league.players.map(player => ({ ...player,
    standardElevations: player.standardElevations ? structuredClone(player.standardElevations) : undefined })),
    capLedger: structuredClone(league.capLedger || {}) };
}

function opportunity(league, player, game) {
  const room = getGameTeamPlayers(league, player.teamId, game).filter(row => row.position === player.position).sort(compare);
  const required = FIELDABLE_DEPTH[player.position]?.min || 1;
  // Fill unavailable positional depth first. Otherwise spend an elevation
  // only for a meaningful upgrade to the existing fieldable room.
  const shortage = Math.max(0, required - room.length);
  const upgrade = merit(player) - merit(room[Math.min(required, room.length) - 1] || { overall: 0 });
  return shortage ? 1000 + shortage * 100 + merit(player) : upgrade >= 3 ? upgrade : 0;
}

function choose(league, games, excludeTeamIds) {
  const excluded = new Set(excludeTeamIds), choices = [];
  for (const reference of games) {
    // This authority models the current three-use rule introduced in 2022;
    // it does not retroactively invent declarations in historical seasons.
    if (Number.isSafeInteger(reference.year) && reference.year >= 1900 && reference.year < 2022) continue;
    const game = standardElevationGame(reference);
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      if (excluded.has(teamId)) continue;
      for (let slot = 0; slot < 2; slot++) {
        const candidates = league.players.filter(player => player.teamId === teamId && player.rosterSlot === 'practice'
          && !player.standardElevations?.games.some(row => row.status === 'declared'))
          .map(player => ({ player, priority: opportunity(league, player, game) }))
          .filter(row => row.priority > 0)
          .sort((a, b) => b.priority - a.priority || compare(a.player, b.player));
        let selected = null;
        for (const { player, priority } of candidates) {
          // Try on another owned copy: a candidate that will not dress does
          // not consume one of the two declarations or reserve real cap room.
          const trial = copyElevationPlanningLeague(league), candidate = trial.players.find(row => row.id === player.id);
          const declared = declareStandardElevation({ league: trial, player: candidate, teamId, game,
            capSpace: capSpaceForTeam(trial, teamId) });
          if (!declared.ok || declared.unchanged) continue;
          const dressed = selectGameDayRoster({ league: trial, teamId, roster: getGameTeamPlayers(trial, teamId, game) });
          if (!dressed.players.some(row => row.id === player.id)) continue;
          selected = { player, priority }; break;
        }
        if (!selected) break;
        const result = declareStandardElevation({ league, player: selected.player, teamId, game,
          capSpace: capSpaceForTeam(league, teamId) });
        if (!result.ok || result.unchanged) throw new Error('CPU elevation plan changed during selection');
        choices.push({ playerId: selected.player.id, teamId, game, priority: selected.priority,
          policy: CPU_STANDARD_ELEVATION_POLICY });
      }
    }
  }
  return choices;
}

export function previewCpuStandardElevations({ league, games, excludeTeamIds = [] }) {
  validateSnapshotStandardElevations({ league });
  const preview = copyElevationPlanningLeague(league);
  const choices = choose(preview, games, excludeTeamIds);
  return { league: preview, choices };
}

export function applyCpuStandardElevations(context) {
  // Calculate every legal declaration before touching the authoritative league.
  const { choices } = previewCpuStandardElevations(context);
  for (const choice of choices) {
    const player = context.league.players.find(row => row.id === choice.playerId);
    const result = declareStandardElevation({ league: context.league, player, teamId: choice.teamId, game: choice.game,
      capSpace: capSpaceForTeam(context.league, choice.teamId) });
    if (!result.ok || result.unchanged) throw new Error('CPU elevation commit differs from preflight');
  }
  return choices;
}
