import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reconcileStagingAuthority, validateStagingAuthorityReceipt } from "../scripts/reconcile-staging-authority.mjs";

const revision = "a".repeat(40);
const receipt = {
  schemaVersion: "1.1",
  kind: "independent-staging-authority",
  sourceRevision: revision,
  artifactFingerprint: { algorithm: "sha256", digest: "b".repeat(64), fileCount: 42 },
  deploymentId: "deployment-1",
  stableUrl: "https://staging.playfranchisearchitect.com",
  domainStatus: "active",
  independent: true,
  exactRevision: true,
  exactArtifact: true,
  provenance: { status: "verified", checksPassed: 9, checksTotal: 9 },
  rollback: { previousDeploymentId: "deployment-0", available: true },
  verified: true,
  observedAt: "2026-08-03T12:00:00.000Z"
};

test("staging authority rejects receipts that collapse any independent proof", () => {
  assert.equal(validateStagingAuthorityReceipt(receipt, revision).valid, true);
  for (const mutation of [
    { verified: false },
    { independent: false },
    { domainStatus: "pending" },
    { exactRevision: false },
    { exactArtifact: false },
    { provenance: { status: "failed" } }
  ]) {
    assert.equal(validateStagingAuthorityReceipt({ ...receipt, ...mutation }, revision).valid, false);
  }
});

test("staging authority updates PROJECT_STATUS only from the exact verified receipt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "franchise-staging-authority-"));
  fs.mkdirSync(path.join(root, "context"));
  fs.writeFileSync(path.join(root, "context", "PROJECT_STATUS.json"), JSON.stringify({
    silMax: 1000,
    silScore: 1000,
    silCategoriesV3: {
      devHealth: 100,
      creativeAlignment: 100,
      momentum: 100,
      engagement: 100,
      processQuality: 100,
      crossRepoCoherence: 100,
      securityPosture: 100,
      ecosystemIntegration: 100,
      capitalEfficiency: 100,
      automationCoverage: 100
    },
    testingSurfaces: [{ type: "staging", label: "Old", url: "https://old.invalid" }]
  }));
  const authority = reconcileStagingAuthority({ root, receipt, expectedRevision: revision });
  const status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8"));
  assert.equal(status.stagingType, "cloudflare-pages");
  assert.equal(status.stagingUrl, receipt.stableUrl);
  assert.equal(status.stagingAuthority.receiptSha256, authority.receiptSha256);
  assert.deepEqual(status.testingSurfaces.filter((entry) => entry.type === "staging").map((entry) => entry.url), [receipt.stableUrl]);
  assert.doesNotThrow(() => reconcileStagingAuthority({ root, receipt, expectedRevision: revision, checkOnly: true }));
});