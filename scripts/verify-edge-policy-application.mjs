#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  const applied = headerChecks.every((check) => check.ok)
    && missingInlineScriptHashes.length === 0
    && revisionMatches
    && healthValid;
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
      requestedVerification: [
        "apply the artifact _headers policy at the owning edge",
        "serve /_health and /deploy-manifest.json from the same revision",
        "return a live response-header receipt without substituting source intent"
      ]
    }
  };
}

async function fetchDocument(origin, route) {
  const response = await fetch(new URL(route, origin), {
    redirect: "follow",
    headers: { Accept: "application/json,text/plain,*/*" }
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body };
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
    fetchDocument(origin, "/"),
    fetchDocument(origin, "/_health"),
    fetchDocument(origin, "/deploy-manifest.json")
  ]);
  const report = buildEdgePolicyAttestation({
    origin,
    receipt,
    headers: root.response.headers,
    health: health.body,
    deployManifest: manifest.body
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
