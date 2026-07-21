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
  if ((legacy.seasonHistory || []).some((entry) => Number(entry.year) === Number(year))) return legacy;

  const wins = team.season?.wins || 0;
  const losses = team.season?.losses || 0;
  const madePlayoffs = !!(team.season?.playoffSeed || team.season?.playoffExit);
  const latestChampion = (league.champions || [])
    .slice()
    .reverse()
    .find((entry) => typeof entry !== "object" || entry == null || Number(entry.year ?? year) === Number(year));
  const championTeamId = resolveChampionTeamId(latestChampion);
  const wonSuperBowl = championTeamId === controlledTeamId;

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
  legacy.seasonHistory.push({
    year,
    teamId: controlledTeamId,
    championTeamId,
    score: seasonScore,
    wins,
    losses,
    madePlayoffs,
    wonSuperBowl,
    capGrade,
    cultureGrade
  });
  if (legacy.seasonHistory.length > 30) legacy.seasonHistory.shift();

  return legacy;
}

export function resolveChampionTeamId(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  return entry.championTeamId || entry.teamId || entry.champion || null;
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

// ── GM Persona Tier Arc ───────────────────────────────────────────────────────
//
// Tier progression based on cumulative legacy score and career milestones.
// Each tier unlocks narrative flavour and owner treatment.
//
//   1. Young Gun         — first 3 seasons OR score < 40
//   2. Contender Builder — score 40–54  OR 1+ playoff appearance
//   3. Proven GM         — score 55–67  OR 2+ playoff appearances
//   4. Dynasty Architect — score 68–79  OR 4+ playoffs / 1+ Super Bowl
//   5. Legend            — score 80–89  OR 3+ Super Bowls
//   6. Immortal          — score 90+    OR 5+ Super Bowls

const TIER_DEFS = [
  {
    tier: 1,
    name: "Young Gun",
    scoreMin: 0,
    description: "Still finding your footing. The league is watching — but hasn't made up its mind.",
    ownerTreatment: "Patience mode. Owner is supportive but expectant.",
    unlocks: []
  },
  {
    tier: 2,
    name: "Contender Builder",
    scoreMin: 40,
    description: "You've put together a competitive team. Playoffs are the new baseline expectation.",
    ownerTreatment: "Owner demands postseason appearances. Missing two straight triggers reviews.",
    unlocks: ["extended_contract_offer"]
  },
  {
    tier: 3,
    name: "Proven GM",
    scoreMin: 55,
    description: "A track record of winning. Equivalent free-agent offers carry real destination pull.",
    ownerTreatment: "Recognition: the board describes your tenure as proven, without changing hidden owner math.",
    unlocks: ["fa_discount", "extended_contract_offer"]
  },
  {
    tier: 4,
    name: "Dynasty Architect",
    scoreMin: 68,
    description: "You are building something special. The franchise is a destination, not a doormat.",
    ownerTreatment: "Recognition: the owner publicly backs your football judgment.",
    unlocks: ["fa_discount", "extended_contract_offer", "owner_deference"]
  },
  {
    tier: 5,
    name: "Legend",
    scoreMin: 80,
    description: "Multiple championships. Your name is spoken alongside the all-time greats.",
    ownerTreatment: "Recognition: the owner presents you as a franchise partner.",
    unlocks: ["fa_discount", "extended_contract_offer", "owner_deference", "legend_badge"]
  },
  {
    tier: 6,
    name: "Immortal",
    scoreMin: 90,
    description: "No franchise has done what you've done. History will remember this era forever.",
    ownerTreatment: "Recognition: lifetime-tenure and stadium honors enter the career narrative.",
    unlocks: ["fa_discount", "extended_contract_offer", "owner_deference", "legend_badge", "immortal_aura"]
  }
];

export function getGmPersonaTier(legacy) {
  if (!legacy || legacy.seasonsServed === 0) return TIER_DEFS[0];
  const computed = computeGmLegacyScore(legacy);
  const score = computed.score;
  const superBowls = legacy.superBowlWins || 0;
  const playoffs = legacy.playoffAppearances || 0;
  const seasons = legacy.seasonsServed || 0;

  // Override tier by milestone achievements
  if (superBowls >= 5 || score >= 90)            return TIER_DEFS[5];
  if (superBowls >= 3 || score >= 80)            return TIER_DEFS[4];
  if (playoffs >= 4 || superBowls >= 1 || score >= 68) return TIER_DEFS[3];
  if (playoffs >= 2 || score >= 55)              return TIER_DEFS[2];
  if (playoffs >= 1 || score >= 40 || seasons >= 3)    return TIER_DEFS[1];
  return TIER_DEFS[0];
}

export function getGmPersonaArc(legacy) {
  if (!legacy) return null;
  const current = getGmPersonaTier(legacy);
  const next = TIER_DEFS[current.tier] || null; // tier is 1-indexed
  const computed = computeGmLegacyScore(legacy);
  const effectiveScore = Math.max(computed.score, current.scoreMin);
  const span = next ? Math.max(1, next.scoreMin - current.scoreMin) : 1;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((effectiveScore - current.scoreMin) / span) * 100)))
    : 100;
  const benefits = getGmBenefits(legacy);

  return {
    current: {
      tier: current.tier,
      name: current.name,
      description: current.description,
      ownerTreatment: current.ownerTreatment,
      unlocks: current.unlocks,
      scoreFloor: current.scoreMin,
      entitlements: benefits.entitlements
    },
    next: next ? {
      tier: next.tier,
      name: next.name,
      scoreNeeded: next.scoreMin,
      scoreTarget: next.scoreMin,
      threshold: next.scoreMin,
      gapToNext: Math.max(0, next.scoreMin - effectiveScore)
    } : null,
    score: computed.score,
    grade: computed.grade,
    progressPct,
    progressSource: computed.score < current.scoreMin ? "milestone-floor" : "score",
    benefits
  };
}

