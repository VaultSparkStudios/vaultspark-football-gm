import { createHash } from "node:crypto";

export const HOSTED_PERFORMANCE_THRESHOLDS = Object.freeze({ lcpMs: 1800, inpMs: 200, cls: 0.1 });

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function percentile(values, percentileRank = 0.5) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileRank) - 1));
  return sorted[index];
}

export function evaluateHostedPerformance({ profiles = [], sourceRevision = null, artifactFingerprint = null, edgeHeaders = {}, thresholds = HOSTED_PERFORMANCE_THRESHOLDS } = {}) {
  const checks = [];
  const add = (name, ok, observed = null, expected = null) => checks.push({ name, ok, observed, expected });
  add("source revision is immutable", /^[a-f0-9]{40}$/i.test(sourceRevision || ""), sourceRevision, "40-character git SHA");
  add("artifact fingerprint is immutable", /^[a-f0-9]{64}$/i.test(artifactFingerprint?.digest || ""), artifactFingerprint?.digest || null, "sha256");
  add("hosted Strict-Transport-Security observed", Boolean(edgeHeaders["strict-transport-security"]), edgeHeaders["strict-transport-security"] || null, "present");
  add("hosted Content-Security-Policy observed", Boolean(edgeHeaders["content-security-policy"]), edgeHeaders["content-security-policy"] || null, "present");
  add("hosted frame protection observed", Boolean(edgeHeaders["x-frame-options"]), edgeHeaders["x-frame-options"] || null, "present");
  for (const profile of profiles) {
    const label = profile.name || "unknown";
    add(`${label} LCP`, Number.isFinite(profile.lcpMs) && profile.lcpMs < thresholds.lcpMs, profile.lcpMs, `< ${thresholds.lcpMs}ms`);
    add(`${label} INP`, Number.isFinite(profile.inpMs) && profile.inpMs <= thresholds.inpMs, profile.inpMs, `<= ${thresholds.inpMs}ms`);
    add(`${label} CLS`, Number.isFinite(profile.cls) && profile.cls <= thresholds.cls, profile.cls, `<= ${thresholds.cls}`);
    add(`${label} deliberate interaction observed`, profile.interactionObserved === true, profile.interactionObserved === true, true);
  }
  add("desktop and mobile measured", ["desktop", "mobile"].every((name) => profiles.some((profile) => profile.name === name)), profiles.map((profile) => profile.name), ["desktop", "mobile"]);
  const failures = checks.filter((check) => !check.ok).map((check) => check.name);
  return { status: failures.length ? "blocked" : "verified", checks, failures, thresholds };
}
