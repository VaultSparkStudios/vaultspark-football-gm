#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateProjectStatus } from "./lib/write-project-status.mjs";
import { STAGING_URL } from "./deploy-staging.mjs";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function receiptHash(receipt) {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

export function validateStagingAuthorityReceipt(receipt, expectedRevision = null) {
  const errors = [];
  if (receipt?.schemaVersion !== "1.1") errors.push("schema-version-mismatch");
  if (receipt?.kind !== "independent-staging-authority") errors.push("kind-mismatch");
  if (receipt?.stableUrl !== STAGING_URL) errors.push("stable-url-mismatch");
  if (receipt?.independent !== true) errors.push("independence-unverified");
  if (receipt?.verified !== true) errors.push("receipt-unverified");
  if (receipt?.domainStatus !== "active") errors.push("domain-inactive");
  if (receipt?.exactRevision !== true) errors.push("revision-unverified");
  if (receipt?.exactArtifact !== true) errors.push("artifact-unverified");
  if (receipt?.provenance?.status !== "verified") errors.push("provenance-unverified");
  if (expectedRevision && receipt?.sourceRevision !== expectedRevision) errors.push("source-revision-mismatch");
  if (!/^[a-f0-9]{64}$/i.test(receipt?.artifactFingerprint?.digest || "")) errors.push("artifact-fingerprint-invalid");
  return { valid: errors.length === 0, errors, receiptSha256: receiptHash(receipt) };
}

export function reconcileStagingAuthority({ root, receipt, expectedRevision = null, checkOnly = false }) {
  const validation = validateStagingAuthorityReceipt(receipt, expectedRevision);
  if (!validation.valid) throw new Error(`Staging receipt rejected: ${validation.errors.join(", ")}`);
  const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
  const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  const authority = {
    schemaVersion: "1.0",
    receiptSha256: validation.receiptSha256,
    sourceRevision: receipt.sourceRevision,
    artifactFingerprint: receipt.artifactFingerprint,
    deploymentId: receipt.deploymentId,
    stableUrl: receipt.stableUrl,
    domainStatus: receipt.domainStatus,
    provenance: receipt.provenance,
    rollback: receipt.rollback,
    verified: true,
    observedAt: receipt.observedAt
  };
  if (checkOnly) {
    const mismatches = [];
    if (status.stagingType !== "cloudflare-pages") mismatches.push("staging-type-drift");
    if (status.stagingUrl !== STAGING_URL) mismatches.push("staging-url-drift");
    if (status.stagingAuthority?.receiptSha256 !== authority.receiptSha256) mismatches.push("receipt-hash-drift");
    if (mismatches.length) throw new Error(`Checked-in staging authority drifted: ${mismatches.join(", ")}`);
    return authority;
  }
  updateProjectStatus(root, (current) => ({
    ...current,
    stagingType: "cloudflare-pages",
    stagingUrl: STAGING_URL,
    stagingAuthority: authority,
    testingSurfaces: [
      ...(current.testingSurfaces || []).filter((surface) => surface.type !== "staging"),
      { type: "staging", label: "Cloudflare Pages", url: STAGING_URL, lastChecked: String(receipt.observedAt).slice(0, 10) }
    ]
  }));
  return authority;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const input = valueAfter(args, "--input");
    if (!input) throw new Error("Usage: node scripts/reconcile-staging-authority.mjs --input <receipt.json> [--expected-revision <sha>] [--check]");
    const receipt = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), input), "utf8"));
    const authority = reconcileStagingAuthority({
      root: process.cwd(),
      receipt,
      expectedRevision: valueAfter(args, "--expected-revision"),
      checkOnly: args.includes("--check")
    });
    console.log(JSON.stringify(authority, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}