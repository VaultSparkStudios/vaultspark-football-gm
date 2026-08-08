import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const INLINE_EVENT_HANDLER = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL = /(?:href|src)\s*=\s*["']\s*javascript:/i;

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
  const scriptSources = ["'self'", ...hashes].join(" ");
  const styleSources = ["'self'", ...styles].join(" ");
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
    "connect-src 'self' https://api.github.com https://gist.githubusercontent.com https://api-franchise-architect-football.vaultsparkstudios.com",
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
    mountsInheritFromArtifact: true,
    observationNote: "This receipt proves the deployable artifact policy only. Hosted application requires live response-header evidence."
  };
  await fs.writeFile(path.join(outDir, "_headers"), headers, "utf8");
  await fs.writeFile(
    path.join(outDir, "edge-policy-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8"
  );
  return receipt;
}
