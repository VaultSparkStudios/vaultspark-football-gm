/**
 * StatsService — Domain Service Scaffold
 *
 * Owns stat aggregation, AV calculation, and leaderboard queries currently
 * spread across GameSession.js and statBook.js.
 *
 * Responsibilities:
 *   - Season and career stat queries by player/team/position
 *   - Leaderboard generation (passing yards, rushing, receiving, sacks, AV)
 *   - Starter-qualified filters (min games/attempts)
 *   - Benchmark comparison (vs. realism profile)
 *   - GM Report Card integration
 */

import { clamp } from "../../utils/rng.js";

export class StatsService {
  constructor(league) {
    this.league = league;
  }

  // ── Season stats ────────────────────────────────────────────────────────────

  getSeasonStats(playerId, year) {
    const player = this._player(playerId);
    if (!player) return null;
    return player.seasonStats?.[year] || null;
  }

  getAllSeasonStats(year) {
    return this.league.players
      .filter((p) => p.seasonStats?.[year])
      .map((p) => ({ player: p, stats: p.seasonStats[year] }));
  }

  // ── Leaderboards ────────────────────────────────────────────────────────────

  getLeaderboard(category, year, limit = 10) {
    const entries = this.getAllSeasonStats(year);
    let ranked;

    switch (category) {
      case "passing":
        ranked = entries
          .filter((e) => (e.stats.passing?.att || 0) >= 200)
          .map((e) => ({
            playerId: e.player.id, name: e.player.name, teamId: e.player.teamId,
            position: e.player.position,
            value: e.stats.passing?.yards || 0,
            label: `${e.stats.passing?.yards || 0} yds / ${e.stats.passing?.td || 0} TD`
          }))
          .sort((a, b) => b.value - a.value);
        break;

      case "rushing":
        ranked = entries
          .filter((e) => (e.stats.rushing?.att || 0) >= 80)
          .map((e) => ({
            playerId: e.player.id, name: e.player.name, teamId: e.player.teamId,
            position: e.player.position,
            value: e.stats.rushing?.yards || 0,
            label: `${e.stats.rushing?.yards || 0} yds / ${e.stats.rushing?.td || 0} TD`
          }))
          .sort((a, b) => b.value - a.value);
        break;

      case "receiving":
        ranked = entries
          .filter((e) => (e.stats.receiving?.targets || 0) >= 40)
          .map((e) => ({
            playerId: e.player.id, name: e.player.name, teamId: e.player.teamId,
            position: e.player.position,
            value: e.stats.receiving?.yards || 0,
            label: `${e.stats.receiving?.yards || 0} yds / ${e.stats.receiving?.td || 0} TD`
          }))
          .sort((a, b) => b.value - a.value);
        break;

      case "sacks":
        ranked = entries
          .filter((e) => (e.stats.defense?.sacks || 0) > 0)
          .map((e) => ({
            playerId: e.player.id, name: e.player.name, teamId: e.player.teamId,
            position: e.player.position,
            value: e.stats.defense?.sacks || 0,
            label: `${e.stats.defense?.sacks || 0} sacks`
          }))
          .sort((a, b) => b.value - a.value);
        break;

      case "av":
        ranked = entries
          .filter((e) => (e.stats.av || 0) > 0)
          .map((e) => ({
            playerId: e.player.id, name: e.player.name, teamId: e.player.teamId,
            position: e.player.position,
            value: e.stats.av || 0,
            label: `${e.stats.av || 0} AV`
          }))
          .sort((a, b) => b.value - a.value);
        break;

      default:
        ranked = [];
    }

    return ranked.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));
  }

  // ── Career leaders ──────────────────────────────────────────────────────────

  getCareerLeaderboard(category, limit = 10) {
    let ranked;

    switch (category) {
      case "av":
        ranked = this.league.players
          .filter((p) => p.careerStats)
          .map((p) => {
            const totalAV = Object.values(p.seasonStats || {}).reduce((s, ss) => s + (ss?.av || 0), 0);
            return { playerId: p.id, name: p.name, teamId: p.teamId, position: p.position, value: totalAV, label: `${totalAV} career AV` };
          })
          .filter((e) => e.value > 0)
          .sort((a, b) => b.value - a.value);
        break;
      case "passing-yards":
        ranked = this.league.players
          .filter((p) => p.position === "QB" && p.careerStats?.passing?.yards)
          .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, position: p.position, value: p.careerStats.passing.yards, label: `${p.careerStats.passing.yards} career yds` }))
          .sort((a, b) => b.value - a.value);
        break;
      default:
        ranked = [];
    }

    return ranked.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));
  }

  // ── Starter-qualified filter ────────────────────────────────────────────────

  starterQualifiedPlayers(position, year, minGames = 8) {
    return this.getAllSeasonStats(year)
      .filter((e) => e.player.position === position && (e.stats.gamesStarted || 0) >= minGames)
      .map((e) => e.player);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _player(playerId) { return this.league.players.find((p) => p.id === playerId) || null; }
}
