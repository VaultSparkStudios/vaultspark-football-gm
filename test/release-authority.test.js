import test from "node:test";
import assert from "node:assert/strict";
import { deriveReleaseAuthority } from "../scripts/lib/release-authority.mjs";

const revision = "a".repeat(40);
const digest = "b".repeat(64);
const report = { expectedRevision: revision, summary: { status: "verified" }, checks: [{ name: "artifact fingerprint", ok: true, expected: digest, observed: digest }] };
const visual = { sourceRevision: revision, artifactFingerprint: { digest }, inspection: { renderedPixelsReviewed: true, blockingDefectsOpen: 0 } };
const performance = { sourceRevision: revision, artifactFingerprint: { digest }, evaluation: { status: "verified" } };

test("unified release authority requires exact staging, production, visual, and performance identity", () => {
  const authority = deriveReleaseAuthority({ stagingReport: report, productionReport: report, visualReceipt: visual, performanceReceipt: performance });
  assert.equal(authority.status, "verified");
  assert.equal(authority.sourceRevision, revision);
  assert.equal(authority.artifactFingerprint.digest, digest);
  assert.equal(authority.launchReady, false);
  assert.deepEqual(authority.blockerCodes, ["email-delivery-unverified", "founder-approval-unverified", "lifecycle-authority-unverified"]);
});
test("artifact drift fails closed without erasing the independent launch blockers", () => {
  const drifted = { ...performance, artifactFingerprint: { digest: "c".repeat(64) } };
  const authority = deriveReleaseAuthority({ stagingReport: report, productionReport: report, visualReceipt: visual, performanceReceipt: drifted });
  assert.equal(authority.status, "blocked");
  assert.equal(authority.sourceRevision, null);
  assert.ok(authority.blockerCodes.includes("one exact artifact fingerprint"));
  assert.ok(authority.blockerCodes.includes("founder-approval-unverified"));
});

test("launch readiness only follows all evidence and independent gates", () => {
  const authority = deriveReleaseAuthority({
    stagingReport: report,
    productionReport: report,
    visualReceipt: visual,
    performanceReceipt: performance,
    emailVerified: true,
    founderApproved: true,
    lifecycleVerified: true
  });
  assert.equal(authority.launchReady, true);
  assert.deepEqual(authority.blockerCodes, []);
});
