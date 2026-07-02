import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { buildPreseasonPredictions, gradeTimeCapsule } from "../src/engine/timeCapsule.js";

function freshSession(seed = 777) {
  return createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
}

test("startSeason publishes a deterministic preseason capsule with falsifiable targets", () => {
  const session = freshSession();
  const capsule = session.league.timeCapsule;
  assert.ok(capsule, "capsule missing after session bootstrap");
  assert.equal(capsule.year, 2026);
  assert.equal(capsule.graded, null);
  assert.ok(capsule.predictions.length >= 4, `expected >=4 predictions, got ${capsule.predictions.length}`);

  const kinds = capsule.predictions.map((p) => p.kind);
  for (const required of ["champion", "team-window", "surprise"]) {
    assert.ok(kinds.includes(required), `missing prediction kind ${required}`);
  }
  for (const pred of capsule.predictions) {
    assert.ok(pred.text && pred.text.length > 10, `prediction ${pred.id} has no copy`);
    assert.ok(pred.subject && typeof pred.subject === "object", `prediction ${pred.id} has no gradable subject`);
  }

  const capsuleNews = session.league.newsFeed.filter((n) => n.details?.kind === "time-capsule");
  assert.equal(capsuleNews.length, 1, "preseason predictions must land in the news feed");
  assert.equal(capsuleNews[0].details.lines.length, capsule.predictions.length);
});

test("same seed produces identical predictions; different seed diverges somewhere", () => {
  const a = freshSession(4242).league.timeCapsule;
  const b = freshSession(4242).league.timeCapsule;
  assert.deepEqual(a, b, "same-seed capsules must match exactly");

  const c = freshSession(4243).league.timeCapsule;
  assert.notDeepEqual(a, c, "different-seed capsules should not be byte-identical");
});

test("capsule builder never advances the main RNG stream", () => {
  const session = freshSession(9001);
  const seedBefore = session.rng.seed;
  buildPreseasonPredictions({
    league: session.league,
    year: 2026,
    controlledTeamId: "BUF",
    seedState: seedBefore
  });
  assert.equal(session.rng.seed, seedBefore, "buildPreseasonPredictions must not consume the session RNG");
});

test("postseason grades every prediction with a verdict, evidence, and reporter voice", () => {
  const session = freshSession(31337);
  session.simulateOneSeason({ runOffseasonAfter: false });

  const capsule = session.league.timeCapsule;
  assert.ok(capsule.graded, "capsule must be graded once the postseason completes");
  const graded = capsule.graded;
  assert.equal(graded.year, 2026);
  assert.equal(graded.hits + graded.pushes + graded.misses, capsule.predictions.length);
  assert.equal(graded.receipts.length, capsule.predictions.length);
  for (const receipt of graded.receipts) {
    assert.ok(["hit", "push", "miss"].includes(receipt.verdict), `bad verdict ${receipt.verdict}`);
    assert.ok(receipt.evidence.length > 0, `receipt ${receipt.id} has no evidence line`);
  }
  assert.ok(graded.reporterVerdict.length > 10, "reporter verdict quote missing");

  const receiptNews = session.league.newsFeed.filter((n) => n.details?.kind === "time-capsule-receipts");
  assert.equal(receiptNews.length, 1, "grading must land in the news feed");

  const ledger = session.league.timeCapsuleLedger;
  assert.equal(ledger.length, 1);
  assert.deepEqual(ledger[0], { year: 2026, hits: graded.hits, pushes: graded.pushes, misses: graded.misses });

  // Idempotent: re-grading returns the same object, no double ledger entry.
  const again = gradeTimeCapsule({ league: session.league, statBook: session.statBook, year: 2026 });
  assert.equal(again, graded);
  assert.equal(session.league.timeCapsuleLedger.length, 1);
});

test("grading is deterministic across identical runs", () => {
  const run = (seed) => {
    const session = freshSession(seed);
    session.simulateOneSeason({ runOffseasonAfter: false });
    return session.league.timeCapsule.graded;
  };
  assert.deepEqual(run(5150), run(5150));
});
