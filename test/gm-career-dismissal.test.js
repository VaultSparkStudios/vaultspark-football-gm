import test from "node:test";
import assert from "node:assert/strict";

import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { authorizeCommand } from "../src/runtime/franchiseAuthority.js";
import { OWNER_PATIENCE_FLOOR } from "../src/engine/ownerConfidence.js";

/**
 * The stakes, end to end, on the real advance path.
 *
 * Nothing about the owner, the ultimatum, patience or the career state is set
 * by hand here. The only thing this fixture does is make the controlled club
 * bad at football (it lowers the roster's ratings each season), then advances
 * the league one command at a time and watches what the owner does about it:
 *
 *   season one  — patience drains, the owner issues an ultimatum, it fails,
 *                 and the season review is a final warning (never a firing in
 *                 the first season);
 *   season two  — the owner issues another ultimatum, it fails with patience
 *                 at the floor, and the season review relieves the general
 *                 manager of his duties.
 *
 * Then the general manager takes a job from the market and the same league
 * advances a week under the new club.
 *
 * Slow by nature (two full seasons); it lives in the `long` shard.
 */

const TEAM = "BUF";
const MAX_SEASONS = 3;

function weakenRoster(session, teamId) {
  for (const player of session.league.players) {
    if (player.teamId === teamId) player.overall = Math.max(40, player.overall - 22);
  }
}

function advance(session) {
  // The whole-season delegation path picks for the user when the draft clock
  // is theirs; the interactive command stays blocked there by design.
  if (session.phase === "offseason" && session.getOffseasonPipeline().stage === "draft" && session.getDraftAuthority().userActionRequired) {
    session.runCpuDraft({ untilUserPick: false });
  }
  // The boundary both adapters share must agree the clock may move...
  assert.equal(authorizeCommand({ session, route: "/api/advance-week", body: {} }), null);
  // ...and the engine's own advance — the path every adapter ends in — moves it.
  const outcome = session.advanceWeek();
  assert.notEqual(outcome?.ok, false, outcome?.error || "the league must advance");
  return outcome;
}

