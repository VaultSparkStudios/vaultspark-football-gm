import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  cache = cache && typeof cache === "object" ? cache : {};
  return digest({
    status: cache.status || null,
    source: cache.source || null,
    items: Array.isArray(cache.items) ? cache.items.map((item) => item.slug || item.title || null) : [],
    closed: Array.isArray(cache.closed) ? cache.closed : [],
    exhaustedReason: cache.exhaustedReason || null
  });
}

export function readCommittedGeniusAuthority(root) {
  const docsDir = path.join(root, "docs");
  let names = [];
  try {
    names = fs.readdirSync(docsDir)
      .filter((name) => /^AUDIT_\d{4}-\d{2}-\d{2}\.json$/i.test(name))
      .sort()
      .reverse();
  } catch {
    return {};
  }
  for (const name of names) {
    try {
      const audit = JSON.parse(fs.readFileSync(path.join(docsDir, name), "utf8"));
      const items = Array.isArray(audit.items) ? audit.items : [];
      const open = items.filter((item) => item?.status !== "done");
      const closed = items.filter((item) => item?.status === "done")
        .map((item) => item.slug || item.title)
        .filter(Boolean);
      return {
        status: open.length === 0 && items.length > 0 ? "exhausted" : "open",
        source: name,
        items: open.map((item) => ({
          slug: item.slug || null,
          title: item.title || null,
          rank: item.rank ?? null,
          tier: item.tier || null
        })),
        closed,
        exhaustedReason: open.length === 0 && items.length > 0
          ? `All ${closed.length} live-premise-verified audit items are done.`
          : null
      };
    } catch {
      // A corrupt newest audit cannot silently shadow an older valid authority.
    }
  }
  return {};
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
  cache = cache && typeof cache === "object" ? cache : {};
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
