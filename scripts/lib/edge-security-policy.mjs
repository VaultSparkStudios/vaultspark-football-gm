import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const INLINE_EVENT_HANDLER = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL = /(?:href|src)\s*=\s*["']\s*javascript:/i;

// S94: origins the EDGE injects into the delivered document after this build has
// run. The build cannot see them -- `inspectHtmlForEdgePolicy` reads the artifact,
// and the artifact is correct -- so a policy authored only from the artifact will
// silently refuse them in every visitor's browser. That is not hypothetical: the
// Cloudflare Web Analytics beacon shipped on every page from the zone while
// `script-src 'self' + hashes` blocked it, so production collected nothing and
// logged a CSP violation on every load. Each entry must be justified, minimal,
// and verified against the artifact it actually fetches -- the two hosts below
// were read out of beacon.min.js itself, not assumed from documentation.
export const EDGE_INJECTED_ORIGINS = Object.freeze([
  Object.freeze({
    origin: "https://static.cloudflareinsights.com",
    directive: "script-src",
    injectedBy: "Cloudflare Web Analytics (zone-level automatic setup)",
    reason: "serves beacon.min.js, which the zone injects into every delivered document"
  }),
  Object.freeze({
    origin: "https://cloudflareinsights.com",
    directive: "connect-src",
    injectedBy: "Cloudflare Web Analytics (zone-level automatic setup)",
    reason: "beacon.min.js POSTs its RUM payload to https://cloudflareinsights.com/cdn-cgi/rum"
  })
]);

function edgeOriginsFor(directive) {
  return EDGE_INJECTED_ORIGINS.filter((entry) => entry.directive === directive).map((entry) => entry.origin);
}

function originOf(reference) {
  try {
    return new URL(reference).origin;
  } catch {
    return null;
  }
}

/**
 * S94: audit the DELIVERED document against the SERVED policy.
 *
 * `inspectHtmlForEdgePolicy` answers "is the artifact clean?". This answers the
 * different and previously unasked question: "does the policy the origin actually
 * returns admit everything the document the origin actually returns asks for?".
 * Only the second question can see an edge-injected tag.
 */
export function auditDeliveredDocument(html = "", cspHeader = "") {
  const directives = new Map();
  for (const clause of String(cspHeader).split(";")) {
    const [name, ...values] = clause.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), values);
  }
  const admits = (directive, origin) => {
    const sources = directives.get(directive) || directives.get("default-src") || [];
    return sources.some((source) => source === origin || source === `${origin}/`);
  };

  const violations = [];
  const seen = new Set();
  const record = (directive, origin, reference) => {
    const key = `${directive} ${origin}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!admits(directive, origin)) violations.push({ directive, origin, reference });
  };

  const scriptPattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match = scriptPattern.exec(html);
  while (match) {
    const origin = originOf(match[1]);
    if (origin) record("script-src", origin, match[1]);
    match = scriptPattern.exec(html);
  }

  // A script admitted by script-src still needs somewhere to report to. Fold in
  // the connect-src origin every allowlisted injector is known to require, so an
  // admitted-but-mute beacon cannot pass as healthy.
  for (const entry of EDGE_INJECTED_ORIGINS) {
    if (entry.directive !== "connect-src") continue;
    const scriptOrigin = EDGE_INJECTED_ORIGINS.find(
      (candidate) => candidate.injectedBy === entry.injectedBy && candidate.directive === "script-src"
    );
    if (!scriptOrigin || !html.includes(scriptOrigin.origin)) continue;
    record("connect-src", entry.origin, `${entry.injectedBy} reporting endpoint`);
  }

  return {
    ok: violations.length === 0,
    violations,
    note: violations.length
      ? "The served policy refuses something the served document requests; it will fail in every visitor's browser."
      : "Every external origin the delivered document requests is admitted by the served policy."
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("base64");
}

export function inspectHtmlForEdgePolicy(html, file = "document.html") {
  if (INLINE_EVENT_HANDLER.test(html)) {
    throw new Error(`${file} contains an inline event handler; bind it from a trusted module instead.`);
  }
  if (JAVASCRIPT_URL.test(html)) {
    throw new Error(`${file} contains a javascript: URL; source-authored edge policy refuses it.`);
  }
  const hashes = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    const attributes = match[1] || "";
    const body = match[2] || "";
    const source = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || null;
    if (source && /^(?:https?:|data:|blob:|\/\/)/i.test(source)) {
      throw new Error(`${file} loads a non-self script source: ${source}`);
    }
    if (!source && body.length) hashes.push(`'sha256-${sha256(body)}'`);
    match = pattern.exec(html);
  }
  return hashes;
}

export function inspectInlineStyleHashes(html) {
  const hashes = [];
  const pattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match = pattern.exec(html);
  while (match) {
    if (match[1].length) hashes.push(`'sha256-${sha256(match[1])}'`);
    match = pattern.exec(html);
  }
  return hashes;
}

export function buildEdgeHeaders({ inlineScriptHashes = [], inlineStyleHashes = [] } = {}) {
  const hashes = [...new Set(inlineScriptHashes)].sort();
  const styles = [...new Set(inlineStyleHashes)].sort();
  const scriptSources = ["'self'", ...hashes, ...edgeOriginsFor("script-src")].join(" ");
  const styleSources = ["'self'", ...styles].join(" ");
  const connectSources = [
    "'self'",
    "https://api.github.com",
    "https://gist.githubusercontent.com",
    "https://api-franchise-architect-football.vaultsparkstudios.com",
    ...edgeOriginsFor("connect-src")
  ].join(" ");
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' mailto:",
    `script-src ${scriptSources}`,
    `style-src-elem ${styleSources}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
  return [
    "/*",
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    `  Content-Security-Policy: ${csp}`,
    "  X-Frame-Options: DENY",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "",
    // S94 cache policy. Deliberately surgical: the host default of
    // `max-age=14400, must-revalidate` is correct for the ~110 unhashed modules,
    // whose URLs are stable and whose contents can change. It is wrong for
    // exactly two classes, and both were being served it.
    //
    // sw.js is the update channel for the entire app, and the worker it installs
    // is CACHE-FIRST (scripts/lib/service-worker.mjs). A stale worker therefore
    // does not merely delay an update -- it keeps serving the previous precache
    // from disk for as long as it lives. At max-age=14400 a shipped fix could be
    // invisible to a returning player for four hours while they were served old
    // bytes with no network round trip. The update channel must never be cached.
    "/sw.js",
    "  Cache-Control: no-cache",
    "",
    // These filenames embed a content hash, so the URL changes whenever the bytes
    // change. That is the entire precondition for immutable caching, and it was
    // being paid for and not collected: a hashed URL can never legitimately
    // return different content, so revalidating it is pure waste.
    "/styles.*.css",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/community-stats.*.js",
    "  Cache-Control: public, max-age=31536000, immutable",
    ""
  ].join("\n");
}

