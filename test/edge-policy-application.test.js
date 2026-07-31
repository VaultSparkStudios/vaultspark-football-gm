import test from "node:test";
import assert from "node:assert/strict";
import { buildEdgePolicyAttestation } from "../scripts/verify-edge-policy-application.mjs";

const hash = "'sha256-fixture='";
const receipt = {
  policyFingerprint: "sha256:policy",
  sourceRevision: "abc123",
  inlineScriptHashes: [hash]
};

function greenHeaders() {
  return {
    "strict-transport-security": "max-age=31536000",
    "content-security-policy": `default-src 'self'; script-src 'self' ${hash}`,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()"
  };
}

test("host attestation requires headers, exact revision, hashes, and honest health", () => {
  const report = buildEdgePolicyAttestation({
    origin: "https://example.test/",
    receipt,
    headers: greenHeaders(),
    health: { status: "ok", launchReady: false, sourceRevision: "abc123" },
    deployManifest: { sourceRevision: "abc123" },
    checkedAt: "2026-07-29T00:00:00.000Z"
  });
  assert.equal(report.status, "APPLIED");
  assert.equal(report.revisionMatches, true);
  assert.deepEqual(report.missingHeaders, []);
  assert.deepEqual(report.missingInlineScriptHashes, []);
});

test("source-green policy never fabricates a hosted application receipt", () => {
  const report = buildEdgePolicyAttestation({
    origin: "https://example.test/",
    receipt,
    headers: { "x-content-type-options": "nosniff" },
    health: null,
    deployManifest: { sourceRevision: "older" }
  });
  assert.equal(report.status, "HOLD");
  assert.equal(report.revisionMatches, false);
  assert.ok(report.missingHeaders.includes("content-security-policy"));
  assert.deepEqual(report.missingInlineScriptHashes, [hash]);
  assert.equal(report.owningHostApplicationPayload.status, "HOLD");
});
