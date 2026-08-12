import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReleaseProvenanceReport } from "../scripts/verify-release-provenance.mjs";
import { fingerprintArtifactDirectory } from "../scripts/lib/artifact-fingerprint.mjs";

const expected = {
  canonicalOrigin: "https://playfranchisearchitect.com",
  repository: "VaultSparkStudios/vaultspark-football-gm",
  sourceRevision: "abc123",
  artifactFingerprint: { algorithm: "sha256", digest: "f".repeat(64), files: 42, exclusions: ["_health", "deploy-manifest.json"] },
  styleAsset: "styles.abc123.css"
};

function fixture({ revision = "abc123", styleAsset = "styles.abc123.css", launchReady = false } = {}) {
  return { routes: {
    "/_health": { ok: true, statusCode: 200, body: JSON.stringify({ status: "ok", sourceRevision: revision, artifactFingerprint: expected.artifactFingerprint, styleAsset, launchReady }) },
    "/deploy-manifest.json": { ok: true, statusCode: 200, body: JSON.stringify({ ...expected, sourceRevision: revision, styleAsset }) },
    "/styles.abc123.css": { ok: true, statusCode: 200, body: "body{}" }
  } };
}

test("release provenance verifies the exact revision, asset, repository, and health truth", async () => {
  const report = await buildReleaseProvenanceReport({ expected, fixture: fixture() });
  assert.equal(report.summary.status, "verified");
  assert.equal(report.summary.checksPassed, report.summary.checksTotal);
});

test("release provenance blocks stale revisions and fabricated launch readiness", async () => {
  const report = await buildReleaseProvenanceReport({ expected, fixture: fixture({ revision: "stale456", launchReady: true }) });
  assert.equal(report.summary.status, "blocked");
  assert.equal(report.checks.find((check) => check.name === "source revision").ok, false);
  assert.equal(report.checks.find((check) => check.name === "launch truth separation").ok, false);
});

test("release provenance blocks byte-level artifact drift even at the same revision", async () => {
  const data = fixture();
  const manifest = JSON.parse(data.routes["/deploy-manifest.json"].body);
  manifest.artifactFingerprint = { ...expected.artifactFingerprint, digest: "0".repeat(64) };
  data.routes["/deploy-manifest.json"].body = JSON.stringify(manifest);
  const report = await buildReleaseProvenanceReport({ expected, fixture: data });
  assert.equal(report.summary.status, "blocked");
  assert.equal(report.checks.find((check) => check.name === "artifact fingerprint").ok, false);
});

test("artifact fingerprint is deterministic and changes with deployable bytes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fa-artifact-"));
  try {
    await fs.mkdir(path.join(dir, "lib"));
    await fs.writeFile(path.join(dir, "z.js"), "export const z = 1;");
    await fs.writeFile(path.join(dir, "lib", "a.js"), "export const a = 1;");
    await fs.writeFile(path.join(dir, "_health"), "volatile-one");
    await fs.writeFile(path.join(dir, "edge-policy-receipt.json"), JSON.stringify({ sourceRevision: "candidate" }));
    const first = await fingerprintArtifactDirectory(dir);
    await fs.writeFile(path.join(dir, "_health"), "volatile-two");
    await fs.writeFile(path.join(dir, "edge-policy-receipt.json"), JSON.stringify({ sourceRevision: "publication" }));
    assert.deepEqual(await fingerprintArtifactDirectory(dir), first, "source-bound evidence does not perturb deployable identity");
    assert.deepEqual(first.exclusions, ["_health", "deploy-manifest.json", "edge-policy-receipt.json"]);
    await fs.writeFile(path.join(dir, "lib", "a.js"), "export const a = 2;");
    const changed = await fingerprintArtifactDirectory(dir);
    assert.notEqual(changed.digest, first.digest);
    assert.equal(changed.files, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
