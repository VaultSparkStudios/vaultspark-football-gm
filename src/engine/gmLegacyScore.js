/**
 * GM Legacy Score — Persistent Career Arc Rating
 *
 * Tracks the user GM's performance across seasons with a composite
 * score that persists in league.gmLegacy. Shown on the overview hero.
 *
 * Dimensions:
 *   Win%          — 40 pts max
 *   Playoff rate  — 25 pts max
 *   Super Bowl rate — 25 pts max
 *   Cap efficiency — 5 pts max (from capGrade per season)
 *   Culture health — 5 pts max (from team chemistry)
 *
 * Grade scale: A+ (90+) → A → B+ → B → B- → C+ → C
 * Label: Dynasty Builder, Perennial Contender, Competitive, Developing, Rebuilding
 */

const GM_ID = "player";

// ── Init ──────────────────────────────────────────────────────────────────────

export function initGmLegacy(league) {
  if (!league.gmLegacy) {
    league.gmLegacy = {
      gmId: GM_ID,
      seasonsServed: 0,
      totalWins: 0,
      totalLosses: 0,
      playoffAppearances: 0,
      superBowlWins: 0,
      capGradeTotal: 0,
      cultureGradeTotal: 0,
      tradeNetAV: 0,
      seasonHistory: []
    };
  }
  return league.gmLegacy;
}

// ── Season update ─────────────────────────────────────────────────────────────

export function updateGmLegacyAfterSeason(league, controlledTeamId, year) {
  const legacy = initGmLegacy(league);
  const team = league.teams.find((t) => t.id === controlledTeamId);
  if (!team) return legacy;

  const wins = team.season?.wins || 0;
  const losses = team.season?.losses || 0;
  const madePlayoffs = !!(team.season?.playoffSeed || team.season?.playoffExit);
  const wonSuperBowl =
    (league.champions || []).slice(-1)[0] === controlledTeamId ||
    (league.champions || []).includes(controlledTeamId) &&
      (league.currentYear || year) === year;

  // Cap efficiency: high usage + low dead cap = good
  const capHardLimit = 224_800_000;
  const activeCap = team.cap?.activeCap || 0;
  const deadCap = team.cap?.deadCap || 0;
  const capUsagePct = capHardLimit > 0 ? activeCap / capHardLimit : 0.8;
  const deadCapRatio = activeCap > 0 ? deadCap / activeCap : 0;
  const capGrade = Math.round(Math.min(100, Math.max(0, capUsagePct * 70 - deadCapRatio * 40 + 20)));

  // Culture health from chemistry
  const chemistry = team.chemistry || 70;
  const cultureGrade = Math.round(Math.min(100, Math.max(0, (chemistry - 50) * 2 + 50)));

  legacy.seasonsServed += 1;
  legacy.totalWins += wins;
  legacy.totalLosses += losses;
  if (madePlayoffs) legacy.playoffAppearances += 1;
  if (wonSuperBowl) legacy.superBowlWins += 1;
  legacy.capGradeTotal += capGrade;
  legacy.cultureGradeTotal += cultureGrade;

  const seasonScore = _computeSeasonScore({ wins, losses, madePlayoffs, wonSuperBowl, capGrade, cultureGrade });
  legacy.seasonHistory.push({ year, score: seasonScore, wins, losses, madePlayoffs, wonSuperBowl, capGrade, cultureGrade });
  if (legacy.seasonHistory.length > 30) legacy.seasonHistory.shift();

  return legacy;
}

function _computeSeasonScore({ wins, losses, madePlayoffs, wonSuperBowl, capGrade, cultureGrade }) {
  const winScore = Math.min(50, wins * 2.9);
  const playoffBonus = madePlayoffs ? 10 : 0;
  const sbBonus = wonSuperBowl ? 25 : 0;
  const capScore = capGrade * 0.1;
  const cultureScore = cultureGrade * 0.05;
  return Math.round(winScore + playoffBonus + sbBonus + capScore + cultureScore);
}

// ── Score computation ─────────────────────────────────────────────────────────

export function computeGmLegacyScore(legacy) {
  if (!legacy || legacy.seasonsServed === 0) {
    return { score: 0, grade: "—", label: "No seasons logged", seasons: 0 };
  }

  const seasons = legacy.seasonsServed;
  const winPct = legacy.totalWins / Math.max(1, legacy.totalWins + legacy.totalLosses);
  const playoffRate = legacy.playoffAppearances / seasons;
  const sbRate = legacy.superBowlWins / seasons;
  const avgCap = legacy.capGradeTotal / seasons;
  const avgCulture = legacy.cultureGradeTotal / seasons;

  const winScore    = winPct     * 40;   // max 40
  const playoffScore = playoffRate * 25; // max 25
  const sbScore      = sbRate     * 25;  // max 25
  const capScore     = avgCap     * 0.05; // max 5
  const cultureScore = avgCulture * 0.05; // max 5

  const raw = Math.round(winScore + playoffScore + sbScore + capScore + cultureScore);
  const score = Math.min(100, Math.max(0, raw));

  const grade =
    score >= 90 ? "A+" : score >= 82 ? "A" : score >= 75 ? "A-" :
    score >= 68 ? "B+" : score >= 60 ? "B"  : score >= 53 ? "B-" :
    score >= 47 ? "C+" : score >= 40 ? "C"  : "C-";

  const label =
    score >= 85 ? "Dynasty Builder" :
    score >= 70 ? "Perennial Contender" :
    score >= 55 ? "Competitive GM" :
    score >= 40 ? "Developing" : "Rebuilding";

  return {
    score,
    grade,
    label,
    wins: legacy.totalWins,
    losses: legacy.totalLosses,
    winPct: winPct.toFixed(3),
    playoffs: legacy.playoffAppearances,
    superBowls: legacy.superBowlWins,
    seasons,
    recentHistory: (legacy.seasonHistory || []).slice(-5)
  };
}

// ── UI summary ────────────────────────────────────────────────────────────────

export function getGmLegacySummary(league) {
  const legacy = league.gmLegacy;
  if (!legacy) return null;
  return computeGmLegacyScore(legacy);
}
