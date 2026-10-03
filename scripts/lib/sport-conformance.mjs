/**
 * sport-conformance.mjs — the quality floor every sport pack must clear (S116, Phase 0).
 *
 * Football is the first subject. Each later pack supplies the same adapter:
 *   createSession(seed)      → a fresh league session for that seed
 *   advance(session, weeks)  → play `weeks` scheduled rounds
 *   games(session)           → archived games { homeTeamId, awayTeamId, homeScore, awayScore, boxScore }
 *   periodScores(boxScore)   → { home: number[], away: number[] } per-period points
 *   scoringEvents(boxScore)  → [{ teamId, points }]
 *   statClosure(game)        → [{ label, team, players }] pairs that must match exactly
 *   publicText(session)      → player-facing strings the engine wrote (news, headlines)
 *   forbiddenTerms           → real-league trademarks the pack must never print
 *
 * Checks return { id, ok, detail } so a failure names the broken law, not a stack trace.
 */
import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export const CONFORMANCE_CHECKS = Object.freeze([
  "seeded-determinism",
  "score-closure",
  "period-closure",
  "stat-closure",
  "public-vocabulary"
]);

export function runConformance(adapter, { seed = 20260306, weeks = 3 } = {}) {
  const results = [];
  const record = (id, ok, detail) => results.push({ id, ok: Boolean(ok), detail });

  const first = adapter.createSession(seed);
  adapter.advance(first, weeks);
  const second = adapter.createSession(seed);
  adapter.advance(second, weeks);
  const gamesA = adapter.games(first);
  const gamesB = adapter.games(second);
  record("seeded-determinism", gamesA.length > 0 && hash(gamesA) === hash(gamesB),
    `${gamesA.length} games; ${hash(gamesA)} vs ${hash(gamesB)}`);

  const scoreMisses = [];
  const periodMisses = [];
  const statMisses = [];
  let periodsChecked = 0;
  let statPairsChecked = 0;
  for (const game of gamesA) {
    const events = adapter.scoringEvents(game.boxScore) || [];
    const home = events.filter((e) => e.teamId === game.homeTeamId).reduce((s, e) => s + Number(e.points || 0), 0);
    const away = events.filter((e) => e.teamId === game.awayTeamId).reduce((s, e) => s + Number(e.points || 0), 0);
    if (home !== game.homeScore || away !== game.awayScore) scoreMisses.push(`${game.gameId}: events ${home}-${away} vs final ${game.homeScore}-${game.awayScore}`);
    const periods = adapter.periodScores(game.boxScore);
    if (periods) {
      periodsChecked += 1;
      const ph = periods.home.reduce((s, v) => s + Number(v || 0), 0);
      const pa = periods.away.reduce((s, v) => s + Number(v || 0), 0);
      if (ph !== game.homeScore || pa !== game.awayScore) periodMisses.push(`${game.gameId}: periods ${ph}-${pa} vs final ${game.homeScore}-${game.awayScore}`);
    }
    for (const pair of adapter.statClosure(game) || []) {
      statPairsChecked += 1;
      if (Number(pair.team) !== Number(pair.players)) statMisses.push(`${game.gameId} ${pair.label}: team ${pair.team} vs players ${pair.players}`);
    }
  }
  record("score-closure", scoreMisses.length === 0, scoreMisses.slice(0, 5).join("; ") || `${gamesA.length} games reconcile`);
  // A law that checked nothing fails closed rather than passing vacuously.
  record("period-closure", periodsChecked > 0 && periodMisses.length === 0, periodMisses.slice(0, 5).join("; ") || `${periodsChecked} games reconcile`);
  record("stat-closure", statPairsChecked > 0 && statMisses.length === 0, statMisses.slice(0, 5).join("; ") || `${statPairsChecked} team/player pairs reconcile`);

  const terms = adapter.forbiddenTerms || [];
  const leaks = [];
  for (const text of adapter.publicText(first) || []) {
    for (const term of terms) if (new RegExp(`\\b${term}\\b`).test(String(text))) leaks.push(`${term}: ${String(text).slice(0, 80)}`);
  }
  record("public-vocabulary", leaks.length === 0, leaks.slice(0, 5).join("; ") || `${terms.length} terms clear`);

  return { ok: results.every((r) => r.ok), results };
}
