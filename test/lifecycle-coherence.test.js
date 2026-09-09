import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
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

// S101: the previous version of this test asserted
//   assert.equal(result.authoritativeDrift, result.authoritativeVaultStatus !== result.expectedVaultStatus)
// which restates the implementation's own expression back at itself -- true for
// every possible implementation, including a gutted one -- and skipped entirely
// when no registry resolved. The test named for drift detection had never been
// capable of going red. These three cases are its negative control: a fixture
// registry that disagrees must produce drift, one that agrees must not, and an
// unresolvable registry must report itself unverified rather than disappear.

function registryFixture(t, vaultStatus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-registry-"));
  const file = path.join(dir, "PROJECT_REGISTRY.json");
  const slug = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "context", "LIFECYCLE_COHERENCE.json"), "utf8")
  ).slug;
  fs.writeFileSync(file, JSON.stringify({ projects: [{ slug, vaultStatus }] }));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return file;
}

test("a disagreeing authoritative registry is explicit drift, not a silent local rewrite", (t) => {
  const result = inspectLifecycleCoherence(process.cwd(), {
    registryPath: registryFixture(t, "SPARKED")
  });

  assert.equal(result.expectedVaultStatus, "FORGE");
  assert.equal(result.authoritativeVaultStatus, "SPARKED");
  assert.equal(result.authoritativeDrift, true);
  assert.equal(result.authoritativeUnverified, false);

  const check = result.checks.find((entry) => entry.id === "authoritative-registry");
  assert.ok(check, "drift must be reported as a check, not only as a flag");
  assert.equal(check.ok, false);
  assert.equal(check.resolution, "resolved");
  // Drift is a warning the project must resolve upstream; it must never rewrite
  // the local contract, and must never block on its own.
  assert.equal(check.blocking, false);
  assert.equal(result.blockingFailing, 0);
  assert.equal(result.localVaultStatus, "FORGE");
});

test("an agreeing authoritative registry is not drift", (t) => {
  const result = inspectLifecycleCoherence(process.cwd(), {
    registryPath: registryFixture(t, "FORGE")
  });

  assert.equal(result.authoritativeDrift, false);
  assert.equal(result.authoritativeUnverified, false);
  const check = result.checks.find((entry) => entry.id === "authoritative-registry");
  assert.equal(check.ok, true);
  assert.equal(result.warning, 0);
});

test("an unresolvable authoritative registry is reported unverified, not omitted", () => {
  const result = inspectLifecycleCoherence(process.cwd(), { registryPath: "missing-registry.json" });

  const check = result.checks.find((entry) => entry.id === "authoritative-registry");
  assert.ok(check, "an unreachable registry must still produce a check — a vanishing population hides the signal");
  assert.equal(check.ok, false);
  assert.equal(check.resolution, "unreachable");
  assert.equal(result.authoritativeUnverified, true);
  assert.equal(result.blockingFailing, 0, "unverified is a warning, not a block");
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
