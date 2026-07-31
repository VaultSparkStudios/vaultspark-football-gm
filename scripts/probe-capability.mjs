#!/usr/bin/env node
/**
 * Live, read-only provider credential probes.
 *
 * Capability definitions and values come only from the secrets gateway.
 * Status receipts are redacted and written under ignored .cache; read-only
 * probes never stamp a canonical or project capability map.
 */

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import {
  capabilityDefinition,
  capabilityDefinitions,
  capabilityOperationReceipt,
  capabilityProbeLedgerPath
} from "./lib/capability-operations.mjs";
import { callAnthropicRaw } from "./lib/model-router.mjs";
import { getSecret, redact } from "./lib/secrets.mjs";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const all = args.includes("--all");
const filterIndex = args.indexOf("--for");
const filter = filterIndex >= 0 ? args[filterIndex + 1] : null;
const timeoutMs = 8_000;

if (!all && !filter) {
  console.log("usage: probe-capability --all | --for <capability> [--json]");
  process.exit(1);
}

async function httpFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { status: response.status, ok: response.ok };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.name === "AbortError" ? "timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function interpret(result) {
  if (result.error) return { ok: false, status: "unreachable", detail: result.error };
  if (result.status === 401 || result.status === 403) {
    return { ok: false, status: "auth-error", detail: `HTTP ${result.status}` };
  }
  if (result.status >= 500) {
    return { ok: false, status: "unreachable", detail: `HTTP ${result.status}` };
  }
  if (result.status >= 200 && result.status < 300) {
    return { ok: true, status: "ok", detail: `HTTP ${result.status}` };
  }
  return { ok: false, status: "auth-error", detail: `HTTP ${result.status}` };
}

function bearer(key) {
  return { Authorization: `Bearer ${key}` };
}

async function probeAnthropicCredential() {
  try {
    const result = await callAnthropicRaw({
      apiKey: getSecret("ANTHROPIC_API_KEY", "claude.api"),
      method: "GET",
      path: "/v1/models?limit=1",
      timeoutMs
    }, https);
    return interpret({ status: result.status, ok: result.status >= 200 && result.status < 300 });
  } catch (error) {
    return interpret({
      status: 0,
      ok: false,
      error: error.name === "AbortError" ? "timeout" : error.message
    });
  }
}

const probes = {
  "claude.api": probeAnthropicCredential,
  "stripe.checkout": async () => interpret(await httpFetch("https://api.stripe.com/v1/balance", {
    headers: bearer(getSecret("STRIPE_SECRET_KEY", "stripe.checkout"))
  })),
  "cloudflare.deploy": async () => interpret(await httpFetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: bearer(getSecret("CLOUDFLARE_API_TOKEN", "cloudflare.deploy"))
  })),
  "cloudflare.dns": async () => interpret(await httpFetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: bearer(getSecret("CLOUDFLARE_DNS_TOKEN", "cloudflare.dns"))
  })),
  "cloudflare.r2": async () => {
    const token = getSecret("CLOUDFLARE_API_TOKEN", "cloudflare.deploy")
      || getSecret("CLOUDFLARE_DNS_TOKEN", "cloudflare.dns");
    const accountId = getSecret("R2_ACCOUNT_ID", "cloudflare.r2");
    if (!token || !accountId) return { ok: false, status: "auth-error", detail: "required R2 authority missing" };
    return interpret(await httpFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
      headers: bearer(token)
    }));
  },
  "resend.email": async () => interpret(await httpFetch("https://api.resend.com/domains", {
    headers: bearer(getSecret("RESEND_API_KEY", "resend.email"))
  })),
  "github.org": async () => interpret(await httpFetch("https://api.github.com/user", {
    headers: {
      ...bearer(getSecret("GITHUB_TOKEN", "github.org") || getSecret("GH_TOKEN", "github.org")),
      "User-Agent": "vaultspark-probe"
    }
  })),
  "openai.api": async () => interpret(await httpFetch("https://api.openai.com/v1/models", {
    headers: bearer(getSecret("OPENAI_API_KEY", "openai.api"))
  })),
  "supabase.admin": async () => {
    const url = getSecret("SUPABASE_URL", "supabase.admin");
    const key = getSecret("SUPABASE_SERVICE_KEY", "supabase.admin")
      || getSecret("SUPABASE_ANON_KEY", "supabase.admin");
    if (!url || !key) return { ok: false, status: "auth-error", detail: "required Supabase authority missing" };
    return interpret(await httpFetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    }));
  },
  "brevo": async () => interpret(await httpFetch("https://api.brevo.com/v3/account", {
    headers: { "api-key": getSecret("BREVO_API_KEY", "brevo") }
  }))
};

const authority = capabilityOperationReceipt();
if (authority.capabilityCount === 0) {
  if (jsonMode) console.log("[]");
  console.error("⚠ capability map absent or corrupt — probe skipped (SKIPPED=no-capability-map)");
  process.exit(0);
}

const names = filter ? [filter] : capabilityDefinitions().map((row) => row.capability);
const results = [];
for (const name of names) {
  const definition = capabilityDefinition(name);
  const checkedAt = new Date().toISOString();
  if (!definition.known) {
    results.push({
      cap: name,
      status: "skipped",
      detail: "unknown capability",
      definitionSource: authority.definitionSource,
      checkedAt
    });
    continue;
  }
  if (!definition.ok) {
    results.push({
      cap: name,
      status: "skipped",
      detail: `missing env: ${definition.missing.join(", ")}`,
      definitionSource: authority.definitionSource,
      checkedAt
    });
    continue;
  }
  const probe = probes[name];
  if (!probe) {
    results.push({
      cap: name,
      status: "skipped",
      detail: "no read-only probe implemented",
      definitionSource: authority.definitionSource,
      checkedAt
    });
    continue;
  }
  let outcome;
  try {
    outcome = await probe();
  } catch (error) {
    outcome = { ok: false, status: "unreachable", detail: error.message };
  }
  results.push({
    cap: name,
    status: outcome.status,
    ok: outcome.ok,
    detail: redact(outcome.detail || ""),
    definitionSource: authority.definitionSource,
    checkedAt
  });
}

try {
  const ledger = capabilityProbeLedgerPath();
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  for (const result of results) fs.appendFileSync(ledger, `${JSON.stringify(result)}\n`);
} catch {
  // A receipt failure never changes the provider verdict.
}

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = 0;
} else {
  console.log(`probe-capability · ${results.length} probed · definitions ${authority.definitionSource}`);
  for (const result of results) {
    console.log(`  ${result.status.padEnd(12)} ${result.cap.padEnd(28)} ${result.detail}`);
  }
}
