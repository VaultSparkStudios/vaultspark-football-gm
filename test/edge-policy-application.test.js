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

// ── Search indexing: staging must be noindex, production must not be ─────────

function indexingReport(origin, extraHeaders = {}, noindexHosts = ["staging.playfranchisearchitect.com", ":version.franchise-architect-staging.pages.dev"]) {
  return buildEdgePolicyAttestation({
    origin,
    receipt: { ...receipt, ...(noindexHosts ? { noindexHosts } : {}) },
    headers: { ...greenHeaders(), ...extraHeaders },
    health: { status: "ok", launchReady: false, sourceRevision: "abc123" },
    deployManifest: { sourceRevision: "abc123" },
    deliveredHtml: '<!doctype html><html><head><script type="module" src="./app.js"></script></head><body></body></html>',
    checkedAt: "2026-11-19T00:00:00.000Z"
  });
}

test("a staging origin is APPLIED only when it answers X-Robots-Tag: noindex", () => {
  const missing = indexingReport("https://staging.playfranchisearchitect.com/");
  assert.equal(missing.status, "HOLD", "a staging host that can be indexed is a duplicate of the site");
  assert.deepEqual(missing.missingHeaders, [], "every security header is present; only indexing holds it");
  assert.equal(missing.indexing.noindexExpected, true);
  assert.equal(missing.indexing.ok, false);
  assert.equal(indexingReport("https://staging.playfranchisearchitect.com/", { "x-robots-tag": "noindex" }).status, "APPLIED");
  assert.equal(indexingReport("https://a1b2c3d4.franchise-architect-staging.pages.dev/", { "X-Robots-Tag": "nosnippet, noindex" }).status, "APPLIED");
});

test("a production origin that answers noindex is HOLD, and an indexable one is APPLIED", () => {
  const wrong = indexingReport("https://playfranchisearchitect.com/", { "x-robots-tag": "noindex" });
  assert.equal(wrong.status, "HOLD", "noindex on production removes the real site from search");
  assert.equal(wrong.indexing.noindexExpected, false);
  assert.equal(wrong.indexing.ok, false);
  const right = indexingReport("https://playfranchisearchitect.com/");
  assert.equal(right.status, "APPLIED");
  assert.equal(right.indexing.ok, true);
  assert.equal(indexingReport("https://playfranchisearchitect.com/", { "x-robots-tag": "nosnippet" }).status, "APPLIED");
});

test("a receipt written before the indexing rule is not judged on it", () => {
  const report = indexingReport("https://staging.playfranchisearchitect.com/", {}, null);
  assert.equal(report.status, "APPLIED");
  assert.equal(report.indexing.declared, false);
});