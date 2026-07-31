#!/usr/bin/env node
/**
 * Explicit credential intake through the canonical secrets authority.
 *
 * This command is intentionally write-capable and must only run when a founder
 * invokes intake. It never prints values and replaces the source paste with a
 * hash-only receipt after a successful write.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  capabilityDefinition,
  capabilityDefinitions,
  credentialWriteAuthority
} from "./lib/capability-operations.mjs";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dryRun = args.includes("--dry-run");
const list = args.includes("--list");
const sourceIndex = args.indexOf("--source");
const sourceOverride = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
const capability = args.find((arg) => !arg.startsWith("--") && arg !== sourceOverride);
const authority = credentialWriteAuthority();
const aliases = {
  "stripe.checkout": {
    "sk_live": "STRIPE_SECRET_KEY",
    "sk_test": "STRIPE_SECRET_KEY",
    "pk_live": "STRIPE_PUBLISHABLE_KEY",
    "pk_test": "STRIPE_PUBLISHABLE_KEY",
    "whsec_": "STRIPE_WEBHOOK_SECRET",
    "Secret key": "STRIPE_SECRET_KEY",
    "Publishable key": "STRIPE_PUBLISHABLE_KEY",
    "Signing secret": "STRIPE_WEBHOOK_SECRET"
  },
  "resend.email": { "re_": "RESEND_API_KEY", "API key": "RESEND_API_KEY" },
  "claude.api": { "sk-ant-": "ANTHROPIC_API_KEY" }
};

function exitWith(payload, code = 0) {
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.message || payload);
  process.exit(code);
}

if (list) {
  const rows = capabilityDefinitions()
    .filter((row) => !row.ok)
    .map((row) => ({ cap: row.capability, ok: false, missing: row.missing }));
  if (jsonMode) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(`Capabilities not yet READY (${rows.length}):`);
    for (const row of rows) console.log(`  · ${row.cap.padEnd(28)} missing: ${row.missing.join(", ")}`);
  }
  process.exit(0);
}

if (!capability) {
  exitWith({ ok: false, message: "usage: paste-credential <capability> [--source <path>] [--dry-run] [--json] | --list" }, 1);
}

const definition = capabilityDefinition(capability);
if (!definition.known) {
  exitWith({ ok: false, message: `unknown capability "${capability}" — update the canonical capability map first` }, 1);
}
const required = definition.required;
if (!required.length) {
  exitWith({ ok: false, message: `capability "${capability}" has no required environment keys` }, 1);
}

const directory = authority.directory;
const candidates = sourceOverride ? [path.resolve(sourceOverride)] : [
  path.join(directory, `${capability}-paste.txt`),
  path.join(directory, `${capability}.txt`),
  path.join(directory, `${capability.replace(/\./g, "-")}-paste.txt`),
  path.join(directory, `${capability.replace(/\./g, "-")}.txt`)
];
const source = candidates.find((candidate) => fs.existsSync(candidate));
if (!source) {
  exitWith({
    ok: false,
    capability,
    writeAuthority: authority.source,
    message: `no paste source found for ${capability}; place a paste file in the ${authority.source} secrets authority`
  }, 1);
}

const raw = fs.readFileSync(source, "utf8").trim();
if (!raw) exitWith({ ok: false, message: "paste source is empty" }, 1);
const extracted = extractKeys(raw, required, capability);
const missing = required.filter((key) => !extracted[key]);
if (missing.length) {
  exitWith({
    ok: false,
    capability,
    extracted: Object.keys(extracted),
    missing,
    message: `Could not extract all required keys. Missing: ${missing.join(", ")}`
  }, 1);
}

const family = capability.split(".")[0];
const envTarget = path.join(directory, `${family}.env`);
const existing = fs.existsSync(envTarget) ? parseEnv(fs.readFileSync(envTarget, "utf8")) : {};
const merged = { ...existing, ...extracted };
const body = `${Object.entries(merged).map(([key, value]) => `${key}=${quoteIfNeeded(value)}`).join("\n")}\n`;
const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);

if (dryRun) {
  exitWith({
    ok: true,
    dryRun: true,
    capability,
    writeAuthority: authority.source,
    keysWritten: Object.keys(extracted),
    sourceHash: hash,
    message: `DRY RUN: parsed ${Object.keys(extracted).length} key(s) for ${capability} in the ${authority.source} authority`
  });
}

let backup = null;
if (fs.existsSync(envTarget)) {
  backup = `${envTarget}.${new Date().toISOString().slice(0, 10)}.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(envTarget, backup);
}
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(envTarget, body);
try {
  fs.chmodSync(envTarget, 0o600);
} catch {
  // Windows ACLs are managed by the containing secrets directory.
}
fs.writeFileSync(source, [
  `# paste-credential receipt · ${new Date().toISOString()}`,
  `# capability: ${capability}`,
  `# keys written: ${Object.keys(extracted).join(", ")}`,
  `# source hash (sha256/16): ${hash}`,
  "# raw paste redacted; replace with a fresh paste to re-intake.",
  ""
].join("\n"));

exitWith({
  ok: true,
  capability,
  writeAuthority: authority.source,
  backupCreated: Boolean(backup),
  keysWritten: Object.keys(extracted),
  sourceHash: hash,
  message: `✓ Intake complete for ${capability}; wrote ${Object.keys(extracted).length} key(s) to the ${authority.source} secrets authority`
});

function parseEnv(text) {
  const output = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[key] = value;
  }
  return output;
}

function quoteIfNeeded(value) {
  return /[\s"'#]/.test(value) ? `"${value.replace(/"/g, "\\\"")}"` : value;
}

function extractKeys(raw, requiredKeys, name) {
  const output = {};
  try {
    const parsed = JSON.parse(raw);
    for (const key of requiredKeys) {
      const exact = parsed[key];
      const insensitive = Object.entries(parsed).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
      if (exact ?? insensitive) output[key] = String(exact ?? insensitive);
    }
  } catch {
    // Not a JSON paste.
  }
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Z][A-Z0-9_]+)\s*[:=]\s*(.+)$/);
    if (!match || !requiredKeys.includes(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[match[1]] = value;
  }
  const providerAliases = aliases[name] || {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    for (const [labelOrPrefix, target] of Object.entries(providerAliases)) {
      if (output[target]) continue;
      if (line.toLowerCase().startsWith(labelOrPrefix.toLowerCase()) && /[:=]/.test(line)) {
        const value = line.split(/[:=]/).slice(1).join(":").trim();
        if (value) output[target] = value;
      }
    }
  }
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    for (const [prefix, target] of Object.entries(providerAliases)) {
      if (!output[target] && token.startsWith(prefix)) output[target] = token;
    }
  }
  if (requiredKeys.length === 1 && !output[requiredKeys[0]]) {
    const single = raw.trim();
    if (!/\s/.test(single) && single.length >= 8) output[requiredKeys[0]] = single;
  }
  return output;
}
