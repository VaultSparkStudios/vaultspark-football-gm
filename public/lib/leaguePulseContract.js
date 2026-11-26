// League Pulse (shown to players as the "Gridiron Census"): anonymous league-wide totals, shared by the browser and the
// community service so the two can never disagree about what may be sent.
//
// A pulse is a bag of counters. It carries no identifier of any kind, no
// timestamp finer than the day the service receives it, no team, player or
// league name, and nothing a save contains. The service adds each counter to a
// daily total and keeps nothing else: no row per browser, no address.

export const LEAGUE_PULSE_SCHEMA_VERSION = "pulse-1";

// Every counter, with the most one pulse may add. A browser sends at most one
// pulse per page visit plus one per finished season, so a cap is the largest
// honest value from a single visit; anything above it is refused, not clipped,
// so a forged pulse cannot ride in on a real one.
export const LEAGUE_PULSE_METRICS = Object.freeze({
  // First steps: where a visit gets to.
  gameLoaded: 1,          // the game page finished loading
  returningLoad: 1,       // ...and this browser already had a franchise
  leagueCreated: 4,       // a new franchise was set up
  firstWeekPlayed: 4,     // a new franchise played its first game week
  // Football totals, all franchises together.
  gamesPlayed: 400,       // controlled-club games simulated (weeks advanced)
  seasonsCompleted: 30,
  playersDrafted: 120,    // picks the player made in a draft
  championships: 30,
  hallOfFamers: 40,       // Hall of Fame inductees who played for the player's club
  tradesMade: 120,
  freeAgentsSigned: 200,
  activeMinutes: 240,     // minutes with the game visible, rounded to 5
  // S133 scenario board: which job a franchise took (its franchise archetype),
  // and the titles won in it. Same counters, keyed by scenario; still no ID.
  scenarioRebuildStarts: 4,
  scenarioRebuildTitles: 30,
  scenarioCapHellStarts: 4,
  scenarioCapHellTitles: 30,
  scenarioAgingCoreStarts: 4,
  scenarioAgingCoreTitles: 30,
  scenarioNoQbStarts: 4,
  scenarioNoQbTitles: 30
});

/** The four one-click scenarios, by franchise archetype, for the scenario board. */
export const LEAGUE_PULSE_SCENARIOS = Object.freeze([
  Object.freeze({ archetype: "rebuild", key: "Rebuild", label: "Rebuild" }),
  Object.freeze({ archetype: "cap-hell", key: "CapHell", label: "Cap Hell" }),
  Object.freeze({ archetype: "aging-core", key: "AgingCore", label: "Aging Core" }),
  Object.freeze({ archetype: "no-qb", key: "NoQb", label: "No Quarterback" })
]);

/** The scenario a franchise archetype belongs to, or null for any other job. */
export function pulseScenarioFor(archetype) {
  return LEAGUE_PULSE_SCENARIOS.find((s) => s.archetype === String(archetype || "")) || null;
}

export const LEAGUE_PULSE_METRIC_KEYS = Object.freeze(Object.keys(LEAGUE_PULSE_METRICS));

/** Public names for the totals, for the stats page and the landing ticker. */
export const LEAGUE_PULSE_LABELS = Object.freeze({
  gameLoaded: "Game sessions",
  returningLoad: "Returning sessions",
  leagueCreated: "Franchises founded",
  firstWeekPlayed: "Franchises that kicked off",
  gamesPlayed: "Games played",
  seasonsCompleted: "Seasons completed",
  playersDrafted: "Players drafted",
  championships: "Championships won",
  hallOfFamers: "Hall of Famers developed",
  tradesMade: "Trades made",
  freeAgentsSigned: "Free agents signed",
  activeMinutes: "Minutes managed",
  scenarioRebuildStarts: "Rebuild jobs taken",
  scenarioRebuildTitles: "Rebuild titles",
  scenarioCapHellStarts: "Cap Hell jobs taken",
  scenarioCapHellTitles: "Cap Hell titles",
  scenarioAgingCoreStarts: "Aging Core jobs taken",
  scenarioAgingCoreTitles: "Aging Core titles",
  scenarioNoQbStarts: "No Quarterback jobs taken",
  scenarioNoQbTitles: "No Quarterback titles"
});

/**
 * The only shape a pulse may have. Returns the counters to add, or null when
 * anything about the payload is off: an unknown key, a non-integer, a negative
 * value, a value over its cap, or an empty pulse.
 */
export function normalizeLeaguePulse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.schemaVersion !== LEAGUE_PULSE_SCHEMA_VERSION) return null;
  const counts = payload.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null;
  const extraTopLevel = Object.keys(payload).filter((key) => key !== "schemaVersion" && key !== "counts");
  if (extraTopLevel.length) return null;
  const out = {};
  for (const [key, value] of Object.entries(counts)) {
    if (!Object.hasOwn(LEAGUE_PULSE_METRICS, key)) return null;
    if (!Number.isSafeInteger(value) || value < 0 || value > LEAGUE_PULSE_METRICS[key]) return null;
    if (value > 0) out[key] = value;
  }
  if (out.returningLoad && !out.gameLoaded) return null;
  return Object.keys(out).length ? out : null;
}

/** An empty set of totals, every metric at zero. */
export function emptyLeaguePulseTotals() {
  return Object.fromEntries(LEAGUE_PULSE_METRIC_KEYS.map((key) => [key, 0]));
}
