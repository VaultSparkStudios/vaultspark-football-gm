#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function diffArtifactEntries(expected = [], observed = []) {
  const left = new Map(expected.map((entry) => [entry.path, entry]));
  const right = new Map(observed.map((entry) => [entry.path, entry]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .flatMap((filePath) => {
      const a = left.get(filePath);
      const b = right.get(filePath);
      if (!a) return [{ path: filePath, change: "added", expected: null, observed: b }];
      if (!b) return [{ path: filePath, change: "removed", expected: a, observed: null }];
      if (a.sha256 !== b.sha256 || a.bytes !== b.bytes) {
        return [{ path: filePath, change: "changed", expected: a, observed: b }];
      }
      return [];
    });
}

export function evaluatePromotionBind({ expectedRevision, expectedDigest, observedManifest }) {
  const observedRevision = observedManifest?.sourceRevision || null;
  const observedDigest = observedManifest?.artifactFingerprint?.digest || null;
  const checks = {
    revision: expectedRevision === observedRevision,
    digest: expectedDigest === observedDigest
  };
  return {
    ok: checks.revision && checks.digest,
    checks,
    expectedRevision,
    observedRevision,
    expectedDigest,
    observedDigest
  };
}

async function fetchManifest(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(new URL("/deploy-manifest.json", baseUrl), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`staging manifest HTTP ${response.status}`);
  return response.json();
}

export async function verifyPromotionBind({
  manifestPath,
  expectedRevision,
  expectedDigest,
  stagingUrl = null,
  fetchImpl = fetch
}) {
  const observedManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const result = evaluatePromotionBind({ expectedRevision, expectedDigest, observedManifest });
  if (!result.ok && stagingUrl) {
    try {
      const stagedManifest = await fetchManifest(stagingUrl, fetchImpl);
      const expectedEntries = stagedManifest?.artifactFingerprint?.entries;
      const observedEntries = observedManifest?.artifactFingerprint?.entries;
      result.differences = Array.isArray(expectedEntries) && Array.isArray(observedEntries)
        ? diffArtifactEntries(expectedEntries, observedEntries).slice(0, 10)
        : null;
      result.differenceAuthority = result.differences ? `${stagingUrl}/deploy-manifest.json` : null;
    } catch (error) {
      result.diagnosticError = error.message;
    }
  }
  return result;
}

function printResult(result) {
  console.log(`promotion bind: ${result.ok ? "VERIFIED" : "BLOCKED"}`);
  console.log(`revision expected=${result.expectedRevision || "missing"} observed=${result.observedRevision || "missing"}`);
  console.log(`digest   expected=${result.expectedDigest || "missing"} observed=${result.observedDigest || "missing"}`);
  if (result.ok) return;
  if (Array.isArray(result.differences)) {
    if (!result.differences.length) console.log("per-file ledger: no byte delta; inspect build metadata/history inputs");
    for (const delta of result.differences) {
      console.log(`${delta.change.padEnd(7)} ${delta.path} expected=${delta.expected?.sha256 || "-"} observed=${delta.observed?.sha256 || "-"}`);
    }
  } else {
    console.log("per-file diff unavailable (legacy manifest or staging manifest could not be read)");
  }
  if (result.diagnosticError) console.log(`diagnostic: ${result.diagnosticError}`);
}

export async function main(args = process.argv.slice(2)) {
  const manifestPath = path.resolve(valueAfter(args, "--manifest") || "static/deploy-manifest.json");
  const expectedRevision = process.env.CANDIDATE_REVISION || valueAfter(args, "--revision");
  const expectedDigest = process.env.STAGING_ARTIFACT_DIGEST || valueAfter(args, "--digest");
  const stagingUrl = valueAfter(args, "--staging-url");
  if (!/^[a-f0-9]{40}$/i.test(expectedRevision || "")) throw new Error("expected revision must be a 40-character hexadecimal SHA");
  if (!/^[a-f0-9]{64}$/i.test(expectedDigest || "")) throw new Error("expected digest must be a 64-character SHA-256 digest");
  const result = await verifyPromotionBind({ manifestPath, expectedRevision, expectedDigest, stagingUrl });
  printResult(result);
  if (!result.ok) process.exitCode = 2;
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`promotion bind: ERROR — ${error.message}`);
    process.exitCode = 1;
  });
}
