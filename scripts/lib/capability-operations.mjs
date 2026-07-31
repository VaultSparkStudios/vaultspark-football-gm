/**
 * Capability operations authority.
 *
 * Read-only operations consume definitions and readiness exclusively through
 * the secrets gateway. Only explicit credential intake resolves a write
 * directory, keeping project repos from inventing a second capability map.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  capabilityMapSource,
  listCapabilities,
  resolveCapability
} from "./secrets.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..", "..");

function findCanonicalSecretsDirectory() {
  if (process.env.STUDIO_OPS_SECRETS_DIR) {
    return path.resolve(process.env.STUDIO_OPS_SECRETS_DIR);
  }
  let cursor = repoRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(cursor, "vaultspark-studio-ops", "secrets");
    if (fs.existsSync(path.join(candidate, "CAPABILITY_MAP.json"))) return candidate;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function capabilityDefinitions() {
  return listCapabilities().map((row) => ({
    capability: row.capability,
    required: [...row.required],
    missing: [...row.missing],
    found: [...row.found],
    ok: row.ok
  }));
}

export function capabilityOperationReceipt() {
  const rows = capabilityDefinitions();
  return {
    schemaVersion: "1.0",
    definitionSource: capabilityMapSource(),
    capabilityCount: rows.length,
    readyCount: rows.filter((row) => row.ok).length
  };
}

export function capabilityDefinition(name) {
  const resolved = resolveCapability(name);
  const known = capabilityDefinitions().some((row) => row.capability === name);
  return { capability: name, known, ...resolved };
}

export function credentialWriteAuthority() {
  const override = process.env.VAULTSPARK_SECRETS_DIR_OVERRIDE;
  if (override) {
    const directory = path.resolve(override);
    return {
      source: "local-override",
      directory,
      capabilityMapPath: path.join(directory, "CAPABILITY_MAP.json")
    };
  }
  if (capabilityMapSource() === "canonical") {
    const directory = findCanonicalSecretsDirectory();
    if (directory) {
      return {
        source: "canonical",
        directory,
        capabilityMapPath: path.join(directory, "CAPABILITY_MAP.json")
      };
    }
  }
  const directory = path.join(repoRoot, "secrets");
  return {
    source: "local",
    directory,
    capabilityMapPath: path.join(directory, "CAPABILITY_MAP.json")
  };
}

export function capabilityProbeLedgerPath() {
  return process.env.VAULTSPARK_CAPABILITY_PROBE_LEDGER
    ? path.resolve(process.env.VAULTSPARK_CAPABILITY_PROBE_LEDGER)
    : path.join(repoRoot, ".cache", "capability-probes.ndjson");
}
