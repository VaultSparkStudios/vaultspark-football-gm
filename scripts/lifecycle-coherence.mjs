#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function newestLaunchEvidence(root) {
  const dir = path.join(root, "audits");
  try {
    return fs.readdirSync(dir)
      .filter((name) => /^launch-evidence-.*\.json$/i.test(name))
      .map((name) => ({ name, file: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0] || null;
  } catch {
    return null;
  }
}

function findRegistryEntry(registry, slug) {
  if (Array.isArray(registry)) return registry.find((entry) => entry?.slug === slug) || null;
  const pools = [registry?.projects, registry?.entries, registry?.registry];
  for (const pool of pools) {
    if (Array.isArray(pool)) {
      const entry = pool.find((candidate) => candidate?.slug === slug);
      if (entry) return entry;
    }
  }
  return registry?.[slug] || null;
}

export function inspectLifecycleCoherence(root = process.cwd(), { registryPath = null } = {}) {
  const contract = readJson(path.join(root, "context", "LIFECYCLE_COHERENCE.json"), {});
  const manifest = readJson(path.join(root, "context", "STUDIO_MANIFEST.json"), {});
  const status = readJson(path.join(root, "context", "PROJECT_STATUS.json"), {});
  const publicStatus = fs.existsSync(path.join(root, "public", "status.html"))
    ? fs.readFileSync(path.join(root, "public", "status.html"), "utf8")
    : "";
  const evidenceFile = newestLaunchEvidence(root);
  const evidence = evidenceFile ? readJson(evidenceFile.file, {}) : {};
  const slug = contract.slug || status.slug || manifest.identity?.slug;
  const expected = String(contract.expectedVaultStatus || "FORGE").toUpperCase();
  const local = String(status.vaultStatus || manifest.identity?.vaultStatus || "").toUpperCase();
  const audience = status.audience || manifest.identity?.audience || contract.audience;

  const checks = [
    {
      id: "local-vault-status",
      ok: local === expected,
      blocking: true,
      detail: `local ${local || "missing"} · contract ${expected}`
    },
    {
      id: "audience",
      ok: audience === contract.audience,
      blocking: true,
      detail: `local ${audience || "missing"} · contract ${contract.audience || "missing"}`
    },
    {
      id: "launch-blocker",
      ok: expected !== "FORGE" || (Array.isArray(status.blockers) && status.blockers.length > 0),
      blocking: true,
      detail: expected === "FORGE" ? `${status.blockers?.length || 0} blocker(s) recorded` : "not required"
    },
    {
      id: "public-status",
      ok: expected !== "FORGE" || /before marking the project SPARKED/i.test(publicStatus),
      blocking: true,
      detail: "public status preserves the evidence gate"
    },
    {
      id: "launch-evidence",
      ok: expected !== "FORGE" || evidence.summary?.status !== "ready",
      blocking: true,
      detail: evidenceFile ? `${evidenceFile.name}: ${evidence.summary?.status || "unknown"}` : "no evidence file"
    }
  ];

  const resolvedRegistry = registryPath || path.resolve(root, contract.authoritativeRegistry || "");
  const registry = resolvedRegistry && fs.existsSync(resolvedRegistry) ? readJson(resolvedRegistry, {}) : null;
  const registryEntry = registry ? findRegistryEntry(registry, slug) : null;
  const authoritative = String(registryEntry?.vaultStatus || registryEntry?.status || "").toUpperCase();
  if (registryEntry) {
    checks.push({
      id: "authoritative-registry",
      ok: authoritative === expected,
      blocking: false,
      detail: `registry ${authoritative || "missing"} · local contract ${expected}`
    });
  }

  const blockingFailing = checks.filter((check) => check.blocking && !check.ok).length;
  const warning = checks.filter((check) => !check.blocking && !check.ok).length;
  return {
    schemaVersion: "1.0",
    slug,
    expectedVaultStatus: expected,
    localVaultStatus: local,
    authoritativeVaultStatus: authoritative || null,
    audience,
    blockingFailing,
    warning,
    coherent: blockingFailing === 0,
    authoritativeDrift: Boolean(authoritative && authoritative !== expected),
    checks
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const registryIndex = process.argv.indexOf("--registry");
  const result = inspectLifecycleCoherence(process.cwd(), {
    registryPath: registryIndex >= 0 ? path.resolve(process.argv[registryIndex + 1]) : null
  });
  if (args.has("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Lifecycle coherence: ${result.coherent ? "PASS" : "BLOCK"} · blocking ${result.blockingFailing} · warning ${result.warning}`);
    for (const check of result.checks) console.log(`${check.ok ? "✓" : check.blocking ? "✗" : "⚠"} ${check.id}: ${check.detail}`);
  }
  if (result.blockingFailing || (args.has("--strict-authoritative") && result.authoritativeDrift)) process.exitCode = 2;
}
