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
import { getLastPress, recordPress } from "./continuityLedger.js";
import { topGamePerformer } from "../stats/gameImpact.js";
import { openPressQuestion, getLastPressResponse } from "./pressRoom.js";

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

// ── Continuity follow-ups (S29) — the room remembers last week's podium ──────
// Keyed by transition from last week's tone/result to this week's result.

const FOLLOWUP_QUOTES = {
  "promise-kept": [
    (ctx) => `"I stood here last week and told you it wouldn't happen again. ${ctx.score}. It didn't. This locker room answers."`,
    (ctx) => `"Monday I promised a response. That ${ctx.score} against ${ctx.opponent} — that's the response. Hold me to the next one too."`
  ],
  "promise-broken": [
    (ctx) => `"I told you last week this wouldn't happen again, and it did. That's on me. No excuses left in this podium — only work."`,
    (ctx) => `"You can replay my quote from last week. I own every word of it. Two in a row after a promise like that means everything gets reviewed, starting with me."`
  ],
  humbled: [
    (ctx) => `"A week ago I called us a statement team. ${ctx.opponent} just made a statement of their own. That's the league reminding us who we have to be every single week."`,
    (ctx) => `"I was up here talking about who we are after last week's win. Credit ${ctx.opponent} — they read the quote and took it personally."`
  ]
};

/**
 * Which follow-up the room opens with.
 *
 * `lastResponse` is the GM's own answer from last week's podium (S63) and always
 * wins when present: these quote banks say "I stood here last week and told
 * you", and until the GM could actually speak, that line was attributed to words
 * the player never said. The engine-tone path below remains for weeks the GM
 * skipped or for saves that predate the interactive podium.
 */
function followupKey(lastPress, isWin, lastResponse = null) {
  if (lastResponse) {
    if (lastResponse.promised) return isWin ? "promise-kept" : "promise-broken";
    if (lastResponse.isWin && lastResponse.posture === "demanding" && !isWin) return "humbled";
    return null;
  }
  if (!lastPress) return null;
  const promised = !lastPress.isWin && (lastPress.tone === "fiery" || lastPress.tone === "disappointed");
  if (promised && isWin) return "promise-kept";
  if (promised && !isWin) return "promise-broken";
  if (lastPress.isWin && lastPress.tone === "confident" && !isWin) return "humbled";
  return null;
}

const ANALYST_QUOTES = [
  (ctx) => `"Looking at the numbers: ${ctx.topPerformer ? `${ctx.topPerformer} was our most efficient player` : "the unit held its own"}. The matchup advantage we identified pre-game played out. Film tells you what the score doesn't."`,
  (ctx) => `"Tactically, we wanted to attack their secondary early. ${ctx.isWin ? "It worked." : "We didn't execute it cleanly."} The adjustments at halftime ${ctx.isWin ? "were the difference" : "came too late"}."`
];

// ── Pick a deterministic quote using game seed ─────────────────────────────────

/**
 * FNV-1a over the full quote key.
 *
 * The original seed was `gameId.charCodeAt(0) + gameId.charCodeAt(3) + slot`.
 * Every team code is three characters, so `charCodeAt(3)` was always the hyphen
 * in `${home}-${away}-${week}` and `charCodeAt(0)` was the home team's first
 * letter — the week never entered the seed at all. `BUF-NYJ-3`, `BUF-NYJ-11` and
 * `BUF-MIA-7` all produced seed 111, which is index 0 in every bank. The result
 * was that a franchise saw exactly one quote per tone for its entire history:
 * twelve authored quotes collapsed to five.
 *
 * Determinism was the right goal — replays must stay byte-identical — but it has
 * to come from a hash that actually reads its input.
 */
function quoteHash(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function pickQuote(bank, quoteKey, slot) {
  return bank[quoteHash(`${quoteKey}|${slot}`) % bank.length];
}

function pressConferenceId(item, gameId, slot) {
  return `pc-${item.subtype}-${item.year}-${item.week}-${gameId}-${slot}`.replace(/[^a-z0-9_-]+/gi, "-");
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

  // Find the top performer from the game's real box score.
  //
  // This used to read `game.playerStats[controlledTeamId]`, a shape the simulator
  // has never produced — the returned game object carries no `playerStats` key at
  // all, and the real rows live at `game.boxScore.playerStats.{home,away}` grouped
  // by category. `gameStats` was therefore always undefined, `topPerformer` was
  // always null, and six of the twelve quote templates silently took their
  // degraded branch: "The whole unit showed up." instead of naming the player who
  // actually won the game. It now shares the box score's own impact authority, so
  // the podium and the MVP ballot agree.
  const topPerformer =
    topGamePerformer(game.boxScore, { teamId: controlledTeamId })?.player || null;

  const tone = getTone(margin, isWin, streak);
  const ctx  = { opponent, score, isWin, margin, topPerformer, week };
  const gameId = `${game.homeTeamId}-${game.awayTeamId}-${week}`;
  // The quote key carries every dimension that should vary the room: which game,
  // which season, which week, and what mood the coach is in.
  const quoteKey = `${gameId}|${year}|${week}|${tone}|${isWin ? "W" : "L"}`;

  const headCoachQ = pickQuote(QUOTES[tone], quoteKey, 0)(ctx);
  const analystQ   = pickQuote(ANALYST_QUOTES, quoteKey, 1)(ctx);

  // Continuity: does the room remember something from last week's podium?
  // The GM's own answer takes precedence over the engine's inferred tone.
  const lastPress = getLastPress(league, { year, week });
  const lastResponse = getLastPressResponse(league, { year, week });
  const fKey = followupKey(lastPress, isWin, lastResponse);

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

  if (fKey) {
    items.unshift({
      type: "press-conference",
      subtype: "follow-up",
      tone: fKey === "promise-kept" ? "confident" : fKey === "promise-broken" ? "fiery" : "humble",
      week,
      year,
      headline: `Week ${week} Post-Game: The Room Remembers (${fKey.replace(/-/g, " ")})`,
      quote: pickQuote(FOLLOWUP_QUOTES[fKey], quoteKey, 2)(ctx),
      teamIds: [controlledTeamId],
      score,
      isWin,
      continuity: fKey
    });
  }

  items.forEach((item, index) => {
    league.newsLog.unshift({
      ...item,
      id: pressConferenceId(item, gameId, index)
    });
    if (league.newsLog.length > 50) league.newsLog.length = 50;
  });

  // Remember this podium for next week's room.
  recordPress(league, { year, week, tone, isWin, opponent, score });

  // S63 — and open the question the GM actually gets to answer. The room asks
  // once per controlled-team game; an unanswered question simply expires when
  // the next one opens, which is its own kind of answer.
  openPressQuestion(league, {
    teamId: controlledTeamId,
    year,
    week,
    isWin,
    margin,
    streak,
    opponent,
    score,
    topPerformer
  });
}
