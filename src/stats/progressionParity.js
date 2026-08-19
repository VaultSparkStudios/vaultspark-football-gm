const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

/**
 * S91 — the gated population is **rostered players**, not every non-retired one.
 *
 * This gate exists to catch league-wide talent drift, and until S91 it measured
 * `status !== "retired"`: the ~2,180 players on club rosters blended with the
 * unrostered free-agent pool. That pool is unbounded — intake runs ~290/season
 * against ~200 retirements — and by season 12 it holds 466 players at mean
 * overall 66.9 and mean age 29.1. Its size is therefore a free parameter that
 * can cancel any amount of rostered inflation in the blended mean.
 *
 * That is not hypothetical; it is what happened. Measured over 12 seasons:
 *
 *   rostered mean overall   76.90 -> 77.97   (+1.07, i.e. +0.089/season)
 *   blended mean overall    76.90 -> 76.04   (-0.86, i.e. -0.072/season)
 *
 * The blended figure is the -0.073 S90 certified as steady state. It was two
 * errors of opposite sign cancelling — the third time this project has shipped
 * that exact shape, and the second time inside a gate built to prevent it. The
 * league the GM actually competes in was inflating the whole time.
 *
 * The pool is still measured and reported, in `population.unrostered`. It is
 * simply no longer allowed to vote on whether the league is calibrated.
 */
export const LEAGUE_PROGRESSION_PARITY_TARGET = Object.freeze({
  version: "2026-s91-rostered-distribution",
  metric: "rostered-player mean overall annual drift",
  onTargetMaxAbs: 0.15,
  watchMaxAbs: 0.3,
  roomOnTargetMaxAbs: 0.35,
  roomWatchMaxAbs: 0.6,
  minimumRoomSample: 20
});

/**
 * S91 — the distributional gate.
 *
 * Every gate this project owned was a **mean** gate, and the S91 headline defect
 * moves no mean: `developmentDelta` had no mean reversion, so ratings random-walk
 * away from potential while the median sits still. Measured on the fixed rostered
 * denominator over 12 seasons, mean moved 76.90 -> 77.97 and the median not at
 * all, while 90+ density went 0.32% -> 4.03% — a 12.6x rise that population
 * growth cannot explain, and that `annualMeanOverallDrift` cannot see.
 *
 * **Two readings, not one, and deliberately so.** Dispersion drift catches a
 * walk in progress; elite density catches the state it produces. They do not
 * fail together: measured, sd rises 4.50 -> 6.69 by season 6 and then falls back
 * to 5.99 by season 12, because selection compresses the distribution's left
 * side while the walk extends its right — it skews rather than widens. Dispersion
 * alone goes quiet after season 8 while the elite tail is still climbing. Either
 * statistic on its own would call this league calibrated.
 */
export const LEAGUE_DISTRIBUTION_TARGET = Object.freeze({
  version: "2026-s91-distribution",
  metric: "rostered-player overall dispersion and elite density",
  /** Annual growth in the standard deviation of rostered overall. */
  stdDevDriftOnTargetMaxAbs: 0.08,
  stdDevDriftWatchMaxAbs: 0.15,
  /**
   * Share of rostered players at 90+ overall.
   *
   * **Provenance: judgement, not measurement — and recorded as such on purpose.**
   * This project has no NFL elite-density baseline anywhere in `src/data`, so
   * unlike `LEAGUE_AVERAGE_POTENTIAL` (rescued in S71) or the S90 development
   * centres, this ceiling cannot be measured from an authority. It is set from
   * the observed behaviour of the engine itself: a generated league opens at
   * 0.32% and the pre-fix simulation carried it to 4.03% over 12 seasons, so a
   * ceiling in this band separates "holds its shape" from "runs away" without
   * claiming a precision nobody here has earned.
   *
   * Two things a later session must not do with this number. Do not treat it as
   * measured truth — that is exactly how a literal rots into a subsidy, three
   * times now in this repo. And do not tune the engine until it goes green: the
   * honest use of a judgement ceiling is to report `watch` and disclose the
   * residual, which is what S91 does.
   *
   * The unresolved question underneath it is whether 0.32% at season 0 is itself
   * right. Five 90+ players across 32 clubs is a very flat league to start from,
   * and if the generator is wrong then both ends of this measurement are. Fixing
   * that needs a real baseline, and a real baseline is the follow-up S91 books
   * rather than fakes.
   */
  elite90PlusPctCeiling: 1.6,
  elite90PlusPctWatchCeiling: 2.4,
  elite90PlusPctProvenance: "judgement-not-measured",
  minimumSample: 200
});

