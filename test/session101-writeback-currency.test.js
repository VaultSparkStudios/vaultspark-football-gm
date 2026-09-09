import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWriteBackCurrency,
  AUTOMATION_SUBJECT_RE,
  SUBJECT_ONLY_EXEMPT_RE
} from "../scripts/check-writeback-currency.mjs";

// ── S101 · the write-back probe had no test at all ───────────────────────────
//
// This is the triage signal that the working tree cannot see: a session that
// committed, pushed, and then died leaves a clean tree, a synced remote, and
// every state surface silently stale. It had no coverage, and its denominator
// had a hole — an automation SUBJECT exempted a commit regardless of the files
// it touched, so real source work committed as `chore(proof): …` was laundered
// out of the measurement.

const WRITE_BACK_ANCHOR = "context/SELF_IMPROVEMENT_LOOP.md";
const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-09-09T12:00:00Z");

function commit(sha, subject, files, hoursAgo) {
  return { sha, subject, isoDate: new Date(NOW - hoursAgo * HOUR).toISOString(), files };
}

test("a closeout anchor with nothing after it is current", () => {
  const result = evaluateWriteBackCurrency({
    commits: [commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)],
    nowMs: NOW
  });
  assert.equal(result.ok, true, result.reason || "");
});

test("substantive work committed after the anchor and left to go stale is debt", () => {
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "fix: real engine work", ["src/engine/gameSimulator.js"], 20),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(result.ok, false, "un-written-back source work must be reported");
});

test("work newer than the grace window is in flight, not abandoned", () => {
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "fix: real engine work", ["src/engine/gameSimulator.js"], 1),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(result.ok, true, "a session that just committed and is still running is not debt");
});

test("age is taken from the OLDEST un-written-back commit, not the newest", () => {
  // One fresh commit must not mask days of debt sitting behind it.
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("ccc", "fix: something just now", ["src/engine/schedule.js"], 0.5),
      commit("bbb", "fix: work from two days ago", ["src/engine/gameSimulator.js"], 48),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 60)
    ],
    nowMs: NOW
  });
  assert.equal(result.ok, false, "the oldest un-written-back commit sets the age");
});

test("receipt-only churn after the anchor is not debt", () => {
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "chore: capture receipts", ["reports/s100-staging.json"], 20),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(result.ok, true, "generated paths are churn, not session work");
});

test("a closeout commit keeps its subject-only exemption", () => {
  // Closeout commits ARE the write-back: they regenerate rebased surfaces and
  // legitimately touch non-generated paths after the anchor.
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "chore(closeout): regenerate surfaces", ["context/CURRENT_STATE.md", "docs/CLOSEOUT_BRIEF.md"], 20),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(result.ok, true, "counting closeout commits would make every clean closeout look dirty");
});

test("an automation subject cannot launder real source work out of the denominator", () => {
  // The hole this closes: `chore(proof)` used to exempt a commit by SUBJECT
  // alone, regardless of the files it touched.
  const result = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "chore(proof): receipts", ["src/engine/gameSimulator.js", "reports/x.json"], 20),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(
    result.ok,
    false,
    "a commit touching src/ is session work whatever its subject says — the subject is only trusted when the files agree"
  );

  // and the same subject over genuinely generated paths stays exempt
  const churn = evaluateWriteBackCurrency({
    commits: [
      commit("bbb", "chore(proof): receipts", ["reports/x.json"], 20),
      commit("aaa", "chore: record S100 closeout", [WRITE_BACK_ANCHOR], 30)
    ],
    nowMs: NOW
  });
  assert.equal(churn.ok, true, "tightening the subject must not turn ordinary receipt churn into debt");
});

test("the two subject classes are distinct and correctly scoped", () => {
  assert.equal(SUBJECT_ONLY_EXEMPT_RE.test("chore(closeout): record S101"), true);
  assert.equal(SUBJECT_ONLY_EXEMPT_RE.test("Merge branch 'main'"), true);
  assert.equal(SUBJECT_ONLY_EXEMPT_RE.test("chore(proof): receipts"), false, "proof must be file-checked, not subject-trusted");
  assert.equal(SUBJECT_ONLY_EXEMPT_RE.test("chore(deps): bump"), false);

  assert.equal(AUTOMATION_SUBJECT_RE.test("chore(proof): receipts"), true);
  assert.equal(AUTOMATION_SUBJECT_RE.test("fix: real work"), false);
});
