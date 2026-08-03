import { createHash } from "node:crypto";

export const RELEASE_TRUTH_SCHEMA_VERSION = "1.1";
export const RELEASE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REQUIRED_HEADERS = ["strictTransportSecurity", "frameProtection", "contentSecurityPolicy"];

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function stableReceiptHash(report) {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}

function healthReceipt(report) {
  const health = report?.routeChecks?.find((entry) => entry.route === "/_health");
  try {
    return health?.body ? JSON.parse(health.body) : null;
  } catch {
    return null;
  }
}

export function evaluateReleaseEvidenceFreshness({ contract, now = Date.now(), liveReport = null, expectedRevision = null } = {}) {
  const observedAt = contract?.evidenceWindow?.observedAt || contract?.checkedAt || null;
  const observedAtMs = Date.parse(observedAt);
  const maxAgeMs = Number(contract?.evidenceWindow?.maxAgeMs || RELEASE_EVIDENCE_MAX_AGE_MS);
  const reasons = [];
  if (!Number.isFinite(observedAtMs)) reasons.push("observed-at-invalid");
  else if (now - observedAtMs > maxAgeMs) reasons.push("evidence-expired");
  else if (observedAtMs > now + 5 * 60 * 1000) reasons.push("observed-at-future");

  let liveRevision = null;
  if (liveReport) {
    liveRevision = healthReceipt(liveReport)?.sourceRevision || null;
    if (normalizeUrl(liveReport.baseUrl) !== normalizeUrl(contract?.runtimeUrl)) reasons.push("live-origin-mismatch");
    if (!liveRevision) reasons.push("live-revision-missing");
    else if (contract?.deployedRevision && liveRevision !== contract.deployedRevision) reasons.push("deployed-revision-drift");
    if (expectedRevision && liveRevision !== expectedRevision) reasons.push("candidate-revision-mismatch");
  }

  const status = reasons.some((reason) => reason === "evidence-expired")
    ? "expired"
    : reasons.some((reason) => reason.includes("revision") || reason.includes("origin"))
      ? "revision-drift"
      : reasons.length
        ? "unknown"
        : "current";
  return {
    status,
    current: status === "current",
    observedAt,
    expiresAt: Number.isFinite(observedAtMs) ? new Date(observedAtMs + maxAgeMs).toISOString() : null,
    maxAgeMs,
    deployedRevision: contract?.deployedRevision || null,
    liveRevision,
    expectedRevision,
    reasons
  };
}

export function validateReleaseEvidence({
  report,
  projectStatus = {},
  now = Date.now(),
  maxAgeMs = RELEASE_EVIDENCE_MAX_AGE_MS,
  expectedRevision = null,
  stagingVerified = false,
  founderApprovalVerified = false,
  lifecycleAuthorityVerified = false
} = {}) {
  const errors = [];
  if (report?.generatedBy !== "scripts/launch-evidence-report.mjs") errors.push("generator-mismatch");
  if (normalizeUrl(report?.baseUrl) !== normalizeUrl(projectStatus.runtimeUrl)) errors.push("runtime-url-mismatch");
  const checkedAtMs = Date.parse(report?.checkedAt);
  if (!Number.isFinite(checkedAtMs)) errors.push("checked-at-invalid");
  else {
    if (checkedAtMs > now + 5 * 60 * 1000) errors.push("checked-at-future");
    if (now - checkedAtMs > maxAgeMs) errors.push("receipt-stale");
  }
  const health = healthReceipt(report);
  const deployedRevision = typeof health?.sourceRevision === "string" && health.sourceRevision.trim()
    ? health.sourceRevision.trim()
    : null;
  if (!deployedRevision) errors.push("source-revision-missing");
  const routesVerified = report?.summary?.routesOk === true
    && Array.isArray(report?.routeChecks)
    && report.routeChecks.length > 0
    && report.routeChecks.every((entry) => entry.ok === true);
  if (!routesVerified) errors.push("routes-unverified");
  const originHealthVerified = report?.originEvidence?.healthReceiptValid === true
    && report?.originEvidence?.status === "verified";
  if (!originHealthVerified) errors.push("origin-health-unverified");
  const headers = Object.fromEntries(REQUIRED_HEADERS.map((key) => [key, report?.originEvidence?.securityHeaders?.[key] === true]));
  if (!Object.values(headers).every(Boolean)) errors.push("security-headers-unverified");
  const emailVerified = report?.emailForwarding?.status === "verified";
  const exactRevisionVerified = expectedRevision ? deployedRevision === expectedRevision : null;
  const evidenceValid = errors.length === 0;
  const launchReady = evidenceValid
    && emailVerified
    && exactRevisionVerified === true
    && stagingVerified === true
    && founderApprovalVerified === true
    && lifecycleAuthorityVerified === true;
  const blockerCodes = [
    ...errors,
    ...(!emailVerified ? ["email-delivery-unverified"] : []),
    ...(exactRevisionVerified !== true ? [expectedRevision ? "exact-revision-mismatch" : "exact-revision-unchecked"] : []),
    ...(!stagingVerified ? ["independent-staging-unverified"] : []),
    ...(!founderApprovalVerified ? ["founder-approval-unverified"] : []),
    ...(!lifecycleAuthorityVerified ? ["lifecycle-authority-unverified"] : [])
  ];
  return {
    valid: evidenceValid,
    errors,
    contract: {
      schemaVersion: RELEASE_TRUTH_SCHEMA_VERSION,
      kind: "structured-release-evidence",
      source: report?.generatedBy || null,
      receiptSha256: report ? stableReceiptHash(report) : null,
      checkedAt: report?.checkedAt || null,
      evidenceWindow: {
        observedAt: report?.checkedAt || null,
        maxAgeMs,
        expiresAt: Number.isFinite(checkedAtMs) ? new Date(checkedAtMs + maxAgeMs).toISOString() : null,
        statusAtIssue: evidenceValid ? "current" : "invalid"
      },
      runtimeUrl: normalizeUrl(report?.baseUrl),
      deployedRevision,
      routes: { verified: routesVerified, checked: report?.routeChecks?.length || 0 },
      originHealth: { verified: originHealthVerified, launchReadyClaim: health?.launchReady ?? null },
      securityHeaders: { ...headers, verified: Object.values(headers).every(Boolean) },
      emailDelivery: { verified: emailVerified, address: report?.emailForwarding?.address || null },
      exactRevision: { verified: exactRevisionVerified, expected: expectedRevision },
      independentStaging: { verified: stagingVerified },
      founderApproval: { verified: founderApprovalVerified },
      lifecycleAuthority: { verified: lifecycleAuthorityVerified },
      evidenceValid,
      launchReady,
      blockerCodes: [...new Set(blockerCodes)]
    }
  };
}

