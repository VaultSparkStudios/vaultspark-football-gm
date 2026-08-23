#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditDeliveredDocument } from "./lib/edge-security-policy.mjs";

const HEADER_NAMES = Object.freeze([
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy"
]);

function normalizedHeaders(value = {}) {
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  return Object.fromEntries(
    Object.entries(value).map(([name, content]) => [String(name).toLowerCase(), String(content || "")])
  );
}

function revisionOf(document) {
  return String(document?.sourceRevision || "").trim() || null;
}

export function buildEdgePolicyAttestation({
  origin,
  receipt,
  headers,
  health = null,
  deployManifest = null,
  deliveredHtml = null,
  checkedAt = new Date().toISOString()
}) {
  const observed = normalizedHeaders(headers);
  const headerChecks = HEADER_NAMES.map((name) => ({
    name,
    ok: Boolean(observed[name]),
    valueClass: observed[name] ? "present" : "absent"
  }));
  const csp = observed["content-security-policy"] || "";
  const missingInlineScriptHashes = (receipt.inlineScriptHashes || [])
    .filter((hash) => !csp.includes(hash.replace(/^'|'$/g, "")) && !csp.includes(hash));
  const sourceRevision = revisionOf(receipt);
  const deployedRevision = revisionOf(deployManifest) || revisionOf(health);
  const revisionMatches = Boolean(
    sourceRevision &&
    sourceRevision !== "local-worktree" &&
    deployedRevision &&
    sourceRevision === deployedRevision
  );
  const healthValid = health?.status === "ok" && health?.launchReady === false;
  // S94: the artifact being clean and the headers being present is not the same
  // claim as the served policy admitting what the served document asks for. Only
  // this check can see an origin the edge injected after the build ran.
  const deliveredDocument = typeof deliveredHtml === "string"
    ? auditDeliveredDocument(deliveredHtml, csp)
    : { ok: true, violations: [], note: "No delivered document supplied; document/policy agreement is UNPROVED." };
  const deliveredDocumentProved = typeof deliveredHtml === "string";
  const applied = headerChecks.every((check) => check.ok)
    && missingInlineScriptHashes.length === 0
    && revisionMatches
    && healthValid
    && deliveredDocumentProved
    && deliveredDocument.ok;
  const missingHeaders = headerChecks.filter((check) => !check.ok).map((check) => check.name);
  const report = {
    schemaVersion: "1.0",
    status: applied ? "APPLIED" : "HOLD",
    origin,
    checkedAt,
    policyFingerprint: receipt.policyFingerprint,
    sourceRevision,
    deployedRevision,
    revisionMatches,
    healthValid,
    headerChecks,
    missingHeaders,
    inlineScriptHashCount: (receipt.inlineScriptHashes || []).length,
    missingInlineScriptHashes,
    deliveredDocumentProved,
    deliveredDocumentOk: deliveredDocument.ok,
    deliveredDocumentViolations: deliveredDocument.violations,
    deliveredDocumentNote: deliveredDocument.note,
    observabilityNote: applied
      ? "The live origin independently proves this exact revision's required edge contract."
      : "The source artifact may be green, but live application is not proved and remains HOLD."
  };
  return {
    ...report,
    owningHostApplicationPayload: {
      kind: "edge-policy-application",
      project: "franchise-architect-football",
      origin,
      policyFingerprint: receipt.policyFingerprint,
      sourceRevision,
      status: report.status,
      missingHeaders,
      missingInlineScriptHashes,
      deliveredDocumentViolations: deliveredDocument.violations,
      requestedVerification: [
        "apply the artifact _headers policy at the owning edge",
        "serve /_health and /deploy-manifest.json from the same revision",
        "return a live response-header receipt without substituting source intent",
        "confirm the served policy admits every external origin the served document requests"
      ]
    }
  };
}

// S94: an edge may inject markup only for browser-shaped requests. Cloudflare's
// Web Analytics beacon is injected on `Accept: text/html` with a browser
// User-Agent and omitted otherwise -- measured on this origin, both routes. A
// verifier that fetches with `Accept: application/json` therefore audits a
// document no visitor ever receives, which is exactly how a CSP that refused the
// beacon on every real page load stayed green here. Ask for what a browser asks
// for, or do not claim to have checked the delivered document.
const BROWSER_DOCUMENT_HEADERS = Object.freeze({
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
});

async function fetchDocument(origin, route, { asBrowser = false } = {}) {
  const response = await fetch(new URL(route, origin), {
    redirect: "follow",
    headers: asBrowser ? { ...BROWSER_DOCUMENT_HEADERS } : { Accept: "application/json,text/plain,*/*" }
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
}

async function main(argv = process.argv.slice(2)) {
  const originIndex = argv.indexOf("--origin");
  const artifactIndex = argv.indexOf("--artifact");
  const origin = originIndex >= 0 ? argv[originIndex + 1] : "https://playfranchisearchitect.com/";
  const artifact = path.resolve(
    artifactIndex >= 0 ? argv[artifactIndex + 1] : "static/edge-policy-receipt.json"
  );
  const receipt = JSON.parse(await fs.readFile(artifact, "utf8"));
  const [root, health, manifest] = await Promise.all([
    fetchDocument(origin, "/", { asBrowser: true }),
    fetchDocument(origin, "/_health"),
    fetchDocument(origin, "/deploy-manifest.json")
  ]);
  const report = buildEdgePolicyAttestation({
    origin,
    receipt,
    headers: root.response.headers,
    health: health.body,
    deployManifest: manifest.body,
    deliveredHtml: root.text
  });
  if (argv.includes("--ark-payload")) {
    console.log(JSON.stringify(report.owningHostApplicationPayload, null, 2));
  } else if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`edge-policy-application · ${report.status}`);
    console.log(`  origin: ${origin}`);
    console.log(`  revision: ${report.deployedRevision || "unproved"} (${report.revisionMatches ? "matches" : "not bound"})`);
    console.log(`  missing headers: ${report.missingHeaders.join(", ") || "none"}`);
    console.log(`  missing inline hashes: ${report.missingInlineScriptHashes.length}`);
    console.log(`  delivered document: ${report.deliveredDocumentOk ? "admitted" : "REFUSED"} (${report.deliveredDocumentViolations.length} violation(s))`);
    for (const violation of report.deliveredDocumentViolations) {
      console.log(`    ✗ ${violation.directive} refuses ${violation.origin} — requested by ${violation.reference}`);
    }
  }
  process.exitCode = report.status === "APPLIED" ? 0 : 1;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
