/**
 * timeCapsule.js — Preseason Predictions with Season-End Receipts (S29)
 *
 * The beat reporter goes on record before Week 1 with five falsifiable calls,
 * then the Season Epilogue grades those receipts and the reporter owns the
 * misses. Nothing here is flavour text: every prediction is stored with the
 * exact target it will be graded against, and grading reads only real season
 * outcomes (champions ledger, history standings, StatBook season lines).
 *
 * Determinism: predictions derive from a dedicated RNG seeded off the main
 * stream's current state XOR the season year — same save + same season always
 * produces the same predictions, and the main simulation stream is never
 * advanced by capsule work.
 *
 * State shape (rides on league, serialized with saves):
 *   league.timeCapsule       — current capsule { year, predictions[], graded }
 *   league.timeCapsuleLedger — rolling per-season summaries (max 25)
 */

import { RNG } from "../utils/rng.js";
import { getTeamPlayers } from "../domain/teamFactory.js";

const LEDGER_MAX = 25;

// ── Reporter voice banks (deterministic, hit-count keyed) ────────────────────

const VERDICT_BANK = {
  clean: [
    "Five for five territory. I'd like to thank the film, the tape, and my own relentless genius.",
    "Print the column again. The board doesn't miss when the homework gets DONE in July.",
    "Some call it luck. The ledger calls it scouting."
  ],
  sharp: [
    "Mostly right, and the misses were noble. The tape giveth and the tape taketh away.",
    "A winning card. Clip the misses and frame the hits.",
    "The board holds. Quibble with the margins, not the method."
  ],
  mixed: [
    "A split decision. I stand by the process and disown two of the results.",
    "Half genius, half hostage to variance. Football remains undefeated.",
    "The hits were loud. The misses were louder. We move."
  ],
  rough: [
    "I'd like to formally apologize to the film for claiming I watched it.",
    "The preseason board has been escorted from the building. New board next July.",
    "In my defense, nobody saw that coming. In the tape's defense, it tried to tell me."
  ]
};

function verdictKey(hits, total) {
  const rate = total > 0 ? hits / total : 0;
  if (rate >= 0.9) return "clean";
  if (rate >= 0.6) return "sharp";
  if (rate >= 0.4) return "mixed";
  return "rough";
}