export function releaseTruthProse(contract) {
  const green = [];
  if (contract.routes.verified) green.push(`${contract.routes.checked} production routes`);
  if (contract.originHealth.verified) green.push(`origin health at ${contract.deployedRevision}`);
  if (contract.securityHeaders.verified) green.push("required edge headers");
  const proven = green.length ? `${green.join(", ")} verified` : "no production surface proof verified";
  const freshness = evaluateReleaseEvidenceFreshness({ contract });
  const freshnessPhrase = freshness.current ? `evidence current through ${freshness.expiresAt}` : `evidence ${freshness.status}`;
  return {
    currentFocus: `Release truth is receipt-derived: ${proven}; ${freshnessPhrase}. Launch remains ${contract.launchReady && freshness.current ? "READY" : "HOLD"}; independent gates are not collapsed.`,
    nextMilestone: "Verify an independent staging origin at the exact candidate revision, then prove production revision parity, delivered on-domain email, founder approval, and authoritative lifecycle before any launch flip.",
    blockers: contract.launchReady && freshness.current ? [] : [`Launch HOLD — ${[...new Set([...contract.blockerCodes, ...freshness.reasons])].join(", ")}.`]
  };
}

export function verifyReleaseEvidenceContract({ report, contract, projectStatus = {}, now = Date.now(), maxAgeMs = RELEASE_EVIDENCE_MAX_AGE_MS } = {}) {
  if (!contract) return { valid: false, mismatches: ["contract-missing"] };
  const recomputed = validateReleaseEvidence({
    report,
    projectStatus,
    now,
    maxAgeMs,
    expectedRevision: contract.exactRevision?.expected || null,
    stagingVerified: contract.independentStaging?.verified === true,
    founderApprovalVerified: contract.founderApproval?.verified === true,
    lifecycleAuthorityVerified: contract.lifecycleAuthority?.verified === true
  });
  const mismatches = [...recomputed.errors];
  for (const key of ["receiptSha256", "runtimeUrl", "deployedRevision", "evidenceValid", "launchReady"]) {
    if (recomputed.contract[key] !== contract[key]) mismatches.push(`contract-drift:${key}`);
  }
  if (JSON.stringify(recomputed.contract.evidenceWindow) !== JSON.stringify(contract.evidenceWindow)) {
    mismatches.push("contract-drift:evidenceWindow");
  }
  if (JSON.stringify(recomputed.contract.blockerCodes) !== JSON.stringify(contract.blockerCodes)) {
    mismatches.push("contract-drift:blockerCodes");
  }
  return { valid: mismatches.length === 0, mismatches: [...new Set(mismatches)], recomputed: recomputed.contract };
}
