/**
 * Press Conference Quotes — Post-Game Narrative Generator
 *
 * Generates 2–3 coach/GM quote cards from game result data.
 * Pure template-based — deterministic from game state, no AI required.
 * Results are pushed to league.newsLog as type:"press-conference" items.
 *
 * Triggered after each controlled-team game.
 * Quote tones: "confident" | "disappointed" | "analytical" | "fiery" | "humble"
 */

import { initNewsLog } from "./beatReporter.js";

// ── Tone assignment ────────────────────────────────────────────────────────────

function getTone(margin, isWin, streak) {
  if (isWin && margin >= 21) return "confident";
  if (isWin && streak >= 3)  return "confident";
  if (!isWin && margin >= 21) return "disappointed";
  if (!isWin && streak <= -3) return "fiery";
  if (isWin && margin <= 3)   return "humble";
  if (!isWin && margin <= 3)  return "analytical";
  return isWin ? "humble" : "analytical";
}

// ── Quote banks ────────────────────────────────────────────────────────────────

const QUOTES = {
  confident: [
    (ctx) => `"We came to play football and we did exactly that. ${ctx.topPerformer ? `${ctx.topPerformer} was the difference — that's an elite performance.` : "The whole unit showed up."} This is what we've been building toward."`,
    (ctx) => `"${ctx.score} — that's a statement. Division teams know who we are now. We're not surprised. We expected to win."`,
    (ctx) => `"Credit to the guys. I said before the week that we'd control the line of scrimmage and we did. ${ctx.topPerformer ? `${ctx.topPerformer} is playing at a different level right now.` : ""} Onto next week."`
  ],
  disappointed: [
    (ctx) => `"There's no way to sugarcoat a loss like this. ${ctx.opponent} was the better team today. We'll watch the film, find out why, and fix it. That's the only response that matters."`,
    (ctx) => `"We let this one slip. Our execution wasn't where it needs to be. I take responsibility for the preparation — this won't happen again."`,
    (ctx) => `"${ctx.score}. That doesn't reflect who we want to be. We have the players. Something went wrong at the scheme level and I own that."`
  ],
  analytical: [
    (ctx) => `"Close game. There were three or four plays that swung it. That's the margin in this league. ${ctx.topPerformer ? `${ctx.topPerformer} gave us a chance` : "We gave ourselves a chance"} — we just didn't finish."`,
    (ctx) => `"Honestly, both teams played well. The scoreboard is what it is. I look at the underlying execution — there are areas to be proud of and areas to fix."`,
    (ctx) => `"One possession game. This league comes down to situational football. We have to be better in the red zone and on third downs. That's fixable."`
  ],
  fiery: [
    (ctx) => `"This is unacceptable. ${ctx.opponent} wanted it more than us today. I'll say it plainly: that can not happen again. I expect more. This organisation demands more."`,
    (ctx) => `"Four in a row. That's a pattern. We need to look in the mirror — players, coaches, everyone. I'm not going to accept this. Something has to change and it starts Monday."`,
    (ctx) => `"I'll be in film review until midnight. There are answers in that tape. We'll find them and we'll be back. This group is better than a ${ctx.score} scoreline."`
  ],
  humble: [
    (ctx) => `"A win is a win in this league. ${ctx.opponent} is a well-coached team — they made it tough. We found a way in the fourth and that's a mark of a resilient locker room."`,
    (ctx) => `"We'll take it. It wasn't our cleanest performance but we showed some heart. ${ctx.topPerformer ? `${ctx.topPerformer} made the key play when we needed it.` : "Somebody stepped up when it mattered."}"`,
    (ctx) => `"No moral victories in this sport, but I'll give our guys credit — they competed for sixty minutes. We'll clean up the film and keep stacking wins."`
  ]
};