export const POSITION_ROOMS = Object.freeze([
  Object.freeze({ room: "Quarterback", positions: Object.freeze(["QB"]) }),
  Object.freeze({ room: "Backfield", positions: Object.freeze(["RB"]) }),
  Object.freeze({ room: "Receivers", positions: Object.freeze(["WR", "TE"]) }),
  Object.freeze({ room: "Offensive Line", positions: Object.freeze(["OL"]) }),
  Object.freeze({ room: "Front Seven", positions: Object.freeze(["DL", "LB"]) }),
  Object.freeze({ room: "Secondary", positions: Object.freeze(["DB"]) }),
  Object.freeze({ room: "Specialists", positions: Object.freeze(["K", "P"]) })
]);

function expectedDevelopment(player, developmentProfile) {
  const age = Number(player?.age || 0);
  const ageFactor = age <= 25
    ? developmentProfile.ageFactors.developing25AndUnder
    : age <= 29
      ? developmentProfile.ageFactors.prime26To29
      : developmentProfile.ageFactors.veteran30Plus;
  return Number(ageFactor) + (Number(player?.potential || developmentProfile.potentialCenter) - developmentProfile.potentialCenter) / 20;
}

export function buildRosterWindowMap(roster = [], developmentProfile) {
  if (!developmentProfile?.ageFactors) throw new TypeError("A declared development profile is required.");
  const groups = POSITION_ROOMS.map(({ room, positions }) => {
    const players = roster.filter((player) => positions.includes(player.pos || player.position));
    const average = (selector) => players.length ? players.reduce((sum, player) => sum + selector(player), 0) / players.length : 0;
    const projectedDelta = round(average((player) => expectedDevelopment(player, developmentProfile)), 2);
    const expiring = players.filter((player) => Number(player.contract?.yearsRemaining || 0) <= 1).length;
    const window = projectedDelta >= 0.25 ? "ascending" : projectedDelta <= -0.5 ? "aging" : "balanced";
    const priority = window === "aging"
      ? expiring ? "Succession + contract decision" : "Draft a successor"
      : window === "ascending"
        ? "Protect the runway"
        : expiring >= 2
          ? "Contract decisions"
          : "Stable room";
    const standardBearer = players.slice().sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0))[0] || null;
    return {
      room,
      positions: positions.join("/"),
      count: players.length,
      meanOverall: round(average((player) => Number(player.overall || 0)), 1),
      meanPotential: round(average((player) => Number(player.potential || 0)), 1),
      meanAge: round(average((player) => Number(player.age || 0)), 1),
      projectedDelta,
      window,
      expiring,
      developing: players.filter((player) => Number(player.age) <= 25).length,
      prime: players.filter((player) => Number(player.age) >= 26 && Number(player.age) <= 29).length,
      veteran: players.filter((player) => Number(player.age) >= 30).length,
      standardBearer: standardBearer ? `${standardBearer.name} (${standardBearer.overall})` : "—",
      priority
    };
  }).filter((group) => group.count > 0);
  return {
    profileVersion: developmentProfile.version,
    generatedFromPlayers: roster.length,
    groups,
    agingRooms: groups.filter((group) => group.window === "aging").map((group) => group.room),
    ascendingRooms: groups.filter((group) => group.window === "ascending").map((group) => group.room)
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cohort(players, predicate) {
  const rows = players.filter(predicate);
  return {
    count: rows.length,
    sharePct: players.length ? round((rows.length / players.length) * 100, 1) : 0,
    meanOverall: rows.length ? round(rows.reduce((sum, player) => sum + Number(player.overall), 0) / rows.length) : 0
  };
}

function summarizePlayers(players) {
  const overalls = players.map((player) => Number(player.overall));
  const mean = overalls.length ? overalls.reduce((sum, value) => sum + value, 0) / overalls.length : 0;
  // Population standard deviation, at 3 decimals: the gate reads season-over-
  // season *changes* in this number, and 1-decimal rounding would quantise a
  // real 0.08/season drift into noise.
  const stdDevOverall = overalls.length
    ? round(Math.sqrt(overalls.reduce((sum, value) => sum + (value - mean) ** 2, 0) / overalls.length), 3)
    : 0;
  return {
    count: players.length,
    meanOverall: round(mean),
    medianOverall: round(median(overalls)),
    stdDevOverall,
    elite90Plus: overalls.filter((value) => value >= 90).length,
    elite90PlusPct: overalls.length ? round((overalls.filter((value) => value >= 90).length / overalls.length) * 100, 1) : 0
  };
}

/**
 * Active players split by whether they are on a club roster.
 *
 * The split is the point (see `LEAGUE_PROGRESSION_PARITY_TARGET`): the gated
 * statistics come from `rostered`, and `unrostered` is reported so the pool is
 * visible rather than either hidden or silently averaged in.
 */
export function splitActivePopulation(league) {
  const teamIds = new Set((league?.teams || []).map((team) => team?.id));
  const active = (league?.players || []).filter(
    (player) => player?.status !== "retired" && Number.isFinite(Number(player?.overall)) && Number.isFinite(Number(player?.age))
  );
  return {
    active,
    rostered: active.filter((player) => teamIds.has(player?.teamId)),
    unrostered: active.filter((player) => !teamIds.has(player?.teamId))
  };
}

export function summarizeLeagueProgression(league) {
  const { active, rostered, unrostered } = splitActivePopulation(league);
  // The gated population. If a league has no teams at all — a fixture, or a
  // caller that built players without a structure — fall back to the active set
  // rather than reporting a zeroed league as calibrated.
  const players = rostered.length ? rostered : active;
  const summary = summarizePlayers(players);
  return {
    population: {
      basis: rostered.length ? "rostered" : "active-fallback",
      rostered: summarizePlayers(rostered),
      unrostered: summarizePlayers(unrostered),
      blended: summarizePlayers(active)
    },
    stdDevOverall: summary.stdDevOverall,
    playerCount: summary.count,
    meanOverall: summary.meanOverall,
    medianOverall: summary.medianOverall,
    elite90Plus: summary.elite90Plus,
    elite90PlusPct: summary.elite90PlusPct,
    meanAge: players.length ? round(players.reduce((sum, player) => sum + Number(player.age), 0) / players.length) : 0,
    rooms: POSITION_ROOMS.map(({ room, positions }) => ({
      room,
      positions: positions.join("/"),
      ...summarizePlayers(players.filter((player) => positions.includes(player.pos || player.position)))
    })),
    cohorts: {
      developing25AndUnder: cohort(players, (player) => Number(player.age) <= 25),
      prime26To29: cohort(players, (player) => Number(player.age) >= 26 && Number(player.age) <= 29),
      veteran30Plus: cohort(players, (player) => Number(player.age) >= 30)
    }
  };
}

function classifyDrift(absoluteDrift, onTargetMaxAbs, watchMaxAbs) {
  return absoluteDrift <= onTargetMaxAbs
    ? "on-target"
    : absoluteDrift <= watchMaxAbs
      ? "watch"
      : "out-of-range";
}

function classifyCeiling(value, onTargetCeiling, watchCeiling) {
  return value <= onTargetCeiling ? "on-target" : value <= watchCeiling ? "watch" : "out-of-range";
}

const WORST = { "out-of-range": 3, watch: 2, incomplete: 1, "on-target": 0 };
const worstOf = (...statuses) =>
  statuses.reduce((worst, next) => (WORST[next] > WORST[worst] ? next : worst), "on-target");

/**
 * The S91 distributional gate — see `LEAGUE_DISTRIBUTION_TARGET`.
 *
 * Two independent readings, because they fail in different ways. Dispersion
 * drift catches a diffusion *in progress* (the sd climbing season over season);
 * elite density catches the *state* it produces (a league where 4% of rostered
 * players are 90+). A fix that damped the walk but left the league already
 * inflated would pass the first and fail the second, and it should.
 */
export function buildDistributionReceipt({ start, end, observedSeasons }) {
  const target = LEAGUE_DISTRIBUTION_TARGET;
  const startCount = Number(start?.population?.rostered?.count ?? start?.playerCount ?? 0);
  const endCount = Number(end?.population?.rostered?.count ?? end?.playerCount ?? 0);
  const adequateSample = startCount >= target.minimumSample && endCount >= target.minimumSample;

  const startStdDev = Number(start?.stdDevOverall ?? start?.population?.rostered?.stdDevOverall ?? 0);
  const endStdDev = Number(end?.stdDevOverall ?? end?.population?.rostered?.stdDevOverall ?? 0);
  const annualStdDevDrift = adequateSample ? round((endStdDev - startStdDev) / Math.max(1, observedSeasons), 3) : null;
  const elite90PlusPct = Number(end?.elite90PlusPct ?? end?.population?.rostered?.elite90PlusPct ?? 0);

  const dispersionStatus = adequateSample
    ? classifyDrift(Math.abs(annualStdDevDrift), target.stdDevDriftOnTargetMaxAbs, target.stdDevDriftWatchMaxAbs)
    : "incomplete";
  const eliteStatus = adequateSample
    ? classifyCeiling(elite90PlusPct, target.elite90PlusPctCeiling, target.elite90PlusPctWatchCeiling)
    : "incomplete";

  return {
    status: worstOf(dispersionStatus, eliteStatus),
    dispersionStatus,
    eliteStatus,
    adequateSample,
    minimumSample: target.minimumSample,
    startStdDevOverall: round(startStdDev, 3),
    endStdDevOverall: round(endStdDev, 3),
    annualStdDevDrift,
    startElite90PlusPct: Number(start?.elite90PlusPct ?? 0),
    endElite90PlusPct: elite90PlusPct,
    target
  };
}

export function buildProgressionParityReceipt({ start, end, seasons, seed, developmentProfile }) {
  const observedSeasons = Math.max(1, Number(seasons) || 1);
  const annualMeanOverallDrift = round((Number(end?.meanOverall || 0) - Number(start?.meanOverall || 0)) / observedSeasons, 3);
  const globalStatus = classifyDrift(
    Math.abs(annualMeanOverallDrift),
    LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs,
    LEAGUE_PROGRESSION_PARITY_TARGET.watchMaxAbs
  );
  const distribution = buildDistributionReceipt({ start, end, observedSeasons });
  const startRooms = new Map((start?.rooms || []).map((room) => [room.room, room]));
  const endRooms = new Map((end?.rooms || []).map((room) => [room.room, room]));
  const rooms = POSITION_ROOMS.map(({ room, positions }) => {
    const startRoom = startRooms.get(room) || null;
    const endRoom = endRooms.get(room) || null;
    const minimumSample = LEAGUE_PROGRESSION_PARITY_TARGET.minimumRoomSample;
    const adequateSample = Number(startRoom?.count || 0) >= minimumSample && Number(endRoom?.count || 0) >= minimumSample;
    const annualRoomDrift = adequateSample
      ? round((Number(endRoom.meanOverall) - Number(startRoom.meanOverall)) / observedSeasons, 3)
      : null;
    return {
      room,
      positions: positions.join("/"),
      status: adequateSample
        ? classifyDrift(
            Math.abs(annualRoomDrift),
            LEAGUE_PROGRESSION_PARITY_TARGET.roomOnTargetMaxAbs,
            LEAGUE_PROGRESSION_PARITY_TARGET.roomWatchMaxAbs
          )
        : "incomplete",
      adequateSample,
      minimumSample,
      annualMeanOverallDrift: annualRoomDrift,
      annualMedianOverallDrift: adequateSample
        ? round((Number(endRoom.medianOverall) - Number(startRoom.medianOverall)) / observedSeasons, 3)
        : null,
      elite90PlusChange: adequateSample ? Number(endRoom.elite90Plus) - Number(startRoom.elite90Plus) : null,
      start: startRoom,
      end: endRoom
    };
  });
  const roomStatuses = rooms.map((room) => room.status);
  // S91 — `distribution.status` is a first-class input to the verdict. A league
  // whose mean holds while its variance runs away is not calibrated, and before
  // S91 there was no reading in this receipt that could say so.
  const status = roomStatuses.includes("out-of-range") || globalStatus === "out-of-range" || distribution.status === "out-of-range"
    ? "out-of-range"
    : roomStatuses.includes("incomplete")
      ? "incomplete"
      : roomStatuses.includes("watch") || globalStatus === "watch" || distribution.status === "watch"
        ? "watch"
        : "on-target";
  return {
    status,
    globalStatus,
    distribution,
    observedSeasons,
    seed: Number(seed),
    annualMeanOverallDrift,
    target: LEAGUE_PROGRESSION_PARITY_TARGET,
    developmentProfile,
    start,
    end,
    rooms,
    roomSummary: {
      onTarget: roomStatuses.filter((value) => value === "on-target").length,
      watch: roomStatuses.filter((value) => value === "watch").length,
      outOfRange: roomStatuses.filter((value) => value === "out-of-range").length,
      incomplete: roomStatuses.filter((value) => value === "incomplete").length
    },
    roomAlerts: rooms
      .filter((room) => room.status !== "on-target")
      .map((room) => ({ room: room.room, status: room.status, annualMeanOverallDrift: room.annualMeanOverallDrift }))
  };
}
export function appendProgressionHistory(history = [], progression, generatedAt = Date.now()) {
  if (!progression || !Number.isFinite(Number(progression.seed))) {
    throw new TypeError("A progression receipt with a finite seed is required.");
  }
  const entry = {
    generatedAt: Number(generatedAt),
    seed: Number(progression.seed),
    observedSeasons: Number(progression.observedSeasons),
    status: progression.status,
    globalStatus: progression.globalStatus,
    distributionStatus: progression.distribution?.status || "incomplete",
    annualStdDevDrift: progression.distribution?.annualStdDevDrift ?? null,
    elite90PlusPct: progression.distribution?.endElite90PlusPct ?? null,
    annualMeanOverallDrift: progression.annualMeanOverallDrift,
    rooms: (progression.rooms || []).map((room) => ({
      room: room.room,
      status: room.status,
      annualMeanOverallDrift: room.annualMeanOverallDrift
    }))
  };
  return [...(Array.isArray(history) ? history : []), entry].slice(-5);
}
/**
 * Scan numeric simulation state without laundering NaN/Infinity into zero.
 * Traversal is bounded and cycle-safe; a truncated scan is never called a pass.
 *
 * S91 — the budget was 4,000,000 nodes and a simulated decade now exceeds it.
 * That is growth, not corruption: a 10-season league accumulates a season-stats
 * record per player per year, and the S91 camp-cuts fix moves more players into
 * the unrostered population, so the same decade carries more nodes than it did.
 * The scan reported `incomplete` with `issueCount: 0` — behaving exactly as
 * designed, since a bounded scan that cannot finish is never called a pass.
 *
 * Raising the ceiling is therefore the honest remedy and not a force-green: the
 * guard was reporting that it ran out of budget, not that the league was clean.
 * Leaving it would have converted a real integrity check into a permanent
 * `incomplete`, which is the same as deleting it. Measured, a 10-season league
 * scans ~4.1M nodes, so the budget is set to 12M — enough headroom for a decade
 * to keep growing without the check quietly stopping doing its job.
 */
export function scanFiniteSimulationState({ league, statBook }, { maxNodes = 12_000_000, maxIssues = 12 } = {}) {
  const issues = [];
  const seen = new WeakSet();
  let inspectedNodes = 0;
  let inspectedNumbers = 0;
  let truncated = false;

  const visit = (value, path) => {
    if (truncated || issues.length >= maxIssues) return;
    inspectedNodes += 1;
    if (inspectedNodes > maxNodes) {
      truncated = true;
      return;
    }
    if (typeof value === "number") {
      inspectedNumbers += 1;
      if (!Number.isFinite(value)) issues.push({ path, kind: Number.isNaN(value) ? "NaN" : "Infinity" });
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, `${path}.${key}`);
  };

  const criticalLeagueState = {
    players: league?.players,
    retiredPlayers: league?.retiredPlayers,
    teams: league?.teams,
    schedule: league?.schedule,
    champions: league?.champions,
    awards: league?.awards,
    hallOfFame: league?.hallOfFame,
    draftHistory: league?.draftHistory
  };
  visit(criticalLeagueState, "league");
  visit(
    {
      teamSeasonArchive: statBook?.teamSeasonArchive,
      warehouse: statBook?.warehouse
    },
    "statBook"
  );

  return {
    status: issues.length ? "fail" : truncated ? "incomplete" : "pass",
    scannedRoots: [
      "league.players",
      "league.retiredPlayers",
      "league.teams",
      "league.schedule",
      "league.champions",
      "league.awards",
      "league.hallOfFame",
      "league.draftHistory",
      "statBook.teamSeasonArchive",
      "statBook.warehouse"
    ],
    inspectedNodes,
    inspectedNumbers,
    truncated,
    issueCount: issues.length,
    issues
  };
}
