import test from "node:test";
import assert from "node:assert/strict";
import { buildAdvice, scoreAgreement, reduceAdvisorOutcome, renderAdvisorCard } from "../public/lib/frontOfficeAdvisor.js";
import { commitWeeklyPlanReceipt } from "../public/lib/weeklyPlanComposer.js";

const source = { key: "franchise-a:BUF:2026:10:regular-season", year: 2026, week: 10, phase: "regular-season", teamId: "BUF" };
const advice = { call: { id: "gm-decision:buy", kind: "gm-decision", choiceId: "buy", decisionId: "deadline", occurrenceKey: "deadline-2026" } };
function receipt(overrides = {}) {
  return commitWeeklyPlanReceipt({ schemaVersion: "1.0", sourceAuthority: source,
    compositionOrder: ["gm-decision", "tactic"], phase: source.phase,
    plan: { gmDecision: { decisionId: "deadline", choiceId: "buy", occurrenceKey: "deadline-2026" } }, ...overrides },
  { state: { currentYear: 2026, currentWeek: 11, controlledTeamId: "BUF" }, gmDecision: { applied: true }, architectEntry: { id: "a1" } });
}
function memory(call = advice) { return { pending: { advice: call, sourceAuthority: source } }; }

test("advisor scores actual applied choice and leaves staged, deferred, missing and unrelated actions unscored", () => {
  assert.equal(scoreAgreement(advice, receipt()).agreed, true);
  const other = receipt({ plan: { gmDecision: { decisionId: "deadline", choiceId: "sell", occurrenceKey: "deadline-2026" } } });
  assert.equal(scoreAgreement(advice, other).agreed, false);
  for (const bad of [null, { ...receipt(), status: "ready" }, { ...receipt(), status: "deferred" },
    { ...receipt(), observed: { gmDecisionApplied: false } },
    receipt({ plan: { gmDecision: { decisionId: "deadline", choiceId: "buy", occurrenceKey: "deadline-2025" } } }),
    receipt({ plan: { gmDecision: { decisionId: "other", choiceId: "buy", occurrenceKey: "deadline-2026" } } })]) {
    assert.equal(scoreAgreement(advice, bad).agreed, null);
  }
  for (const kind of ["injury-depth", "cap-pressure", "draft-clock", "deadline-window", "owner-mandate", "roster-need"]) {
    assert.equal(scoreAgreement({ call: { kind } }, receipt()).agreed, null, kind);
  }
  assert.equal(scoreAgreement({ call: { kind: "advance-week" } }, receipt()).agreed, true);
});

test("one checkpoint yields one atomic outcome even on replay, reload, differing receipt IDs and re-render", () => {
  const first = reduceAdvisorOutcome(memory(), receipt());
  assert.deepEqual({ agreed: first.tally.agreed, against: first.tally.against, unscored: first.tally.unscored, weeks: first.tally.weeks },
    { agreed: 1, against: 0, unscored: 0, weeks: 1 });
  assert.equal(first.pending, null);
  assert.equal(reduceAdvisorOutcome(first, receipt()), first);
  const rerendered = JSON.parse(JSON.stringify({ ...first, pending: memory().pending }));
  assert.equal(reduceAdvisorOutcome(rerendered, { ...receipt(), observed: { gmDecisionApplied: true, architectReceiptId: "another" } }), rerendered);
  assert.equal(first.scored.receipt.authority.week, 11, "post-command authority stays intact");
  assert.equal(first.scored.receipt.sourceAuthority.week, 10, "source checkpoint is not guessed from post-command state");
});

test("other franchises, teams, seasons, weeks, phases and ambiguous checkpoints do not consume pending advice", () => {
  for (const changed of [{ key: "franchise-b:BUF:2026:10:regular-season" }, { year: 2027 }, { week: 11 }, { teamId: "MIA" }, { phase: "offseason" }]) {
    const original = memory();
    assert.equal(reduceAdvisorOutcome(original, receipt({ sourceAuthority: { ...source, ...changed } })), original);
  }
  const original = memory();
  for (const bad of [null, { ...receipt(), status: "ready" }, { ...receipt(), status: "deferred" }, receipt({ sourceAuthority: null }),
    { ...receipt(), authority: { ...receipt().authority, teamId: "MIA" } }, { ...receipt(), authority: null }]) {
    assert.equal(reduceAdvisorOutcome(original, bad), original);
  }
});

test("unobservable calls are counted separately and never rendered as agreement or disagreement", () => {
  const pending = buildAdvice({ authority: { year: 2026, week: 10, teamId: "BUF" }, pressure: { capSpace: -1_000_000 } });
  const next = reduceAdvisorOutcome(memory(pending), receipt());
  assert.equal(next.tally.agreed, 0);
  assert.equal(next.tally.against, 0);
  assert.equal(next.tally.unscored, 1);
  const current = buildAdvice({}, { lastWeekAdvice: pending, lastWeekReceipt: receipt() });
  assert.match(renderAdvisorCard(current), /data-agreed="unscored"/);
  assert.match(renderAdvisorCard(current), /Outcome not observed/);
  assert.doesNotMatch(renderAdvisorCard(current), /Same call as the room|Went against the room/);
});
