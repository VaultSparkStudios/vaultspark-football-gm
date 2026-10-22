import { DIFFICULTY_PRESETS } from "../config/leagueSetup.js";
import { recordWinPct } from "../stats/teamRecord.js";

/**
 * Adaptive League difficulty (S70) — opt-in, bounded, and announced.
 *
 * When league.settings.adaptiveDifficulty is true, the end of each season
 * compares the controlled GM's rolling two-season win% against neutral bands
 * and nudges exactly two market-pressure levers — CPU trade aggression and
 * contract demand — within a hard band around the chosen preset's baseline.
 * Every shift is deterministic (no RNG), receipted in a bounded log, and
 * announced in league news. Opting out leaves settings untouched.
 */

const AGGRESSION_BAND = 0.15;
const DEMAND_BAND = 0.1;
const AGGRESSION_STEP = 0.05;
const DEMAND_STEP = 0.03;
const LOG_LIMIT = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function computeAdaptiveNudge({ settings, seasonHistory }) {
  if (!settings?.adaptiveDifficulty) return null;
  const history = Array.isArray(seasonHistory) ? seasonHistory.slice(-2) : [];
  if (history.length < 2) return null;
  const wins = history.reduce((sum, row) => sum + (Number(row.wins) || 0), 0);
  const losses = history.reduce((sum, row) => sum + (Number(row.losses) || 0), 0);
  const ties = history.reduce((sum, row) => sum + (Number(row.ties) || 0), 0);
  const games = wins + losses + ties;
  if (!games) return null;
  const winPct = recordWinPct({ wins, losses, ties });
  const direction = winPct >= 0.65 ? 1 : winPct <= 0.35 ? -1 : 0;

  const base = DIFFICULTY_PRESETS[settings.difficultyPreset]?.patch || DIFFICULTY_PRESETS.standard.patch;
  const currentAggression = Number(settings.cpuTradeAggression ?? base.cpuTradeAggression);
  const currentDemand = Number(settings.contractDemandMultiplier ?? base.contractDemandMultiplier);

  const targetAggression = direction === 0
    ? currentAggression
    : round3(clamp(
        currentAggression + direction * AGGRESSION_STEP,
        clamp(base.cpuTradeAggression - AGGRESSION_BAND, 0, 1),
        clamp(base.cpuTradeAggression + AGGRESSION_BAND, 0, 1)
      ));
  const targetDemand = direction === 0
    ? currentDemand
    : round3(clamp(
        currentDemand + direction * DEMAND_STEP,
        base.contractDemandMultiplier - DEMAND_BAND,
        base.contractDemandMultiplier + DEMAND_BAND
      ));

  if (targetAggression === currentAggression && targetDemand === currentDemand) return null;
  return {
    winPct: round3(winPct),
    direction,
    cpuTradeAggression: targetAggression,
    contractDemandMultiplier: targetDemand
  };
}

export function applyAdaptiveDifficultyAfterSeason(session) {
  const league = session?.league;
  const settings = league?.settings;
  const nudge = computeAdaptiveNudge({ settings, seasonHistory: league?.gmLegacy?.seasonHistory });
  if (!nudge) return null;

  settings.cpuTradeAggression = nudge.cpuTradeAggression;
  settings.contractDemandMultiplier = nudge.contractDemandMultiplier;

  const receipt = {
    year: session.currentYear,
    winPct: nudge.winPct,
    direction: nudge.direction,
    cpuTradeAggression: nudge.cpuTradeAggression,
    contractDemandMultiplier: nudge.contractDemandMultiplier
  };
  if (!Array.isArray(league.adaptiveDifficultyLog)) league.adaptiveDifficultyLog = [];
  league.adaptiveDifficultyLog.push(receipt);
  league.adaptiveDifficultyLog = league.adaptiveDifficultyLog.slice(-LOG_LIMIT);

  session.logNews(
    nudge.direction > 0
      ? "The league adjusts: rival front offices are circling your success"
      : "The league adjusts: rival pressure eases while you rebuild",
    { kind: "adaptive-difficulty", ...receipt }
  );
  return receipt;
}