const ENTITLEMENT_DEFS = Object.freeze({
  extended_contract_offer: Object.freeze({
    id: "extended_contract_offer",
    kind: "recognition",
    label: "Board tenure recognition",
    description: "The career ledger recognizes the board's longer-term confidence; no hidden contract mechanic is claimed."
  }),
  fa_discount: Object.freeze({
    id: "fa_discount",
    kind: "mechanic",
    label: "Destination pull",
    description: "Equivalent controlled-team free-agent offers receive +4 market-score points.",
    freeAgencyOfferBonus: 4
  }),
  owner_deference: Object.freeze({
    id: "owner_deference",
    kind: "recognition",
    label: "Owner backing",
    description: "The career card records public owner backing; owner heat remains source-derived from team results."
  }),
  legend_badge: Object.freeze({
    id: "legend_badge",
    kind: "mechanic",
    label: "Legend crest",
    description: "The General Manager identity card receives the earned Legend crest.",
    badge: "legend"
  }),
  immortal_aura: Object.freeze({
    id: "immortal_aura",
    kind: "mechanic",
    label: "Immortal crest",
    description: "The General Manager identity card upgrades to the earned Immortal crest.",
    badge: "immortal"
  })
});

export function getGmBenefits(legacy) {
  const tier = getGmPersonaTier(legacy);
  const entitlements = (tier.unlocks || [])
    .map((id) => ENTITLEMENT_DEFS[id])
    .filter(Boolean)
    .map((entry) => ({ ...entry }));
  const freeAgencyOfferBonus = entitlements.reduce(
    (sum, entry) => sum + Number(entry.freeAgencyOfferBonus || 0),
    0
  );
  const badge = entitlements
    .map((entry) => entry.badge)
    .filter(Boolean)
    .slice(-1)[0] || null;
  return {
    tier: tier.tier,
    freeAgencyOfferBonus,
    badge,
    entitlements
  };
}

// ── GM Reputation Profile ─────────────────────────────────────────────────────
//
// Derives 3 reputation labels from career data that CPU teams react to.
// Labels are shown on the GM Identity Card and the Trade Workspace.
//
// Categories:
//   trade-style   → Aggressive Buyer | Patient Rebuilder | Balanced Trader
//   cap-style     → Cap Hawk | Spender | Cap Neutral
//   culture-style → Youth Builder | Veteran Loyalty | Culture Neutral
//
// CPU multipliers (used in aiTeamStrategy.js):
//   Aggressive Buyer  → asks +8%   Spender → asks +5%
//   Cap Hawk          → asks -4%   Youth Builder → asks -3% on young players

export function buildGmReputationProfile(legacy) {
  if (!legacy || legacy.seasonsServed === 0) {
    return {
      tradeStyle: "Unestablished",
      capStyle: "Unestablished",
      cultureStyle: "Unestablished",
      labels: ["Reputation: not yet established"],
      multiplier: 1.0
    };
  }

  const avgCapGrade = legacy.seasonsServed > 0 ? legacy.capGradeTotal / legacy.seasonsServed : 50;
  const avgCulture = legacy.seasonsServed > 0 ? legacy.cultureGradeTotal / legacy.seasonsServed : 50;
  const tradeNetAV = legacy.tradeNetAV || 0;

  const tradeStyle =
    tradeNetAV < -10 ? "Aggressive Buyer" :
    tradeNetAV > 10  ? "Asset Accumulator" : "Balanced Trader";

  const capStyle =
    avgCapGrade >= 70 ? "Cap Hawk" :
    avgCapGrade <= 40 ? "Spender" : "Cap Neutral";

  const cultureStyle =
    avgCulture >= 70 ? "Culture Builder" :
    avgCulture <= 40 ? "Culture Risk" : "Culture Neutral";

  // Trade ask multiplier: aggressive buyers pay more; cap hawks get slight discount
  let multiplier = 1.0;
  if (tradeStyle === "Aggressive Buyer") multiplier += 0.08;
  if (tradeStyle === "Asset Accumulator") multiplier -= 0.04;
  if (capStyle === "Cap Hawk") multiplier -= 0.04;
  if (capStyle === "Spender") multiplier += 0.05;
  multiplier = Math.max(0.85, Math.min(1.20, multiplier));

  return {
    tradeStyle,
    capStyle,
    cultureStyle,
    labels: [tradeStyle, capStyle, cultureStyle],
    multiplier: parseFloat(multiplier.toFixed(3))
  };
}

// ── UI summary ────────────────────────────────────────────────────────────────

export function getGmLegacySummary(league) {
  const legacy = league.gmLegacy;
  if (!legacy) return null;
  const score = computeGmLegacyScore(legacy);
  return { ...score, persona: getGmPersonaArc(legacy) };
}
