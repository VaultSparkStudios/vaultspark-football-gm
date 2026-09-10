import { NFL_ELITE_DENSITY_BASELINE } from "../data/nflEliteDensityBaseline.js";

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
/**
 * S104 — the denominator stopped moving. Read all of this before proposing to
 * change or re-point this population; it carries the S102/S103 history that
 * explains why the obvious move is the wrong one.
 *
 * **The question S102 asked and S103 answered was the wrong question.** It was
 * put as a choice: is the league this gate polices the one the GM competes in
 * (`activeRosterOnly`), or the one the roster rules define (`rostered`)? S103
 * showed `rostered` failed a prior test — a drift statistic requires a
 * population that exists at both ends of its window, and a generated league was
 * built at 49 players a club with an EMPTY practice squad, filling to 69 over
 * the following decade. It then measured the re-point at +0.303/season,
 * `out-of-range` against `watchMaxAbs`, and correctly refused to buy it with a
 * threshold change.
 *
 * What neither session tested is that **`activeRosterOnly` fails the same prior
 * test, mirrored.** If the club holds 49 players at the start of the window and
 * 69 at the end, then the active roster is an *unfiltered* 49 at one end and
 * the *top 53 of 69* at the other: it silently acquires a selection filter it
 * did not have. That is why it read 0.303. Neither candidate was a valid drift
 * statistic, and choosing between them could not have produced one.
 *
 * The defect was never the choice of population. It was that the league was
 * generated 20 players a club below its own steady state. S104 generates it at
 * the structure the rules declare — `ROSTER_TEMPLATE` now sums to the 53-man
 * active limit and `PRACTICE_SQUAD_TEMPLATE` to the 16-man practice squad — and
 * `FULL_ROSTER_TEMPLATE` holds clubs there as a floor rather than only as a
 * ceiling. Measured on seed 20260306 over ten seasons, the same canonical path
 * `realism-career-regression` asserts on:
 *
 *                          before S104          after S104
 *   rostered population    1568 -> 2178         2208 -> 2183
 *   practice-squad weight  0% -> 22.7%          23.2% -> 22.7%
 *   within-group drift     +0.269  watch        +0.040  on-target
 *   between-group drift    -0.197               +0.003
 *   blended (gated)        +0.072  on-target    +0.044  on-target
 *   activeRosterOnly       +0.303  out-of-range +0.107  on-target
 *
 * The between-group term — the entire S91/S102/S103 shape, three sessions of
 * two effects with opposite signs cancelling inside a gate built to catch
 * exactly that — is now +0.003. `buildCompositionShift` reports
 * `development-dominated` rather than `verdict-changed-by-composition`, and it
 * keeps its fixture-driven negative controls in
 * `test/session102-gated-population.test.js` so the detector is still proved to
 * fire against the pre-S104 shape.
 *
 * **The population is still `rostered`, and that is now a decision rather than
 * an inheritance.** Both candidates are valid drift statistics at last, so the
 * question is no longer forced — and `rostered` reads +0.038 to +0.063 across
 * seeds against an `onTargetMaxAbs` of 0.15, where `activeRosterOnly` reads
 * +0.102 to +0.115. Re-pointing would move a declared target for no measured
 * reason and trade a comfortable margin for a tight one. The contrast stays
 * published, ungated, in `activeRosterMeanOverallDrift`.
 *
 * What did NOT come out clean, and is the honest cost of this fix: the
 * distribution gate's dispersion arm moved from `on-target` to `watch`
 * (+0.095/season on this path, +0.105 and +0.111 on the two probed seeds,
 * against `stdDevDriftOnTargetMaxAbs` 0.08). That reading is not a regression
 * this session caused — it is the same artefact seen from the other side. The
 * old `on-target` was produced by the active roster's selection filter
 * *strengthening* across the window (an unfiltered 49 becoming the top 53 of
 * 69), which compresses measured dispersion exactly as the underlying spread
 * widens. With the filter constant, the arm reports the S91 random-walk it was
 * built to find. Do not close it by widening `stdDevDrift*`; it is a real
 * reading of a real defect that now has nowhere to hide.
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
  version: "2026-s92-nfl-sourced-distribution",
  metric: "active-roster overall dispersion and elite density",
  /** Annual growth in the standard deviation of rostered overall. */
  stdDevDriftOnTargetMaxAbs: 0.08,
  stdDevDriftWatchMaxAbs: 0.15,
  /**
   * Share of players at 90+ overall, measured on the **active roster only**
   * (`population.activeRosterOnly`) — not `population.rostered`, which blends
   * the active roster with the practice squad.
   *
   * **Provenance: sourced from real NFL honors, not judgement.** See
   * `src/data/nflEliteDensityBaseline.js` for the full derivation. In short:
   * AP First-Team All-Pro (26 seats, the tightest honor the league gives) and
   * the Pro Bowl (88 seats, the broader "very good this season" honor), both
   * divided by the real NFL's active-roster population (53 x 32 = 1,696) that
   * both honors are drawn from and that neither honor's population includes a
   * practice squad. This replaces the S91 `judgement-not-measured` ceiling,
   * which had no external authority to anchor to.
   *
   * S91 also measured elite density on `population.rostered` — active roster
   * blended with the 16-per-club practice squad (`ROSTER_STRUCTURE`, S89) —
   * which is not the population either real honor is drawn from. Practice-
   * squad players are structurally ineligible for All-Pro or the Pro Bowl, so
   * dividing a real-honors anchor by a population that includes them is the
   * same denominator-mismatch shape as the free-agent-pool defect S91 fixed
   * one level up. `buildDistributionReceipt` now reads elite density from
   * `population.activeRosterOnly` where a caller supplies it, falling back to
   * `population.rostered` for older callers/fixtures that do not.
   *
   * This is still an analogy, not an identity — a real-world performance
   * honor is not the same measurement as a declared talent rating — which is
   * why the ceiling is the tight All-Pro anchor and the watch line is the
   * looser Pro Bowl anchor, a band rather than a false-precision point.
   */
  elite90PlusPctCeiling: NFL_ELITE_DENSITY_BASELINE.firstTeamAllProPct,
  elite90PlusPctWatchCeiling: NFL_ELITE_DENSITY_BASELINE.proBowlPct,
  elite90PlusPctProvenance: NFL_ELITE_DENSITY_BASELINE.provenance,
  eliteDensityBaseline: NFL_ELITE_DENSITY_BASELINE,
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
  const rostered = active.filter((player) => teamIds.has(player?.teamId));
  // S92 — same convention `GameSession`/`capCompliance` use elsewhere
  // (`(player.rosterSlot || "active") === "active"`): a player with no
  // `rosterSlot` set (older fixtures, hand-built test players) defaults to
  // the active roster rather than silently vanishing from either bucket.
  return {
    active,
    rostered,
    unrostered: active.filter((player) => !teamIds.has(player?.teamId)),
    activeRosterOnly: rostered.filter((player) => (player?.rosterSlot || "active") === "active"),
    practiceSquad: rostered.filter((player) => (player?.rosterSlot || "active") === "practice")
  };
}