test("a Standard league fires a losing general manager within three seasons, warns first, and plays on under the next club", { timeout: 3_600_000 }, () => {
  const session = new GameSession({ rng: new RNG(4242), startYear: 2026, controlledTeamId: TEAM, mode: "drive" });
  const settings = session.getLeagueSettings();
  assert.equal(settings.difficultyPreset, "standard");
  assert.equal(settings.rulesPreset, "standard");
  const club = session.league.teams.find((team) => team.id === TEAM);
  const startYear = session.currentYear;
  const reviews = [];
  let warningSeenBeforeDismissal = false;
  const ownerWarningsInInbox = new Set();
  let weakenedYear = null;
  let guard = 0;

  while (session.getGmCareerState().dismissed !== true && session.currentYear < startYear + MAX_SEASONS && guard < 400) {
    guard += 1;
    if (session.phase === "regular-season" && weakenedYear !== session.currentYear) {
      weakenRoster(session, TEAM);
      weakenedYear = session.currentYear;
    }
    const phaseBefore = session.phase;
    const yearBefore = session.currentYear;
    const view = session.getGmCareerState();
    if (view.warning) warningSeenBeforeDismissal = true;
    advance(session);
    // The inbox reads this log every week; it is bounded, so collect as we go.
    for (const item of session.league.newsLog || []) {
      if (item.type === "owner-ultimatum" && (item.teamIds || []).includes(TEAM) && session.getGmCareerState().dismissed !== true) {
        ownerWarningsInInbox.add(`${item.year}:${item.week}:${item.headline}`);
      }
    }
    if (phaseBefore === "postseason" && session.phase !== "postseason") {
      reviews.push({ year: yearBefore, review: session.pendingSeasonWrap?.ownerReview || null, patience: club.owner.patience });
    }
  }

  const career = session.getGmCareerState();
  assert.equal(career.dismissed, true, `no dismissal within ${MAX_SEASONS} losing seasons; reviews: ${JSON.stringify(reviews)}`);

  // Never in the first season: the first review was a warning, not a firing.
  assert.ok(reviews.length >= 2, "a dismissal needs more than one season");
  assert.equal(reviews[0].year, startYear);
  assert.notEqual(reviews[0].review?.action, "dismiss");
  assert.equal(reviews.at(-1).review.action, "dismiss");
  assert.ok(career.dismissal.year > startYear, "the dismissal came after the first season");

  // Never a surprise: the owner's warnings were on record, and shown, first.
  const closed = career.history[0];
  assert.equal(closed.teamId, TEAM);
  assert.ok(["ultimatum-failed", "patience-exhausted"].includes(closed.reason), closed.reason);
  assert.ok(warningSeenBeforeDismissal, "the dashboard carried the warning in words before the dismissal");
  assert.ok(ownerWarningsInInbox.size >= 2,
    `the owner's warnings reached the inbox before he acted: ${[...ownerWarningsInInbox].join(" | ")}`);
  assert.ok(session.league.gmCareer.history[0].seasons >= 2);
  assert.ok(reviews.at(-1).patience <= OWNER_PATIENCE_FLOOR + 1e-9, "Standard acts only once patience has run out");

  // The tenure is recorded: club, seasons, record, playoffs, reason.
  assert.equal(closed.seasons, career.dismissal.year - startYear + 1);
  assert.equal(closed.startYear, startYear);
  assert.equal(closed.endYear, career.dismissal.year);
  assert.equal(closed.wins + closed.losses + closed.ties, closed.seasons * 17);
  assert.equal(closed.playoffAppearances, 0);
  assert.ok(closed.losses > closed.wins);
  assert.match(career.dismissal.summary, /make a change/);

  // Terminal for that tenure: the league clock and the old club are closed to the player.
  const blocked = authorizeCommand({ session, route: "/api/advance-week", body: {} });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.payload.reasonCode, "gm-dismissed");
  assert.equal(authorizeCommand({ session, route: "/api/release", body: { teamId: TEAM, playerId: "x" } }).payload.reasonCode, "gm-dismissed");
  const yearAtDismissal = session.currentYear;
  const phaseAtDismissal = session.phase;

  // The job market: 3-5 struggling clubs, fully described.
  assert.ok(career.offers.length >= 3 && career.offers.length <= 5);
  assert.ok(career.offers.every((offer) => offer.teamId !== TEAM));
  for (const offer of career.offers) {
    assert.ok(offer.recentRecords.length >= 1 && offer.recentRecords.length <= 3);
    assert.match(offer.capText, /cap/i);
    assert.match(offer.expectation, /owner/i);
  }

  // The state survives a save and load exactly as it stands.
  const restored = GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));
  assert.deepEqual(restored.getGmCareerState(), career);

  // Take a job through the proper command and keep playing the same league.
  const chosen = career.offers[0].teamId;
  const body = { action: "take-job", teamId: chosen };
  assert.equal(authorizeCommand({ session, route: "/api/career", body }), null, "an offered job is allowed at the boundary");
  const hired = session.takeJobOffer(chosen);
  assert.equal(hired.ok, true, hired.error);
  assert.equal(session.controlledTeamId, chosen);
  const fresh = session.getGmCareerState();
  assert.equal(fresh.dismissed, false);
  assert.equal(fresh.tenure.teamId, chosen);
  assert.equal(fresh.tenure.warnings, 0);
  assert.equal(fresh.tenure.seasons, 0);
  const newOwner = session.league.teams.find((team) => team.id === chosen).owner;
  assert.equal(newOwner.patience, settings.ownerPatience, "the new owner starts with this league's full patience");
  assert.equal(session.currentYear, yearAtDismissal, "the same league, at the same point");
  assert.equal(session.phase, phaseAtDismissal);

  advance(session);
  assert.notEqual(session.phase, phaseAtDismissal, "the league advances again under the new club");
  assert.equal(session.controlledTeamId, chosen);
  assert.equal(session.getGmCareerState().dismissed, false);
  assert.equal(session.league.champions.length, yearAtDismissal - startYear + 1, "league history carried through the change");
});
