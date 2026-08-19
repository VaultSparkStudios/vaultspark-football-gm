/**
 * A real NFL elite-density baseline — S92, booked by the S91 handoff.
 *
 * ## Why this exists
 *
 * `LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling` shipped in S91 with
 * `elite90PlusPctProvenance: "judgement-not-measured"`: no NFL elite-density
 * authority existed anywhere in `src/data`, so the ceiling was set from the
 * engine's own pre-fix behaviour (0.32% -> 4.03% over 12 seasons) rather than
 * from anything external. That is exactly the failure mode this project has
 * already been burned by three times — `LEAGUE_AVERAGE_POTENTIAL` (S71), the
 * coaching-development centre (S90), and the scheme-fit centre (S90) — a
 * self-referential constant that a later session tunes until the system
 * agrees with itself.
 *
 * ## What "elite" is anchored to
 *
 * The real NFL publishes exactly two honors that name a fixed, structurally
 * stable count of the league's best players each season, independent of any
 * one year's outcomes:
 *
 *   - **AP First-Team All-Pro** — one seat per position across offense,
 *     defense, and specialists. The modern format (post-2013 realignment,
 *     stable since) seats **26** players. This is the tightest honor the
 *     league gives out: the single best player at each position, for the
 *     whole season, as judged by a national media panel. It is the closest
 *     real-world analogue to "90+ overall" — a rating band this project's own
 *     domain language treats as superstar-tier, not merely good.
 *   - **Pro Bowl** — the broader "very good this season" honor. The modern
 *     format seats **88** total roster spots (44 per conference across
 *     offense, defense, and specialists) before injury-driven alternate
 *     call-ups, which do not change the nominal roster size. This is a
 *     looser tier than All-Pro — several dozen players a year who are clearly
 *     good but not the single best at their position.
 *
 * Both counts are **structural** facts about how the honors are built (seats
 * per position, positions per side of the ball), not a measured outcome that
 * drifts year to year the way, say, passing yardage totals do. That is what
 * makes them usable as an authority instead of another literal: the honor
 * *format* does not move regardless of which players fill it.
 *
 * ## What population they are drawn from
 *
 * Both honors are drawn from players who actually take the field: the
 * league's active roster. Practice-squad players are not eligible for either
 * honor — by definition, a player good enough to be a first-team All-Pro or a
 * Pro Bowler is not a player a real club would be hiding on its 16-man
 * practice squad. The honest population to divide by is therefore the real
 * NFL's active-roster limit, **53 players x 32 clubs = 1,696** — which is
 * also, not by coincidence, exactly what this project's own
 * `ROSTER_STRUCTURE.activeLimit` (`src/config.js`) encodes. The two systems
 * agree on what "the active roster" means, so the anchor and the measured
 * population line up by construction rather than by a unit-conversion fudge.
 *
 * This is also why `elite90PlusPctCeiling` is now read from
 * `population.activeRosterOnly` in `progressionParity.js` rather than from
 * `population.rostered`, which blends the active roster with the practice
 * squad (S89's `ROSTER_STRUCTURE.practiceLimit`, 16/club). A ceiling sourced
 * from a population that cannot win the honor, divided against a population
 * that structurally can, would not be comparing like to like — the same
 * denominator-mismatch shape as the free-agent-pool defect S91 fixed one
 * level up. Fixing where the ratio's denominator comes from is part of
 * "re-source the measurement," not a separate change.
 *
 * ## Honest limits of this anchor
 *
 * Two things this baseline does NOT claim:
 *
 *   1. **It is an analogy, not an identity.** "First-Team All-Pro" measures a
 *      single season's realized performance, judged by humans; "90+ overall"
 *      measures a game's declared talent rating. A great player having an
 *      off year, or a young player not yet proven, can diverge from either
 *      side of that mapping. The two are related — the league's actual best
 *      players are disproportionately its All-Pros — but not the same
 *      measurement, which is why this baseline provides a *band* (All-Pro
 *      floor to Pro Bowl ceiling) rather than a single point estimate.
 *   2. **The honor-slot counts are sourced from the stable structure of the
 *      awards, not from a live external feed.** This project has no network
 *      data source wired for NFL honors and none is being added for this.
 *      That is a materially stronger authority than "judgement" — the slot
 *      counts are public, well-known, and do not depend on which season is
 *      being asked about — but it is still weaker than a measured historical
 *      distribution of actual Madden-style overall ratings, which nobody has
 *      published in a form this project can cite. If that ever changes, this
 *      module is where it gets replaced.
 */

export const NFL_ACTIVE_ROSTER_LIMIT = 53;
export const NFL_CLUB_COUNT = 32;

/** The real population both honors below are drawn from. */
export const NFL_ACTIVE_ROSTER_POPULATION = NFL_ACTIVE_ROSTER_LIMIT * NFL_CLUB_COUNT;

/**
 * AP First-Team All-Pro — the tightest honor in the sport. One seat per
 * position, offense + defense + specialists, modern (post-2013) format.
 */
export const NFL_FIRST_TEAM_ALL_PRO_SLOTS = 26;

/**
 * Pro Bowl — the broader "very good this season" honor. Modern format,
 * nominal roster size before alternate call-ups (44 per conference x 2).
 */
export const NFL_PRO_BOWL_SLOTS = 88;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

/**
 * The sourced elite-density band this project's distributional gate now
 * reads. The floor is the tightest real honor (All-Pro); the watch ceiling is
 * the broader one (Pro Bowl). Both divided by the real active-roster
 * population the honors are drawn from.
 */
export const NFL_ELITE_DENSITY_BASELINE = Object.freeze({
  version: "2026-s92-nfl-honors-anchor",
  provenance: "sourced-nfl-honors-analogy",
  activeRosterPopulation: NFL_ACTIVE_ROSTER_POPULATION,
  firstTeamAllProSlots: NFL_FIRST_TEAM_ALL_PRO_SLOTS,
  proBowlSlots: NFL_PRO_BOWL_SLOTS,
  firstTeamAllProPct: round((NFL_FIRST_TEAM_ALL_PRO_SLOTS / NFL_ACTIVE_ROSTER_POPULATION) * 100, 2),
  proBowlPct: round((NFL_PRO_BOWL_SLOTS / NFL_ACTIVE_ROSTER_POPULATION) * 100, 2)
});
