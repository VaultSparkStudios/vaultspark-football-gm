/**
 * S94: the published simulation-methodology block.
 *
 * This project's real differentiator is not that its numbers "feel real" — every
 * franchise game claims that. It is that the claim is *measured against a
 * sourced anchor and gated in the build*, and that the anchor's limits are
 * written down. That story existed only in internal notes and in three developer
 * diagnostic panels buried in the Settings tab, which is a strange place to keep
 * the best argument you have.
 *
 * The numbers on the public page are RENDERED FROM the same constants the engine
 * gates against, so the page cannot drift from the simulation the way
 * status.html drifted from the product. There is no second copy to forget.
 */

import {
  NFL_ACTIVE_ROSTER_LIMIT,
  NFL_ACTIVE_ROSTER_POPULATION,
  NFL_CLUB_COUNT,
  NFL_FIRST_TEAM_ALL_PRO_SLOTS,
  NFL_PRO_BOWL_SLOTS
} from "../../src/data/nflEliteDensityBaseline.js";
import {
  LEAGUE_DISTRIBUTION_TARGET,
  LEAGUE_PROGRESSION_PARITY_TARGET
} from "../../src/stats/progressionParity.js";

export const SIMULATION_ANCHOR_MARKER = '<div data-simulation-anchor></div>';

function figure(value, unit, label, detail) {
  return `<article class="sim-figure">
        <strong class="sim-figure-value">${value}<span class="sim-figure-unit">${unit}</span></strong>
        <span class="sim-figure-label">${label}</span>
        <p>${detail}</p>
      </article>`;
}

export function renderSimulationAnchor() {
  const ceiling = LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling;
  const watch = LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctWatchCeiling;
  const drift = LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs;
  const driftWatch = LEAGUE_PROGRESSION_PARITY_TARGET.watchMaxAbs;

  return `<div data-simulation-anchor class="sim-anchor">
      <div class="sim-figure-grid">
        ${figure(
          NFL_FIRST_TEAM_ALL_PRO_SLOTS,
          "",
          "First-Team All-Pro places",
          "The tightest honor the real league gives out in a season. It is the ceiling."
        )}
        ${figure(
          NFL_PRO_BOWL_SLOTS,
          "",
          "Pro Bowl places",
          "The broader &ldquo;very good this year&rdquo; honor. It is the watch line, not the target."
        )}
        ${figure(
          NFL_ACTIVE_ROSTER_POPULATION.toLocaleString("en-US"),
          "",
          "Players those honors come from",
          `${NFL_ACTIVE_ROSTER_LIMIT} active players across ${NFL_CLUB_COUNT} clubs — the same roster structure this game runs.`
        )}
        ${figure(
          ceiling,
          "%",
          "Elite ceiling this game holds to",
          `${NFL_FIRST_TEAM_ALL_PRO_SLOTS} &divide; ${NFL_ACTIVE_ROSTER_POPULATION.toLocaleString("en-US")}. Cross it and the league is minting stars the real one does not.`
        )}
        ${figure(
          watch,
          "%",
          "Watch line",
          `${NFL_PRO_BOWL_SLOTS} &divide; ${NFL_ACTIVE_ROSTER_POPULATION.toLocaleString("en-US")}. Between the two is a band, not a bullseye — because the anchor is an analogy, not an identity.`
        )}
        ${figure(
          drift,
          "",
          "Rating points of drift allowed per year",
          `Across the whole league, average player quality may move less than ${drift} of a rating point a season; past ${driftWatch} the build says so out loud.`
        )}
      </div>
    </div>`;
}

/**
 * Assert a built page's published figures still equal the engine's constants.
 * Guards against the one failure mode a generated block still permits: someone
 * hand-writing a friendlier number into the prose around it.
 */
export function inspectSimulationClaims(html) {
  const problems = [];
  const required = [
    [String(NFL_FIRST_TEAM_ALL_PRO_SLOTS), "First-Team All-Pro slot count"],
    [String(NFL_PRO_BOWL_SLOTS), "Pro Bowl slot count"],
    [String(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling), "elite density ceiling"],
    [String(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctWatchCeiling), "elite density watch line"],
    [String(LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs), "annual drift tolerance"]
  ];
  for (const [value, label] of required) {
    if (!html.includes(value)) {
      problems.push(`simulation.html no longer publishes the engine's ${label} (${value}); the page has drifted from progressionParity`);
    }
  }
  if (!html.includes("data-simulation-anchor")) {
    problems.push("simulation.html lost its generated anchor block; its figures would become a hand-maintained second copy");
  }
  return { ok: problems.length === 0, problems };
}
