import test from "node:test";
import assert from "node:assert/strict";
import { buildReleaseProvenanceReport } from "../scripts/verify-release-provenance.mjs";

const expected = {
  canonicalOrigin: "https://playfranchisearchitect.com",
  repository: "VaultSparkStudios/vaultspark-football-gm",
  sourceRevision: "abc123",
  styleAsset: "styles.abc123.css"
};

function fixture({ revision = "abc123", styleAsset = "styles.abc123.css", launchReady = false } = {}) {
  return { routes: {
    "/_health": { ok: true, statusCode: 200, body: JSON.stringify({ status: "ok", sourceRevision: revision, styleAsset, launchReady }) },
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
