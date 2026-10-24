import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { runShard } from "../scripts/run-test-shard.mjs";
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
  assert.equal(resolveShardTimeoutMs(undefined, 'sim-contract'), 150 * 60 * 1000);
  assert.equal(resolveShardTimeoutMs('45000', 'sim-contract'), 45000);

  // And the default itself must stay sane: long enough for the slowest canonical
  // shard (the realism decade alone runs ~12 minutes) and not absurd.
  assert.ok(DEFAULT_SHARD_TIMEOUT_MS >= 30 * 60 * 1000, "the default must clear the long shard's real runtime");
  assert.ok(DEFAULT_SHARD_TIMEOUT_MS <= 120 * 60 * 1000, "a timeout that never fires is not a timeout");
});

test("shard termination preserves signals and bounded spawn errors instead of an unexplained exit 1", () => {
  for (const child of [
    { status: null, signal: "SIGKILL" },
    { status: null, error: Object.assign(new Error("missing executable"), { code: "ENOENT" }) },
    { status: null, signal: "SIGTERM", error: Object.assign(new Error("buffer overflow " + "x".repeat(5000)), { code: "ENOBUFS" }) },
    { status: null, signal: "SIGTERM", error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) }
  ]) {
    let diagnostic = "";
    const result = runShard("runtime", {
      timeoutMs: 1000,
      spawn: (_command, args, options) => {
        assert.ok(args.includes("--test-force-exit"));
        assert.equal(options.maxBuffer, 16 * 1024 * 1024);
        assert.equal(options.timeout, 1000);
        return { stdout: "# tests 1\n# pass 1\n# fail 0\n", stderr: "", ...child };
      },
      stdout: { write() {} },
      stderr: { write(value) { diagnostic += value; } }
    });
    assert.equal(result.status, child.error?.code === "ETIMEDOUT" ? 124 : 1);
    assert.equal(result.childExitCode, null);
    assert.equal(result.signal, child.signal || null);
    assert.equal(result.error?.code, child.error?.code);
    assert.equal(result.summary.valid, false, "even a captured green summary cannot hide process termination");
    const metadata = JSON.parse(diagnostic.trim().replace(/^Shard termination: /, ""));
    assert.equal(metadata.signal, child.signal || null);
    assert.equal(metadata.error?.code, child.error?.code);
    assert.ok(diagnostic.length < 1500, "termination diagnostics stay bounded");
  }
});

test("the real shard CLI drains large child stdout and stderr before returning failure", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fa-shard-cli-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("fa-shard-cli-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  // Intercept only the CLI's test child. The real runner, progress writer, output
  // forwarding and entrypoint execute normally; no actual shard is launched.
  const preload = `
    import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const original = cp.spawnSync;
    cp.spawnSync = (command, args, options) => args?.includes('--test')
      ? { status: 1, signal: null, stdout: 'o'.repeat(2 * 1024 * 1024) + '\\nSTDOUT-END\\n',
          stderr: 'e'.repeat(2 * 1024 * 1024) + '\\nSTDERR-END\\n' }
      : original(command, args, options);
    syncBuiltinESMExports();
    // Windows pipes can flush synchronously. Model asynchronous pipe writes
    // explicitly so the premature-exit regression is portable and deterministic.
    for (const stream of [process.stdout, process.stderr]) {
      const write = stream.write.bind(stream);
      stream.write = (...args) => { setImmediate(() => write(...args)); return false; };
    }
  `;
  const child = spawnSync(process.execPath, [
    "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
    fileURLToPath(new URL("../scripts/run-test-shard.mjs", import.meta.url)), "runtime"
  ], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  assert.ok(child.stdout.endsWith("o".repeat(2 * 1024 * 1024) + "\nSTDOUT-END\n"));
  assert.ok(child.stderr.startsWith("e".repeat(2 * 1024 * 1024) + "\nSTDERR-END\n"));
  assert.match(child.stderr, /Shard termination: .*"childExitCode":1/);
  const progress = inspectTestProgress(root).progress;
  assert.equal(progress.status, "failed");
  assert.equal(progress.failure.childExitCode, 1);
});