function pickLine(bank, seedYear) {
  return bank[Math.abs(seedYear) % bank.length];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function teamsByRating(league) {
  return [...league.teams].sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
}

function teamName(league, teamId) {
  const team = league.teams.find((t) => t.id === teamId);
  return team ? team.name || team.id : teamId;
}

function projectedWins(rank, teamCount) {
  // Best-rated team projects to ~12.2 wins, worst to ~4.5, linear between.
  const span = Math.max(1, teamCount - 1);
  return Number((12.2 - ((rank - 1) / span) * 7.7).toFixed(1));
}

function finalWinsFor(league, year, teamId) {
  const entry = (league.history || []).find((h) => h.year === year);
  if (entry?.standings) {
    for (const conf of Object.values(entry.standings)) {
      const row = (conf || []).find((r) => r.teamId === teamId);
      if (row) return { wins: row.wins || 0, losses: row.losses || 0, ties: row.ties || 0 };
    }
  }
  const team = league.teams.find((t) => t.id === teamId);
  if (team?.season) return { wins: team.season.wins || 0, losses: team.season.losses || 0, ties: team.season.ties || 0 };
  return null;
}

function divisionWinner(league, year, conference, division) {
  const rows = league.teams
    .filter((t) => t.conference === conference && t.division === division)
    .map((t) => ({ teamId: t.id, ...(finalWinsFor(league, year, t.id) || { wins: 0, losses: 0, ties: 0 }) }));
  if (!rows.length) return null;
  const best = Math.max(...rows.map((r) => r.wins + r.ties * 0.5));
  const leaders = rows.filter((r) => r.wins + r.ties * 0.5 === best);
  return { leaders: leaders.map((r) => r.teamId), wins: best };
}

function scrimmageYards(seasonLine) {
  return (seasonLine?.rushing?.yards || 0) + (seasonLine?.receiving?.yards || 0);
}

// ── Prediction builder ───────────────────────────────────────────────────────

/**
 * Build the preseason capsule. Call once per startSeason, after team ratings
 * are recalculated. Never advances the caller's RNG stream.
 */
export function buildPreseasonPredictions({ league, year, controlledTeamId, seedState }) {
  const rng = new RNG(((seedState >>> 0) ^ ((year * 2654435761) >>> 0)) >>> 0);
  const ranked = teamsByRating(league);
  const predictions = [];

  // 1 — Champion pick: weighted among the top 3 rated teams.
  const champPool = ranked.slice(0, 3);
  const champPick = champPool[rng.weightedPick({ 0: 5, 1: 3, 2: 2 })] || ranked[0];
  predictions.push({
    id: "champion",
    kind: "champion",
    subject: { teamId: champPick.id },
    text: `${champPick.name} hoist the trophy in February. Book it.`
  });

  // 2 — Division lock: the division with the widest #1→#2 rating gap.
  let lock = null;
  const divisions = new Map();
  for (const team of league.teams) {
    const key = `${team.conference}|${team.division}`;
    if (!divisions.has(key)) divisions.set(key, []);
    divisions.get(key).push(team);
  }
  for (const [key, teams] of divisions) {
    if (teams.length < 2) continue;
    const sorted = [...teams].sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
    const gap = (sorted[0].overallRating || 0) - (sorted[1].overallRating || 0);
    if (!lock || gap > lock.gap) {
      const [conference, division] = key.split("|");
      lock = { team: sorted[0], conference, division, gap };
    }
  }
  if (lock) {
    predictions.push({
      id: "division-lock",
      kind: "division-lock",
      subject: { teamId: lock.team.id, conference: lock.conference, division: lock.division },
      text: `The ${lock.conference} ${lock.division} is not a race — ${lock.team.name} in a walk.`
    });
  }

  // 3 — Controlled team record window.
  const yourTeam = league.teams.find((t) => t.id === controlledTeamId) || ranked[Math.floor(ranked.length / 2)];
  const yourRank = ranked.findIndex((t) => t.id === yourTeam.id) + 1;
  const proj = projectedWins(yourRank, ranked.length);
  predictions.push({
    id: "team-window",
    kind: "team-window",
    subject: { teamId: yourTeam.id, projWins: proj, low: Number((proj - 1.5).toFixed(1)), high: Number((proj + 1.5).toFixed(1)) },
    text: `${yourTeam.name} land between ${Math.max(0, Math.round(proj - 1.5))} and ${Math.round(proj + 1.5)} wins. The roster is what the rating says it is.`
  });

  // 4 — Breakout call: young, high-potential skill player (controlled team preferred).
  const skill = new Set(["QB", "RB", "WR", "TE"]);
  const candidatePool = (teamId) =>
    getTeamPlayers(league, teamId)
      .filter((p) => skill.has(p.position) && (p.age || 30) <= 25 && (p.potential || 0) >= 78)
      .sort((a, b) => (b.potential || 0) - (a.potential || 0));
  let breakoutTeamId = yourTeam.id;
  let candidates = candidatePool(breakoutTeamId);
  if (!candidates.length) {
    for (const team of ranked) {
      candidates = candidatePool(team.id);
      if (candidates.length) {
        breakoutTeamId = team.id;
        break;
      }
    }
  }
  if (candidates.length) {
    const pick = candidates[rng.int(0, Math.min(2, candidates.length - 1))];
    const threshold = pick.position === "QB" ? 3400 : pick.position === "RB" ? 950 : 850;
    const metric = pick.position === "QB" ? "passing yards" : "scrimmage yards";
    predictions.push({
      id: "breakout",
      kind: "breakout",
      subject: { playerId: pick.id, playerName: pick.name, teamId: breakoutTeamId, position: pick.position, threshold, metric },
      text: `Circle the name: ${pick.name} (${pick.position}, ${teamName(league, breakoutTeamId)}) clears ${threshold.toLocaleString()} ${metric} this year.`
    });
  }

  // 5 — Surprise team: mid-pack roster called to 9+ wins.
  const midPack = ranked.slice(Math.floor(ranked.length / 2), Math.floor(ranked.length * 0.85));
  if (midPack.length) {
    const sleeper = midPack[rng.int(0, midPack.length - 1)];
    predictions.push({
      id: "surprise",
      kind: "surprise",
      subject: { teamId: sleeper.id, winsTarget: 9 },
      text: `Sleeper alert: ${sleeper.name} win 9 or more and nobody outside this column sees it coming.`
    });
  }

  return { year, predictions, graded: null };
}

// ── Grader ───────────────────────────────────────────────────────────────────

/**
 * Grade the capsule against real season outcomes. Call in the postseason
 * phase after champions + history for `year` are recorded. Idempotent.
 */
export function gradeTimeCapsule({ league, statBook, year }) {
  const capsule = league.timeCapsule;
  if (!capsule || capsule.year !== year) return null;
  if (capsule.graded) return capsule.graded;

  const champion = (league.champions || []).find((c) => c.year === year);
  const receipts = [];

  for (const pred of capsule.predictions) {
    let verdict = "miss";
    let evidence = "";

    if (pred.kind === "champion") {
      if (champion?.championTeamId === pred.subject.teamId) {
        verdict = "hit";
        evidence = `${teamName(league, pred.subject.teamId)} won it all.`;
      } else if (champion?.runnerUpTeamId === pred.subject.teamId) {
        verdict = "push";
        evidence = `${teamName(league, pred.subject.teamId)} lost the big one — one game short of genius.`;
      } else {
        evidence = `${teamName(league, champion?.championTeamId || "")} took the trophy instead.`;
      }
    } else if (pred.kind === "division-lock") {
      const result = divisionWinner(league, year, pred.subject.conference, pred.subject.division);
      if (result?.leaders.includes(pred.subject.teamId)) {
        verdict = result.leaders.length === 1 ? "hit" : "push";
        evidence =
          result.leaders.length === 1
            ? `${teamName(league, pred.subject.teamId)} took the division at ${result.wins} wins.`
            : `${teamName(league, pred.subject.teamId)} tied for the division lead.`;
      } else if (result) {
        evidence = `${result.leaders.map((id) => teamName(league, id)).join(" / ")} owned the division instead.`;
      }
    } else if (pred.kind === "team-window") {
      const final = finalWinsFor(league, year, pred.subject.teamId);
      if (final) {
        const wins = final.wins + final.ties * 0.5;
        const dist = Math.abs(wins - pred.subject.projWins);
        if (dist <= 1.5) verdict = "hit";
        else if (dist <= 2.5) verdict = "push";
        evidence = `Final: ${final.wins}–${final.losses}${final.ties ? `–${final.ties}` : ""} against a ${pred.subject.projWins}-win projection.`;
      }
    } else if (pred.kind === "breakout") {
      const player = statBook?.getPlayerById?.(pred.subject.playerId);
      const line = player?.seasonStats?.[year] || null;
      const yards =
        pred.subject.position === "QB" ? line?.passing?.yards || 0 : scrimmageYards(line);
      if (yards >= pred.subject.threshold) verdict = "hit";
      else if (yards >= pred.subject.threshold * 0.75) verdict = "push";
      evidence = `${pred.subject.playerName} finished with ${Math.round(yards).toLocaleString()} ${pred.subject.metric}.`;
    } else if (pred.kind === "surprise") {
      const final = finalWinsFor(league, year, pred.subject.teamId);
      if (final) {
        const wins = final.wins + final.ties * 0.5;
        if (wins >= pred.subject.winsTarget) verdict = "hit";
        else if (wins >= pred.subject.winsTarget - 1) verdict = "push";
        evidence = `${teamName(league, pred.subject.teamId)} finished ${final.wins}–${final.losses}${final.ties ? `–${final.ties}` : ""}.`;
      }
    }

    receipts.push({ id: pred.id, kind: pred.kind, verdict, text: pred.text, evidence });
  }

  const hits = receipts.filter((r) => r.verdict === "hit").length;
  const pushes = receipts.filter((r) => r.verdict === "push").length;
  const misses = receipts.length - hits - pushes;
  const graded = {
    year,
    hits,
    pushes,
    misses,
    receipts,
    reporterVerdict: pickLine(VERDICT_BANK[verdictKey(hits + pushes * 0.5, receipts.length)], year)
  };

  capsule.graded = graded;
  if (!Array.isArray(league.timeCapsuleLedger)) league.timeCapsuleLedger = [];
  league.timeCapsuleLedger.push({ year, hits, pushes, misses });
  if (league.timeCapsuleLedger.length > LEDGER_MAX) {
    league.timeCapsuleLedger = league.timeCapsuleLedger.slice(-LEDGER_MAX);
  }
  return graded;
}