export async function emitEdgeSecurityPolicy({
  outDir,
  htmlPages,
  sourceRevision = "local-worktree"
}) {
  const hashes = [];
  const styleHashes = [];
  for (const page of htmlPages) {
    const html = await fs.readFile(path.join(outDir, page), "utf8");
    hashes.push(...inspectHtmlForEdgePolicy(html, page));
    styleHashes.push(...inspectInlineStyleHashes(html));
  }
  const inlineScriptHashes = [...new Set(hashes)].sort();
  const inlineStyleHashes = [...new Set(styleHashes)].sort();
  const headers = buildEdgeHeaders({ inlineScriptHashes, inlineStyleHashes });
  const fingerprint = createHash("sha256").update(headers).digest("hex");
  const receipt = {
    schemaVersion: "1.0",
    status: "source-authored",
    appliedToHostedOrigin: false,
    sourceRevision,
    policyFingerprint: `sha256:${fingerprint}`,
    inlineScriptHashes,
    inlineStyleHashes,
    requiredHeaders: [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy"
    ],
    edgeInjectedOrigins: EDGE_INJECTED_ORIGINS.map((entry) => ({ ...entry })),
    mountsInheritFromArtifact: true,
    observationNote: "This receipt proves the deployable artifact policy only. Hosted application requires live response-header evidence, including that the served policy admits every origin the served document requests."
  };
  await fs.writeFile(path.join(outDir, "_headers"), headers, "utf8");
  await fs.writeFile(
    path.join(outDir, "edge-policy-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8"
  );
  return receipt;
}
