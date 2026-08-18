import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTestProgress,
  clearTestProgress,
  DEFAULT_SHARD_TIMEOUT_MS,
  inspectTestProgress,
  resolveShardTimeoutMs,
  writeTestProgressAtomic
} from "../scripts/lib/test-progress.mjs";

test("partial shard progress is atomic, inspectable, and never authoritative", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fa-test-progress-"));
  const progress = buildTestProgress({
    command: "all",
    requestedShards: ["core", "runtime"],
    completedShards: [{ name: "core", status: 0, durationMs: 12, summary: { pass: 7, tests: 7 } }],
    currentShard: "runtime",
    startedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:01:00.000Z",
    runnerPid: 42,
    timeoutMs: 1200000
  });
  writeTestProgressAtomic(root, progress);
  const inspected = inspectTestProgress(root, { now: Date.parse("2026-08-02T12:02:00.000Z") });
  assert.equal(inspected.valid, true);
  assert.equal(inspected.authoritative, false);
  assert.equal(inspected.progress.currentShard, "runtime");
  assert.equal(inspected.progress.completedShards[0].passed, 7);
  assert.match(inspected.progress.disclaimer, /never a green test receipt/i);
  clearTestProgress(root);
  assert.equal(inspectTestProgress(root).exists, false);
});

test("failed and stale progress stays non-green evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fa-test-progress-"));
  writeTestProgressAtomic(root, buildTestProgress({
    command: "all",
    requestedShards: ["core"],
    currentShard: "core",
    status: "timed-out",
    startedAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:01:00.000Z",
    runnerPid: 42,
    failure: { exitCode: 124, reason: "bounded timeout" }
  }));
  const inspected = inspectTestProgress(root, {
    now: Date.parse("2026-08-02T11:00:00.000Z"),
    staleAfterMs: 60000
  });
  assert.equal(inspected.stale, true);
  assert.equal(inspected.authoritative, false);
  assert.equal(inspected.progress.status, "timed-out");
});

test("shard timeout resolution is bounded and rejects unsafe values", () => {
  // The behaviour under test is the *rule* — an explicit override above the floor
  // is honoured, anything below it or unparseable falls back to the declared
  // default. S90 re-declared that default from 20 to 45 minutes when the `long`
  // shard joined the canonical receipt, and this test failed for having written
  // `20 * 60 * 1000` out a second time rather than reading the authority. A test
  // that restates an implementation literal fails backwards: it reports a
  // deliberate, correct change as a defect while proving nothing about the rule.
  assert.equal(resolveShardTimeoutMs("45000"), 45000);
  assert.equal(resolveShardTimeoutMs("999"), DEFAULT_SHARD_TIMEOUT_MS);
  assert.equal(resolveShardTimeoutMs("not-a-number"), DEFAULT_SHARD_TIMEOUT_MS);
  assert.equal(resolveShardTimeoutMs(undefined), DEFAULT_SHARD_TIMEOUT_MS);

  // And the default itself must stay sane: long enough for the slowest canonical
  // shard (the realism decade alone runs ~12 minutes) and not absurd.
  assert.ok(DEFAULT_SHARD_TIMEOUT_MS >= 30 * 60 * 1000, "the default must clear the long shard's real runtime");
  assert.ok(DEFAULT_SHARD_TIMEOUT_MS <= 120 * 60 * 1000, "a timeout that never fires is not a timeout");
});
