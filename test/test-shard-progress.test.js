import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTestProgress,
  clearTestProgress,
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
  assert.equal(resolveShardTimeoutMs("45000"), 45000);
  assert.equal(resolveShardTimeoutMs("999"), 20 * 60 * 1000);
  assert.equal(resolveShardTimeoutMs("not-a-number"), 20 * 60 * 1000);
});
