import { createHash } from "node:crypto";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function reportArtifact(report) {
  const check = report?.checks?.find((entry) => entry.name === "artifact fingerprint");
  return check?.ok === true && check.observed === check.expected ? check.observed : null;
}

const RECEIPT_ONLY_PREFIXES = ["docs/", "context/", "audits/", "test/"];
const RECEIPT_ONLY_FILES = new Set([
  "scripts/measure-hosted-performance.mjs",
  "scripts/write-visual-qa-receipt.mjs",
  "scripts/lib/release-authority.mjs",
  "scripts/reconcile-release-authority.mjs"
]);

export function evaluatePublicationDelta({ from = null, to = null, changedFiles = [] } = {}) {
  const files = [...new Set(changedFiles.map((file) => String(file).replace(/\\/g, "/")).filter(Boolean))];
  const unsafeFiles = files.filter((file) => !RECEIPT_ONLY_FILES.has(file) && !RECEIPT_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix)));
  return {
    from,
    to,
    changedFiles: files,
    unsafeFiles,
    verified: /^[a-f0-9]{40}$/i.test(from || "")
      && /^[a-f0-9]{40}$/i.test(to || "")
      && from !== to
      && files.length > 0
      && unsafeFiles.length === 0
  };
}

export function deriveReleaseAuthority({
  stagingReport,
  productionReport,
  visualReceipt,
  performanceReceipt,
  backendDeployment = null,
  emailVerified = false,
  founderApproved = false,
  lifecycleVerified = false,
  publicationDelta = null
} = {}) {
  const identities = {
    staging: { sourceRevision: stagingReport?.expectedRevision || null, artifactDigest: reportArtifact(stagingReport) },
    production: { sourceRevision: productionReport?.expectedRevision || null, artifactDigest: reportArtifact(productionReport) },
    visual: { sourceRevision: visualReceipt?.sourceRevision || null, artifactDigest: visualReceipt?.artifactFingerprint?.digest || null },
    performance: { sourceRevision: performanceReceipt?.sourceRevision || null, artifactDigest: performanceReceipt?.artifactFingerprint?.digest || null }
  };
  const checks = [
    { name: "staging verifier green", ok: stagingReport?.summary?.status === "verified" },
    { name: "production verifier green", ok: productionReport?.summary?.status === "verified" },
    { name: "visual pixels reviewed", ok: visualReceipt?.inspection?.renderedPixelsReviewed === true && visualReceipt?.inspection?.blockingDefectsOpen === 0 },
    { name: "hosted performance green", ok: performanceReceipt?.evaluation?.status === "verified" },
    {
      name: "one exact deployable source revision",
      ok: new Set([identities.staging, identities.visual, identities.performance].map((entry) => entry.sourceRevision).filter(Boolean)).size === 1
        && [identities.staging, identities.visual, identities.performance].every((entry) => /^[a-f0-9]{40}$/i.test(entry.sourceRevision || ""))
    },
    {
      name: "production source is candidate or verified receipt-only descendant",
      ok: identities.production.sourceRevision === identities.staging.sourceRevision
        || (publicationDelta?.verified === true
          && publicationDelta.from === identities.staging.sourceRevision
          && publicationDelta.to === identities.production.sourceRevision)
    },
    {
      name: "one exact artifact fingerprint",
      ok: new Set(Object.values(identities).map((entry) => entry.artifactDigest).filter(Boolean)).size === 1
        && Object.values(identities).every((entry) => /^[a-f0-9]{64}$/i.test(entry.artifactDigest || ""))
    }
  ];
  const evidenceVerified = checks.every((check) => check.ok);
  const blockers = [
    ...checks.filter((check) => !check.ok).map((check) => check.name),
    ...(!emailVerified ? ["email-delivery-unverified"] : []),
    ...(!founderApproved ? ["founder-approval-unverified"] : []),
    ...(!lifecycleVerified ? ["lifecycle-authority-unverified"] : [])
  ];
  const body = {
    schemaVersion: "1.0",
    kind: "unified-release-authority",
    observedAt: new Date().toISOString(),
    status: evidenceVerified ? "verified" : "blocked",
    sourceRevision: evidenceVerified ? identities.staging.sourceRevision : null,
    publicationRevision: evidenceVerified ? identities.production.sourceRevision : null,
    publicationDelta: publicationDelta || null,
    artifactFingerprint: evidenceVerified ? { algorithm: "sha256", digest: identities.staging.artifactDigest } : null,
    identities,
    checks,
    evidenceVerified,
    launchReady: evidenceVerified && emailVerified && founderApproved && lifecycleVerified,
    blockerCodes: blockers,
    backendAuthority: backendDeployment ? {
      sourceRevision: backendDeployment.sourceRevision || null,
      verifiedAt: backendDeployment.verifiedAt || null,
      note: "Backend runtime is independently attested and is not collapsed into the static artifact identity."
    } : null,
    receipts: {
      stagingSha256: stagingReport ? hash(stagingReport) : null,
      productionSha256: productionReport ? hash(productionReport) : null,
      visualSha256: visualReceipt ? hash(visualReceipt) : null,
      performanceSha256: performanceReceipt ? hash(performanceReceipt) : null
    }
  };
  return { ...body, receiptSha256: hash(body) };
}
