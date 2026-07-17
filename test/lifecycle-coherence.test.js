import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { inspectLifecycleCoherence } from "../scripts/lifecycle-coherence.mjs";

test("local lifecycle truth is coherent and remains evidence-gated", () => {
  const result = inspectLifecycleCoherence(process.cwd(), { registryPath: "missing-registry.json" });
  assert.equal(result.blockingFailing, 0);
  assert.equal(result.localVaultStatus, "FORGE");
  assert.equal(result.audience, "public-unlaunched");
  assert.equal(result.checks.find((check) => check.id === "launch-blocker").ok, true);
  assert.equal(result.checks.find((check) => check.id === "public-status").ok, true);
});

test("authoritative registry mismatch is explicit drift, not a silent local rewrite", () => {
  const result = inspectLifecycleCoherence(process.cwd());
  assert.equal(result.blockingFailing, 0);
  if (result.authoritativeVaultStatus) {
    assert.equal(result.authoritativeDrift, result.authoritativeVaultStatus !== result.expectedVaultStatus);
  }
});

test("doctor reports blockingFailing zero while preserving lifecycle warnings", () => {
  const result = spawnSync(process.execPath, ["scripts/ops.mjs", "doctor"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.blockingFailing, 0);
  assert.equal(report.lifecycle.coherent, true);
});

test("doctor update-json persists the live lifecycle result instead of a stale startup score", () => {
  const lifecycle = inspectLifecycleCoherence(process.cwd());
  const result = spawnSync(process.execPath, ["scripts/doctor.mjs", "--update-json", "--quiet"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const status = JSON.parse(readFileSync(path.join(process.cwd(), "context", "PROJECT_STATUS.json"), "utf8"));
  assert.equal(status.doctorScore.blockingFailing, 0);
  assert.equal(status.doctorScore.warning, lifecycle.warning);
  assert.equal(status.doctorScore.total, status.doctorScore.passing + status.doctorScore.warning);
  if (lifecycle.warning > 0) {
    assert.equal(status.doctorScore.checks[0].id, "lifecycle-authoritative-registry");
  } else {
    assert.deepEqual(status.doctorScore.checks, []);
  }
});
