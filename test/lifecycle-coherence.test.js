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

test("doctor preserves lifecycle truth and classifies live release-authority currency", () => {
  const result = spawnSync(process.execPath, ["scripts/ops.mjs", "doctor"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.ok(result.status === 0 || result.status === 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.blockingFailing, report.items.filter((item) => item.blocking && item.status === "failing").length);
  assert.equal(report.lifecycle.coherent, true);
  assert.equal(report.releaseCurrency.kind, "release-authority-currency");
});

test("doctor update-json persists the live lifecycle result instead of a stale startup score", () => {
  const lifecycle = inspectLifecycleCoherence(process.cwd());
  const before = JSON.parse(readFileSync(path.join(process.cwd(), "context", "PROJECT_STATUS.json"), "utf8"));
  const result = spawnSync(process.execPath, ["scripts/doctor.mjs", "--update-json", "--quiet"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.ok(result.status === 0 || result.status === 2, result.stderr || result.stdout);
  const status = JSON.parse(readFileSync(path.join(process.cwd(), "context", "PROJECT_STATUS.json"), "utf8"));
  assert.equal(status.lastUpdated, before.lastUpdated, "refreshing doctor evidence must not manufacture project activity");
  assert.equal(status.doctorScore.blockingFailing, status.doctorScore.failing);
  assert.ok(status.doctorScore.warning >= lifecycle.warning);
  assert.equal(status.doctorScore.total, status.doctorScore.passing + status.doctorScore.warning + status.doctorScore.blockingFailing);
  const lifecycleRegistryCheck = status.doctorScore.checks.find((check) => check.id === "lifecycle-authoritative-registry");
  if (lifecycle.warning > 0) {
    assert.ok(lifecycleRegistryCheck);
  } else {
    assert.equal(lifecycleRegistryCheck, undefined);
  }
});
