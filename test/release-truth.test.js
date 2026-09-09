import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseEvidenceFreshness, releaseTruthProse, validateReleaseEvidence, verifyReleaseEvidenceContract } from "../scripts/lib/release-truth.mjs";

const NOW = Date.parse("2026-08-02T16:00:00.000Z");

function report(overrides = {}) {
  const result = {
    schemaVersion: "1.0",
    generatedBy: "scripts/launch-evidence-report.mjs",
    checkedAt: "2026-08-02T15:30:00.000Z",
    baseUrl: "https://playfranchisearchitect.com",
    summary: { routesOk: true },
    routeChecks: [
      { route: "/", ok: true },
      { route: "/_health", ok: true, body: JSON.stringify({ status: "ok", launchReady: false, sourceRevision: "abc123" }) }
    ],
    emailForwarding: { status: "unverified", address: "football@playfranchisearchitect.com" },
    originEvidence: {
      healthReceiptValid: true,
      status: "verified",
      securityHeaders: { strictTransportSecurity: true, frameProtection: true, contentSecurityPolicy: true }
    }
  };
  return { ...result, ...overrides };
}

function validate(input, options = {}) {
  return validateReleaseEvidence({
    report: input,
    projectStatus: { runtimeUrl: "https://playfranchisearchitect.com/" },
    now: NOW,
    expectedRevision: "abc123",
    ...options
  });
}

test("route-green evidence remains launch HOLD when independent gates are red", () => {
  const result = validate(report());
  assert.equal(result.valid, true);
  assert.equal(result.contract.routes.verified, true);
  assert.equal(result.contract.launchReady, false);
  assert.deepEqual(result.contract.blockerCodes, [
    "email-delivery-unverified",
    "independent-staging-unverified",
    "founder-approval-unverified",
    "lifecycle-authority-unverified"
  ]);
  assert.match(result.contract.receiptSha256, /^[a-f0-9]{64}$/);
});

test("release evidence carries an explicit expiring observation window", () => {
  const result = validate(report());
  assert.equal(result.contract.schemaVersion, "1.1");
  assert.deepEqual(result.contract.evidenceWindow, {
    observedAt: "2026-08-02T15:30:00.000Z",
    maxAgeMs: 24 * 60 * 60 * 1000,
    expiresAt: "2026-08-03T15:30:00.000Z",
    statusAtIssue: "current"
  });
  const expired = evaluateReleaseEvidenceFreshness({ contract: result.contract, now: NOW + 25 * 60 * 60 * 1000 });
  assert.equal(expired.status, "expired");
  // The prose caller asks only "is the recorded evidence still in its window?",
  // so an absent live report is not a reason here (S101: `requireLive`).
  assert.deepEqual(expired.reasons, ["evidence-expired"]);
  assert.equal(expired.liveVerified, false);
});

test("live freshness detects origin, deployed, and candidate revision drift", () => {
  const contract = validate(report()).contract;
  const liveReport = report({
    routeChecks: [
      { route: "/", ok: true },
      { route: "/_health", ok: true, body: JSON.stringify({ status: "ok", sourceRevision: "def456" }) }
    ]
  });
  const drift = evaluateReleaseEvidenceFreshness({ contract, liveReport, expectedRevision: "candidate789", now: NOW });
  assert.equal(drift.status, "revision-drift");
  assert.ok(drift.reasons.includes("deployed-revision-drift"));
  assert.ok(drift.reasons.includes("candidate-revision-mismatch"));
  assert.equal(drift.liveRevision, "def456");
});

test("wrong origin, stale evidence, and missing revisions are rejected", () => {
  const wrongOrigin = validate(report({ baseUrl: "https://example.invalid" }));
  assert.ok(wrongOrigin.errors.includes("runtime-url-mismatch"));
  const stale = validate(report({ checkedAt: "2026-07-30T15:30:00.000Z" }));
  assert.ok(stale.errors.includes("receipt-stale"));
  const missingRevision = validate(report({
    routeChecks: [{ route: "/", ok: true }, { route: "/_health", ok: true, body: "{}" }]
  }));
  assert.ok(missingRevision.errors.includes("source-revision-missing"));
});

test("every gate must be verified before launchReady can become true", () => {
  const input = report({ emailForwarding: { status: "verified", address: "football@playfranchisearchitect.com" } });
  const result = validate(input, {
    stagingVerified: true,
    founderApprovalVerified: true,
    lifecycleAuthorityVerified: true
  });
  assert.equal(result.valid, true);
  assert.equal(result.contract.exactRevision.verified, true);
  assert.equal(result.contract.launchReady, true);
  assert.deepEqual(result.contract.blockerCodes, []);
});

test("a stale deployed revision is a distinct launch gate, not invalid origin evidence", () => {
  const result = validateReleaseEvidence({
    report: report(),
    projectStatus: { runtimeUrl: "https://playfranchisearchitect.com/" },
    now: NOW,
    expectedRevision: "new-main-revision"
  });
  assert.equal(result.valid, true);
  assert.equal(result.contract.evidenceValid, true);
  assert.equal(result.contract.exactRevision.verified, false);
  assert.ok(result.contract.blockerCodes.includes("exact-revision-mismatch"));
});

test("a checked-in release contract self-validates against its exact source receipt", () => {
  const source = report();
  const original = validate(source);
  assert.equal(verifyReleaseEvidenceContract({
    report: source,
    contract: original.contract,
    projectStatus: { runtimeUrl: "https://playfranchisearchitect.com/" },
    now: NOW
  }).valid, true);
  const changed = report({ routeChecks: [...source.routeChecks, { route: "/contact", ok: true }] });
  const drift = verifyReleaseEvidenceContract({
    report: changed,
    contract: original.contract,
    projectStatus: { runtimeUrl: "https://playfranchisearchitect.com/" },
    now: NOW
  });
  assert.equal(drift.valid, false);
  assert.ok(drift.mismatches.includes("contract-drift:receiptSha256"));
});

test("next milestone names only release gates that remain unverified", () => {
  const contract = validate(report(), { stagingVerified: true }).contract;
  const prose = releaseTruthProse(contract);
  assert.doesNotMatch(prose.nextMilestone, /independent staging/i);
  assert.doesNotMatch(prose.nextMilestone, /production parity/i);
  assert.match(prose.nextMilestone, /on-domain email/i);
  assert.match(prose.nextMilestone, /founder approval/i);
  assert.match(prose.nextMilestone, /lifecycle/i);
});

test("the two freshness questions are answered separately", () => {
  const contract = validate(report()).contract;

  // "Is the recorded evidence still inside its window?" — the prose caller.
  // That evidence WAS live-derived when issued, so age alone answers it.
  const windowOnly = evaluateReleaseEvidenceFreshness({ contract, now: NOW });
  assert.equal(windowOnly.status, "current");
  assert.equal(windowOnly.current, true);
  assert.equal(windowOnly.liveVerified, false, "but it must still report that nobody re-checked the origin");

  // "Does the live origin agree with what we recorded?" — the CLI gate. Without
  // a live report that question was silently answered "current" from a timestamp
  // this repo's own tooling writes, which is how a failed promote or a rollback
  // stayed green.
  const gate = evaluateReleaseEvidenceFreshness({ contract, now: NOW, requireLive: true });
  assert.equal(gate.status, "live-unverified");
  assert.equal(gate.current, false);
  assert.ok(gate.reasons.includes("live-unverified"));
});
