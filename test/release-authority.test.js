import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveReleaseAuthority, evaluatePublicationDelta } from "../scripts/lib/release-authority.mjs";
import { evaluateReleaseAuthorityCurrency } from "../scripts/check-release-authority-currency.mjs";

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

test("a production receipt-only descendant keeps one deployable authority", () => {
  const publicationRevision = "c".repeat(40);
  const publicationReport = { ...report, expectedRevision: publicationRevision };
  const publicationDelta = evaluatePublicationDelta({
    from: revision,
    to: publicationRevision,
    changedFiles: [
      "docs/visual-qa/LATEST.json",
      "context/PROJECT_STATUS.json",
      "logs/WORK_LOG.md",
      "portfolio/BLOCKER_DISCIPLINE_LOG.ndjson",
      "reports/s98-production.json",
      "scripts/write-visual-qa-receipt.mjs"
    ]
  });
  const authority = deriveReleaseAuthority({
    stagingReport: report,
    productionReport: publicationReport,
    visualReceipt: visual,
    performanceReceipt: performance,
    publicationDelta
  });
  assert.equal(publicationDelta.verified, true);
  assert.equal(authority.status, "verified");
  assert.equal(authority.sourceRevision, revision);
  assert.equal(authority.publicationRevision, publicationRevision);
});

test("Pages production publication is explicit and bound to exact stable-staging identity", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /candidate_revision:[\s\S]*required: true/);
  assert.match(workflow, /staging_artifact_digest:[\s\S]*required: true/);
  assert.match(workflow, /SOURCE_REVISION: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.candidate_revision \|\| github\.sha \}\}/);
  assert.match(workflow, /Bind production promotion to the exact staged candidate[\s\S]*git rev-parse HEAD/);
  assert.match(workflow, /verify-promotion-bind\.mjs --manifest static\/deploy-manifest\.json --staging-url https:\/\/staging\.playfranchisearchitect\.com/);
  assert.doesNotMatch(workflow, /process\.exit\(2\)/);
  assert.match(workflow, /Verify stable staging serves the exact promotion candidate[\s\S]*verify-staging-receipt\.mjs/);
  assert.match(workflow, /name: Publish to Cloudflare Pages \(live origin\)\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(workflow, /name: Verify the live origin serves this build\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(workflow, /deploy:\s+needs: build\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
  assert.doesNotMatch(workflow, /--commit-hash="\$\{GITHUB_SHA\}"/);
});

test("release currency distinguishes current evidence, stale claims, safe receipt descendants, and unknown live state", () => {
  const candidate = "a".repeat(40);
  const publication = "b".repeat(40);
  const identityDigest = "c".repeat(64);
  const status = {
    stagingAuthority: { sourceRevision: candidate, artifactFingerprint: { digest: identityDigest } },
    releaseAuthority: {
      status: "verified",
      evidenceVerified: true,
      sourceRevision: candidate,
      publicationRevision: publication,
      artifactFingerprint: { digest: identityDigest }
    }
  };
  const current = evaluateReleaseAuthorityCurrency({
    headRevision: publication,
    status,
    stagingHealth: { sourceRevision: candidate, artifactFingerprint: { digest: identityDigest } },
    productionHealth: { sourceRevision: publication, artifactFingerprint: { digest: identityDigest } }
  });
  assert.equal(current.status, "current");
  assert.equal(current.blockingFailing, 0);

  const stale = evaluateReleaseAuthorityCurrency({
    headRevision: publication,
    status,
    stagingHealth: { sourceRevision: "d".repeat(40), artifactFingerprint: { digest: identityDigest } },
    productionHealth: { sourceRevision: "e".repeat(40), artifactFingerprint: { digest: identityDigest } }
  });
  assert.equal(stale.status, "contradicted");
  // S101 — was 3. `git-head-covered-by-publication` used to hardcode
  // `contradiction: false`, so the one question that matters — "is what is on
  // main actually live?" — could never block. Here HEAD is the publication
  // revision while production reports something else, which is exactly that
  // contradiction, and it now counts.
  assert.equal(stale.blockingFailing, 4);
  const headCheck = stale.items.find((item) => item.id === "release-authority-git-head-covered-by-publication");
  assert.ok(headCheck, "an uncovered HEAD must be reported");
  assert.equal(headCheck.blocking, true);

  const receiptHead = "f".repeat(40);
  const safeHead = evaluateReleaseAuthorityCurrency({
    headRevision: receiptHead,
    headChangedFiles: ["docs/CLOSEOUT.md", "context/PROJECT_STATUS.json"],
    status,
    stagingHealth: { sourceRevision: candidate, artifactFingerprint: { digest: identityDigest } },
    productionHealth: { sourceRevision: publication, artifactFingerprint: { digest: identityDigest } }
  });
  assert.equal(safeHead.status, "current");
  assert.equal(safeHead.receiptOnlyHead.verified, true);

  const unknown = evaluateReleaseAuthorityCurrency({ headRevision: publication, status, stagingError: "offline", productionError: "offline" });
  assert.equal(unknown.blockingFailing, 0);
  assert.ok(unknown.warning >= 2);
});

test("a deployable publication delta is never treated as receipt-only", () => {
  const delta = evaluatePublicationDelta({ from: revision, to: "c".repeat(40), changedFiles: ["public/app.js", "docs/visual-qa/LATEST.json"] });
  assert.equal(delta.verified, false);
  assert.deepEqual(delta.unsafeFiles, ["public/app.js"]);
});

test("an origin that answers without identifying itself contradicts a verified release claim", () => {
  const candidate = "a".repeat(40);
  const digest = "c".repeat(64);
  const status = {
    stagingAuthority: { sourceRevision: candidate, artifactFingerprint: { digest } },
    releaseAuthority: {
      status: "verified",
      evidenceVerified: true,
      sourceRevision: candidate,
      publicationRevision: candidate,
      artifactFingerprint: { digest }
    }
  };

  // Unreachable origin: genuinely unknown, must stay a warning.
  const unreachable = evaluateReleaseAuthorityCurrency({
    headRevision: candidate,
    status,
    stagingHealth: null,
    productionHealth: null,
    stagingError: "production unknown: fetch failed",
    productionError: "production unknown: fetch failed"
  });
  assert.equal(unreachable.blockingFailing, 0, "an unreachable origin is unknown, not a contradiction");

  // Origin answered and declined to say what it is running: that contradicts a
  // verified claim and used to be filed as a warning.
  const anonymous = evaluateReleaseAuthorityCurrency({
    headRevision: candidate,
    status,
    stagingHealth: { artifactFingerprint: { digest } },
    productionHealth: { artifactFingerprint: { digest } }
  });
  assert.ok(anonymous.blockingFailing > 0, "an origin that answers without a revision must be able to block");
});