export function summarizeLeagueProgression(league) {
  const { active, rostered, unrostered, activeRosterOnly, practiceSquad } = splitActivePopulation(league);
  // The gated population for the PARITY target, which declares itself as
  // "rostered-player mean overall annual drift" — so `rostered` is what it is
  // supposed to measure, and it still is. See `LEAGUE_PROGRESSION_PARITY_TARGET`
  // for why S103 decided the re-point on evidence and still did not ship it.
  //
  // If a league has no teams at all — a fixture, or a caller that built players
  // without a structure — fall back to the active set rather than reporting a
  // zeroed league as calibrated.
  const players = rostered.length ? rostered : active;
  const basis = rostered.length ? "rostered" : "active-fallback";
  const summary = summarizePlayers(players);
  return {
    population: {
      basis,
      rostered: summarizePlayers(rostered),
      unrostered: summarizePlayers(unrostered),
      blended: summarizePlayers(active),
      // S92 — the population the distributional gate's elite-density reading
      // is now measured on. See `LEAGUE_DISTRIBUTION_TARGET` for why: real
      // NFL All-Pro/Pro Bowl honors are drawn from the active roster only,
      // and blending in the practice squad (structurally ineligible for
      // either honor) understates density against that anchor.
      activeRosterOnly: summarizePlayers(activeRosterOnly),
      practiceSquad: summarizePlayers(practiceSquad)
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

/**
 * Annual drift between two mean readings, or null when either is unusable.
 *
 * Used by the reported arms. The gated arm above keeps its own inline form
 * deliberately: it must produce a number for `classifyDrift` under every input,
 * where a reported arm is allowed to say "incomplete" and does. The difference
 * is a real one, not an oversight — but it is the kind of difference that rots,
 * so it is written down here rather than left to be rediscovered.
 */
function driftBetween(startMean, endMean, observedSeasons) {
  const a = Number(startMean);
  const b = Number(endMean);
  const seasons = Number(observedSeasons);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(seasons) || seasons <= 0) return null;
  return round((b - a) / seasons, 3);
}

/**
 * S103 — why a mean drift on a mixed population can be a lie, stated as a number.
 *
 * This project has now shipped the same defect three times, in three different
 * gates, and each time the fix was to name the right population. Naming a
 * population is a one-off; this is the recurring check.
 *
 * A blended mean is `sum over groups of weight * mean`. It can move for two
 * completely different reasons: the groups' means moved (**within** — players
 * developing, which is the thing the gate exists to police), or the groups'
 * relative sizes moved (**between** — a bucket arriving or draining, which is
 * not development at all). A standard shift-share decomposition separates them
 * exactly, using midpoint weights and midpoint means so the two parts sum to
 * the whole with no residual:
 *
 *   within  = sum_g  wbar_g * (m_g,end - m_g,start)
 *   between = sum_g  mbar_g * (w_g,end - w_g,start)
 *   within + between = blended_end - blended_start     (identically)
 *
 * Measured on the pre-S103 gated population, seed 2026, ten seasons: within
 * about +0.28/season, between about -0.28/season, blended +0.055 and reported
 * "on-target". Neither number on its own is wrong; the *sum* is what was
 * meaningless, and no arm of the receipt could say so.
 *
 * **What counts as bad is a changed verdict, not a magnitude.** The first draft
 * of this flagged composition when `|between| > |within|`, and on the very case
 * that motivated it — the measurement above — it reported
 * "development-dominated", because 0.198 is not larger than 0.235. A guard that
 * stays quiet on the defect it was built for is worth nothing, so the criterion
 * is the thing actually at stake: **classify the blended drift, classify the
 * within-group drift, and say so when they disagree.** Here they do — blended
 * `on-target` against within-group `watch` — which is precisely the sentence
 * "the composition term changed this gate's answer". No threshold is invented;
 * the target's own bands do the work.
 */
export function buildCompositionShift({ start, end, observedSeasons }) {
  const groups = ["activeRosterOnly", "practiceSquad"];
  const read = (side, key) => {
    const block = side?.population?.[key];
    return { count: Number(block?.count), mean: Number(block?.meanOverall) };
  };
  const startTotal = groups.reduce((sum, key) => sum + (Number.isFinite(read(start, key).count) ? read(start, key).count : 0), 0);
  const endTotal = groups.reduce((sum, key) => sum + (Number.isFinite(read(end, key).count) ? read(end, key).count : 0), 0);
  if (!startTotal || !endTotal) {
    return {
      gated: false,
      status: "incomplete",
      note: "no rostered population at one end of the window",
      blendedWouldClassifyAs: "incomplete",
      withinGroupWouldClassifyAs: "incomplete",
      withinGroupAnnualDrift: null,
      betweenGroupAnnualDrift: null,
      blendedAnnualDrift: null,
      groups: []
    };
  }
  let within = 0;
  let between = 0;
  const rows = [];
  for (const key of groups) {
    const a = read(start, key);
    const b = read(end, key);
    const startWeight = (Number.isFinite(a.count) ? a.count : 0) / startTotal;
    const endWeight = (Number.isFinite(b.count) ? b.count : 0) / endTotal;
    // An absent group carries no mean of its own, so the mean it "had" is the
    // one it has at the end — using 0 here would charge the decomposition a
    // phantom 66-point swing for a bucket that simply did not exist yet.
    const startMean = Number.isFinite(a.mean) && a.count ? a.mean : Number.isFinite(b.mean) ? b.mean : 0;
    const endMean = Number.isFinite(b.mean) && b.count ? b.mean : startMean;
    const meanWeight = (startWeight + endWeight) / 2;
    const meanLevel = (startMean + endMean) / 2;
    within += meanWeight * (endMean - startMean);
    between += meanLevel * (endWeight - startWeight);
    rows.push({
      group: key,
      startCount: Number.isFinite(a.count) ? a.count : 0,
      endCount: Number.isFinite(b.count) ? b.count : 0,
      startWeightPct: round(startWeight * 100, 1),
      endWeightPct: round(endWeight * 100, 1),
      startMeanOverall: round(startMean),
      endMeanOverall: round(endMean)
    });
  }
  const seasons = Number(observedSeasons) > 0 ? Number(observedSeasons) : 1;
  const withinDrift = round(within / seasons, 3);
  const betweenDrift = round(between / seasons, 3);
  const blendedDrift = round((within + between) / seasons, 3);
  const classify = (drift) =>
    classifyDrift(
      Math.abs(drift),
      LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs,
      LEAGUE_PROGRESSION_PARITY_TARGET.watchMaxAbs
    );
  const blendedVerdict = classify(blendedDrift);
  const withinVerdict = classify(withinDrift);
  return {
    gated: false,
    note: "shift-share decomposition of the blended rostered mean — reported so a denominator that moved cannot pass as development",
    status:
      blendedVerdict !== withinVerdict
        ? "verdict-changed-by-composition"
        : Math.abs(betweenDrift) > Math.abs(withinDrift)
          ? "composition-dominated"
          : "development-dominated",
    blendedWouldClassifyAs: blendedVerdict,
    withinGroupWouldClassifyAs: withinVerdict,
    withinGroupAnnualDrift: withinDrift,
    betweenGroupAnnualDrift: betweenDrift,
    blendedAnnualDrift: blendedDrift,
    groups: rows
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
  const startCount = Number(
    start?.population?.activeRosterOnly?.count ?? start?.population?.rostered?.count ?? start?.playerCount ?? 0
  );
  const endCount = Number(
    end?.population?.activeRosterOnly?.count ?? end?.population?.rostered?.count ?? end?.playerCount ?? 0
  );
  const adequateSample = startCount >= target.minimumSample && endCount >= target.minimumSample;

  // S102 — same population as the elite arm, and the same fallback chain.
  //
  // `LEAGUE_DISTRIBUTION_TARGET.metric` has declared "active-roster overall
  // dispersion and elite density" since S92, and S92 moved the elite arm onto
  // `activeRosterOnly` for a stated reason: All-Pro honors are drawn from the
  // active roster, and the practice squad is structurally ineligible. It left
  // the dispersion arm reading `stdDevOverall` off the blended `rostered`
  // population, so the two readings this receipt calls "two views of one
  // league" were two views of two different leagues.
  //
  // The blended reading is not merely noisier, it reverses the verdict.
  // Measured through `runRealismVerification({ seasons: 10 })` on seed 2026 —
  // the exact path `test/realism-career-regression.test.js` asserts on:
  //
  //   blended `rostered`   sd 4.318 -> 6.048   (drift 0.173/season, out-of-range)
  //   `activeRosterOnly`   sd 4.318 -> 4.690   (drift 0.037/season, on-target)
  //
  // The gated population's dispersion is not diffusing; the practice squad's
  // size and composition were moving the blend. That is the same free-parameter
  // shape S91 fenced the free-agent pool out for, and it is why this arm could
  // never be asserted: it reported a defect in a statistic nothing declared.
  const startStdDev = Number(
    start?.population?.activeRosterOnly?.stdDevOverall ?? start?.stdDevOverall ?? start?.population?.rostered?.stdDevOverall ?? 0
  );
  const endStdDev = Number(
    end?.population?.activeRosterOnly?.stdDevOverall ?? end?.stdDevOverall ?? end?.population?.rostered?.stdDevOverall ?? 0
  );
  const annualStdDevDrift = adequateSample ? round((endStdDev - startStdDev) / Math.max(1, observedSeasons), 3) : null;
  // S92 — prefer the active-roster-only reading, which is the population the
  // sourced NFL-honors ceiling below is actually anchored to. Older callers
  // (fixtures that hand-build a receipt from just `population.rostered`, or
  // from a bare `elite90PlusPct`) keep working via the fallback chain.
  const elite90PlusPct = Number(
    end?.population?.activeRosterOnly?.elite90PlusPct ??
      end?.elite90PlusPct ??
      end?.population?.rostered?.elite90PlusPct ??
      0
  );

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
    // Reported, never gated — the same convention `splitActivePopulation` uses
    // for `unrostered`: the population that is NOT gated stays visible, so a
    // future reader can see what the blended reading would have said instead of
    // having to rediscover the difference. This pair is the evidence that the
    // denominator matters; if they ever converge, that is worth knowing too.
    blendedRostered: {
      gated: false,
      note: "active roster + practice squad — the pre-S102 dispersion denominator, reported for contrast only",
      startStdDevOverall: round(Number(start?.population?.rostered?.stdDevOverall ?? 0), 3),
      endStdDevOverall: round(Number(end?.population?.rostered?.stdDevOverall ?? 0), 3),
      startMeanOverall: Number(start?.population?.rostered?.meanOverall ?? 0),
      endMeanOverall: Number(end?.population?.rostered?.meanOverall ?? 0),
      endElite90PlusPct: Number(end?.population?.rostered?.elite90PlusPct ?? 0)
    },
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
  // S102 — the same mean drift, measured on the active roster instead of the
  // blended rostered population this target declares. REPORTED, NEVER GATED.
  // S103 measured what re-pointing the target at it would cost and decided not
  // to pay it yet; see `LEAGUE_PROGRESSION_PARITY_TARGET`.
  const activeRosterMeanDrift = driftBetween(
    start?.population?.activeRosterOnly?.meanOverall,
    end?.population?.activeRosterOnly?.meanOverall,
    observedSeasons
  );
  // S103 — and the general guard. See `buildCompositionShift`.
  const compositionShift = buildCompositionShift({ start, end, observedSeasons });

  return {
    status,
    globalStatus,
    distribution,
    observedSeasons,
    seed: Number(seed),
    annualMeanOverallDrift,
    activeRosterMeanOverallDrift: {
      gated: false,
      note: "the same statistic on the active roster only — reported for contrast, see S102 and the S103 note on the target",
      annualMeanOverallDrift: activeRosterMeanDrift,
      wouldClassifyAs:
        activeRosterMeanDrift === null
          ? "incomplete"
          : classifyDrift(
              Math.abs(activeRosterMeanDrift),
              LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs,
              LEAGUE_PROGRESSION_PARITY_TARGET.watchMaxAbs
            )
    },
    compositionShift,
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
