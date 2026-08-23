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

test("host attestation requires headers, exact revision, hashes, honest health, and document agreement", () => {
  const report = buildEdgePolicyAttestation({
    origin: "https://example.test/",
    receipt,
    headers: greenHeaders(),
    health: { status: "ok", launchReady: false, sourceRevision: "abc123" },
    deployManifest: { sourceRevision: "abc123" },
    // S94: the delivered document is now part of the attestation. Green headers
    // on a document the policy refuses is the exact state production was in.
    deliveredHtml: '<!doctype html><html><head><script type="module" src="./app.js"></script></head><body></body></html>',
    checkedAt: "2026-07-29T00:00:00.000Z"
  });
  assert.equal(report.status, "APPLIED");
  assert.equal(report.revisionMatches, true);
  assert.deepEqual(report.missingHeaders, []);
  assert.deepEqual(report.missingInlineScriptHashes, []);
  assert.equal(report.deliveredDocumentProved, true);
  assert.deepEqual(report.deliveredDocumentViolations, []);
});

test("S94: everything else green plus a refused document is HOLD, not APPLIED", () => {
  const report = buildEdgePolicyAttestation({
    origin: "https://example.test/",
    receipt,
    headers: greenHeaders(),
    health: { status: "ok", launchReady: false, sourceRevision: "abc123" },
    deployManifest: { sourceRevision: "abc123" },
    // The edge injects a script the policy does not admit — production's actual
    // state for an unknown number of sessions, and previously invisible here.
    deliveredHtml: '<script src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>',
    checkedAt: "2026-07-29T00:00:00.000Z"
  });
  assert.equal(report.status, "HOLD");
  assert.deepEqual(report.missingHeaders, [], "the headers themselves are fine");
  assert.equal(report.deliveredDocumentOk, false);
  assert.ok(report.deliveredDocumentViolations.some((v) => v.origin === "https://static.cloudflareinsights.com"));
});

test("S94: an unsupplied document is UNPROVED, and unproved never reads as APPLIED", () => {
  const report = buildEdgePolicyAttestation({
    origin: "https://example.test/",
    receipt,
    headers: greenHeaders(),
    health: { status: "ok", launchReady: false, sourceRevision: "abc123" },
    deployManifest: { sourceRevision: "abc123" },
    checkedAt: "2026-07-29T00:00:00.000Z"
  });
  assert.equal(report.deliveredDocumentProved, false);
  assert.equal(report.status, "HOLD", "silence about the document is not evidence about the document");
  assert.match(report.deliveredDocumentNote, /UNPROVED/);
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
