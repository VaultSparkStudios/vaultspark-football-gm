import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { GROWTH_WINDOW_MAX_AGE, PLAYER_DEVELOPMENT_PROFILE, developmentDelta } from "../src/domain/ratings.js";
import { buildPlayerProfileNarrative } from "../public/lib/playerProfileNarrative.js";

/**
 * S108 — the profile's development outlook read facilities, fit and age and
 * never the player's own headroom or trait, so a Bust at his ceiling in a top
 * facility rendered "surging" beneath a POT badge that said he had nowhere to
 * go. And the runway sentence branched on points alone while the engine
 * closes headroom at a declared age.
 */

function profileFor(session, player) {
  return session.getPlayerProfile(player.id);
}

test("a player with no headroom cannot read 'surging', whatever his club's environment says", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const team = session.getTeamById("BUF");
  // Make the environment as generous as the model allows.
  team.owner = { ...(team.owner || {}), facilities: { ...(team.owner?.facilities || {}), training: 99 } };
  team.coaching = { ...(team.coaching || {}), development: 99 };
  const player = session.league.players.find((p) => p.teamId === "BUF" && Number(p.age) <= 24 && p.status === "active");
  player.potential = Number(player.overall);
  player.developmentTrait = "Bust";
  const outlook = profileFor(session, player).developmentOutlook;
  assert.equal(outlook.headroom, 0);
  assert.notEqual(outlook.trajectory, "surging");
  assert.ok(["steady", "fragile"].includes(outlook.trajectory), `ceiling-bound Bust reads ${outlook.trajectory}`);

  // Negative control: give the same player real room and the same environment
  // lifts him — the term that binds is headroom, not the facility.
  player.potential = Number(player.overall) + 12;
  player.developmentTrait = "Superstar";
  const lifted = profileFor(session, player).developmentOutlook;
  assert.equal(lifted.headroom, 12);
  assert.ok(["positive", "surging"].includes(lifted.trajectory), `with room he reads ${lifted.trajectory}`);
});

test("the profile projects the runway in growth seasons from the development curve's own boundary", () => {
  // The curve (`developmentDelta`) is the authority, not the generation-time
  // headroom constant: a growth season is one where the declared age factor
  // still points up, and that ends at GROWTH_WINDOW_MAX_AGE.
  const under = developmentDelta({ age: GROWTH_WINDOW_MAX_AGE, potential: 80, overall: 70, developmentKey: "NORMAL", ratings: {} }, { float: () => 0, int: () => 0, next: () => 0.5 }, {});
  const over = developmentDelta({ age: GROWTH_WINDOW_MAX_AGE + 1, potential: 80, overall: 70, developmentKey: "NORMAL", ratings: {} }, { float: () => 0, int: () => 0, next: () => 0.5 }, {});
  assert.ok(under >= over, "the curve does not point up more strongly past the boundary than at it");
  assert.equal(PLAYER_DEVELOPMENT_PROFILE.ageFactors.developing25AndUnder > 0, true);
  assert.equal(PLAYER_DEVELOPMENT_PROFILE.ageFactors.prime26To29 < 0, true, "from 26 the expected annual move is negative");

  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const young = session.league.players.find((p) => Number(p.age) === 22 && p.status === "active");
  const past = session.league.players.find((p) => Number(p.age) === 27 && p.status === "active");
  const youngProfile = profileFor(session, young).player;
  const pastProfile = profileFor(session, past).player;
  assert.equal(youngProfile.developmentRunwaySeasons, GROWTH_WINDOW_MAX_AGE + 1 - 22);
  assert.equal(pastProfile.developmentRunwaySeasons, 0, "a 27-year-old has no growth seasons left, whatever headroom he was generated with");
  assert.equal(youngProfile.developmentHeadroom, Number(young.potential) - Number(young.overall));
});

test("the narrative gives a 22-year-old and a 29-year-old with the same gap different runways", () => {
  const base = { id: "P1", name: "Test Player", position: "WR", overall: 70, potential: 79, experience: 2, ratings: { speed: 80, hands: 75, route: 72 } };
  const window = GROWTH_WINDOW_MAX_AGE + 1;
  const youngDossier = buildPlayerProfileNarrative({ player: { ...base, age: 22, developmentRunwaySeasons: window - 22 }, career: {}, timeline: [] });
  const oldDossier = buildPlayerProfileNarrative({ player: { ...base, age: 29, developmentRunwaySeasons: Math.max(0, window - 29) }, career: {}, timeline: [] });
  const youngText = JSON.stringify(youngDossier);
  const oldText = JSON.stringify(oldDossier);
  assert.match(youngText, /meaningful development runway/);
  assert.match(youngText, new RegExp(`About ${window - 22} growth seasons remain`));
  assert.match(oldText, /runway is short/);
  assert.match(oldText, /growth window has closed/);
  assert.notEqual(youngText, oldText);

  // A profile without the projection (older DTOs, fixtures) keeps the old sentence.
  const legacy = JSON.stringify(buildPlayerProfileNarrative({ player: { ...base, age: 29 }, career: {}, timeline: [] }));
  assert.match(legacy, /meaningful development runway\./);
  assert.doesNotMatch(legacy, /seasons remain/);
});