const ANALYST_QUOTES = [
  (ctx) => `"Looking at the numbers: ${ctx.topPerformer ? `${ctx.topPerformer} was our most efficient player` : "the unit held its own"}. The matchup advantage we identified pre-game played out. Film tells you what the score doesn't."`,
  (ctx) => `"Tactically, we wanted to attack their secondary early. ${ctx.isWin ? "It worked." : "We didn't execute it cleanly."} The adjustments at halftime ${ctx.isWin ? "were the difference" : "came too late"}."`
];

// ── Pick a deterministic quote using game seed ─────────────────────────────────

function pickQuote(bank, gameId, slot) {
  const seed = (gameId?.charCodeAt?.(0) || 0) + (gameId?.charCodeAt?.(3) || 0) + slot;
  return bank[seed % bank.length];
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Generate press conference items for the controlled team's game this week.
 *
 * @param {object} league
 * @param {object} weekResult   — from GameSession.advanceWeek()
 * @param {string} controlledTeamId
 * @param {number} year
 */
export function generatePressConference(league, weekResult, controlledTeamId, year) {
  if (!weekResult?.games || !controlledTeamId) return;
  initNewsLog(league);

  const game = weekResult.games.find(
    (g) => g.homeTeamId === controlledTeamId || g.awayTeamId === controlledTeamId
  );
  if (!game) return;

  const isHome   = game.homeTeamId === controlledTeamId;
  const myScore  = isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
  const theirScore = isHome ? (game.awayScore ?? 0) : (game.homeScore ?? 0);
  const opponent = isHome ? game.awayTeamId : game.homeTeamId;
  const isWin    = myScore > theirScore;
  const margin   = Math.abs(myScore - theirScore);
  const score    = `${myScore}–${theirScore}`;
  const week     = weekResult.week;

  // Streak from team season state
  const team   = league.teams?.find((t) => t.id === controlledTeamId);
  const streak = team?.season?.streak || 0;

  // Find top performer from game stats (best by fantasy proxy: QB yards, RB yards, etc.)
  let topPerformer = null;
  const gameStats = game.playerStats?.[controlledTeamId] || game.stats?.[controlledTeamId];
  if (gameStats) {
    const candidates = Object.values(gameStats).filter((s) => s?.name);
    const top = candidates.sort((a, b) => {
      const scoreA = (a.passingYards || 0) * 0.04 + (a.rushingYards || 0) * 0.1 + (a.receivingYards || 0) * 0.1 + (a.touchdowns || 0) * 6;
      const scoreB = (b.passingYards || 0) * 0.04 + (b.rushingYards || 0) * 0.1 + (b.receivingYards || 0) * 0.1 + (b.touchdowns || 0) * 6;
      return scoreB - scoreA;
    })[0];
    topPerformer = top?.name || null;
  }

  const tone = getTone(margin, isWin, streak);
  const ctx  = { opponent, score, isWin, margin, topPerformer, week };
  const gameId = `${game.homeTeamId}-${game.awayTeamId}-${week}`;

  const headCoachQ = pickQuote(QUOTES[tone], gameId, 0)(ctx);
  const analystQ   = pickQuote(ANALYST_QUOTES, gameId, 1)(ctx);

  const items = [
    {
      type: "press-conference",
      subtype: "head-coach",
      tone,
      week,
      year,
      headline: `${isWin ? "Win" : "Loss"} vs ${opponent} — Week ${week} Post-Game: Head Coach`,
      quote: headCoachQ,
      teamIds: [controlledTeamId],
      score,
      isWin
    },
    {
      type: "press-conference",
      subtype: "gm-analyst",
      tone: "analytical",
      week,
      year,
      headline: `${isWin ? "Win" : "Loss"} vs ${opponent} — Week ${week} Post-Game: GM Analysis`,
      quote: analystQ,
      teamIds: [controlledTeamId],
      score,
      isWin
    }
  ];

  for (const item of items) {
    league.newsLog.unshift({
      ...item,
      id: `pc-${item.subtype}-${week}-${year}-${Math.random().toString(36).slice(2, 6)}`
    });
    if (league.newsLog.length > 50) league.newsLog.length = 50;
  }
}
