import crypto from "node:crypto";

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function lifecycleAuthorityFingerprint(lifecycle = {}) {
  return digest({
    slug: lifecycle.slug || null,
    expected: lifecycle.expectedVaultStatus || null,
    local: lifecycle.localVaultStatus || null,
    authoritative: lifecycle.authoritativeVaultStatus || null,
    drift: lifecycle.authoritativeDrift === true
  });
}

export function geniusAuthorityFingerprint(cache = {}) {
  return digest({
    status: cache.status || null,
    source: cache.source || null,
    items: Array.isArray(cache.items) ? cache.items.map((item) => item.slug || item.title || null) : [],
    closed: Array.isArray(cache.closed) ? cache.closed : [],
    exhaustedReason: cache.exhaustedReason || null
  });
}

export function describeProjectProfile(profile = null, lifecycle = {}, now = new Date()) {
  const generatedAt = profile?.generatedAt ? new Date(profile.generatedAt) : null;
  const ageHours = generatedAt && Number.isFinite(generatedAt.getTime())
    ? Math.max(0, (now.getTime() - generatedAt.getTime()) / 3_600_000)
    : null;
  const ttlMs = Number(profile?.ttlMs || 30 * 60 * 1000);
  const stale = ageHours == null || ageHours * 3_600_000 > ttlMs;
  const medium = profile?.medium || "—";
  const profileLine = stale
    ? `Profile · ${medium} · cache stale ${ageHours == null ? "unknown age" : `${Math.floor(ageHours / 24)}d`} · refresh required`
    : `Profile · ${medium} · ${profile?.stage || "—"} · arch=${profile?.archetype || "—"} · top-axis=${profile?.ignisTopAxes?.[0] || "—"}`;
  const local = lifecycle.localVaultStatus || lifecycle.expectedVaultStatus || "UNKNOWN";
  const authoritative = lifecycle.authoritativeVaultStatus || "unavailable";
  const authorityLine = lifecycle.authoritativeDrift
    ? `⚠ Lifecycle authority · local ${local} · registry ${authoritative} · DRIFT`
    : `✓ Lifecycle authority · local ${local} · registry ${authoritative}`;
  return {
    stale,
    ageHours,
    profileLine,
    authorityLine,
    policyLine: lifecycle.authoritativeDrift ? "Policy · reconcile via signed Studio Ark; never edit sibling truth" : null
  };
}

export function describeGeniusCache(cache = {}) {
  const items = Array.isArray(cache.items) ? cache.items : [];
  const closed = Array.isArray(cache.closed) ? cache.closed : [];
  return {
    status: cache.status || (items.length ? "open" : "unknown"),
    source: cache.source || "latest audit",
    items,
    closedCount: closed.length,
    exhausted: cache.status === "exhausted" && items.length === 0,
    reason: cache.exhaustedReason || null
  };
}
