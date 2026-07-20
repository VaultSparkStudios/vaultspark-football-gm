#!/usr/bin/env node
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultBaseUrl = "https://playfranchisearchitect.com";
const defaultRoutes = [
  "/",
  "/game.html",
  "/contact.html",
  "/privacy.html",
  "/terms.html",
  "/agents.json",
  "/.well-known/llms.txt",
  "/sitemap.xml",
  "/_health"
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, baseUrl: defaultBaseUrl, timeoutMs: 7000, routes: defaultRoutes };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--fixture") args.fixture = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--base-url") args.baseUrl = argv[++i] || args.baseUrl;
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg === "--email-evidence") args.emailEvidence = argv[++i] || "";
  }
  return args;
}

function normalizeBaseUrl(value) {
  return String(value || defaultBaseUrl).replace(/\/+$/, "");
}

function routeUrl(baseUrl, route) {
  return `${normalizeBaseUrl(baseUrl)}${route.startsWith("/") ? route : `/${route}`}`;
}

const maxRedirectHops = 5;

function probeOnceHttps(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = https.get(url, { timeout: timeoutMs }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        if (size >= 65536) return;
        const remaining = 65536 - size;
        const bounded = chunk.subarray(0, remaining);
        chunks.push(bounded);
        size += bounded.length;
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          location: response.headers.location ?? null,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ error: `timeout after ${timeoutMs}ms` });
    });
    request.on("error", (error) => {
      resolve({ error: error.message });
    });
  });
}

export async function probeWithRedirects(url, timeoutMs, probeOnce = probeOnceHttps) {
  const chain = [];
  const detailParts = [];
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirectHops; hop += 1) {
    const response = await probeOnce(currentUrl, timeoutMs);
    if (response.error || typeof response.statusCode !== "number") {
      chain.push({ url: currentUrl, statusCode: null });
      const failure = response.error || "no response";
      return {
        ok: false,
        statusCode: null,
        detail: detailParts.length ? `${detailParts.join(" → ")} → ${failure}` : failure,
        chain,
        headers: response.headers || {},
        body: response.body || ""
      };
    }
    chain.push({ url: currentUrl, statusCode: response.statusCode });
    detailParts.push(`HTTP ${response.statusCode}`);
    const isRedirect = response.statusCode >= 300 && response.statusCode < 400;
    if (!isRedirect) {
      return {
        ok: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        detail: detailParts.join(" → "),
        chain,
        headers: response.headers || {},
        body: response.body || ""
      };
    }
    if (hop === maxRedirectHops) {
      return {
        ok: false,
        statusCode: response.statusCode,
        detail: `${detailParts.join(" → ")} → redirect limit exceeded`,
        chain
      };
    }
    if (!response.location) {
      return {
        ok: false,
        statusCode: response.statusCode,
        detail: `${detailParts.join(" → ")} → redirect missing Location header`,
        chain
      };
    }
    let nextUrl;
    try {
      nextUrl = new URL(response.location, currentUrl);
    } catch {
      return {
        ok: false,
        statusCode: response.statusCode,
        detail: `${detailParts.join(" → ")} → invalid redirect target "${response.location}"`,
        chain
      };
    }
    if (nextUrl.protocol !== "https:") {
      return {
        ok: false,
        statusCode: response.statusCode,
        detail: `${detailParts.join(" → ")} → insecure redirect target`,
        chain
      };
    }
    detailParts.push(response.location);
    currentUrl = nextUrl.href;
  }
}

async function readFixture(file) {
  if (!file) return null;
  const body = await fs.readFile(path.resolve(rootDir, file), "utf8");
  return JSON.parse(body);
}

export async function buildLaunchEvidenceReport({
  baseUrl = defaultBaseUrl,
  routes = defaultRoutes,
  timeoutMs = 7000,
  fixture = null,
  emailEvidence = ""
} = {}) {
  const checkedAt = new Date().toISOString();
  const fixtureRoutes = fixture?.routes || {};
  const routeChecks = [];

  for (const route of routes) {
    const url = routeUrl(baseUrl, route);
    const observed = fixtureRoutes[route] || (fixture ? null : await probeWithRedirects(url, timeoutMs));
    const result = observed || { ok: false, statusCode: null, detail: "missing fixture route result" };
    const check = {
      route,
      url,
      ok: result.ok === true,
      statusCode: result.statusCode ?? null,
      detail: result.detail || (result.ok ? "ok" : "failed")
    };
    if (Array.isArray(result.chain)) check.chain = result.chain;
    if ((route === "/" || route === "/_health") && result.headers && typeof result.headers === "object") {
      check.headers = Object.fromEntries(
        ["content-type", "server", "strict-transport-security", "x-frame-options", "content-security-policy", "x-content-type-options", "referrer-policy"]
          .filter((name) => result.headers[name] != null)
          .map((name) => [name, result.headers[name]])
      );
    }
    if (route === "/_health" && typeof result.body === "string") check.body = result.body.slice(0, 2048);
    routeChecks.push(check);
  }

  const trimmedEvidence = String(emailEvidence || fixture?.emailEvidence || "").trim();
  const emailForwarding = trimmedEvidence
    ? {
        status: "verified",
        address: "football@playfranchisearchitect.com",
        detail: trimmedEvidence
      }
    : {
        status: "unverified",
        address: "football@playfranchisearchitect.com",
        detail: "No delivery/forwarding evidence supplied. Do not mark SPARKED from route checks alone."
      };

  const routesOk = routeChecks.every((check) => check.ok);
  const emailOk = emailForwarding.status === "verified";
  const originEvidenceRequired = routes.includes("/_health");
  const rootCheck = routeChecks.find((check) => check.route === "/");
  const healthCheck = routeChecks.find((check) => check.route === "/_health");
  let healthReceipt = null;
  try {
    healthReceipt = healthCheck?.body ? JSON.parse(healthCheck.body) : null;
  } catch {
    healthReceipt = null;
  }
  const securityHeaders = {
    strictTransportSecurity: Boolean(rootCheck?.headers?.["strict-transport-security"]),
    frameProtection: Boolean(rootCheck?.headers?.["x-frame-options"]),
    contentSecurityPolicy: Boolean(rootCheck?.headers?.["content-security-policy"])
  };
  const healthReceiptValid = Boolean(
    healthCheck?.ok &&
    healthReceipt?.status === "ok" &&
    healthReceipt?.launchReady === false &&
    typeof healthReceipt?.sourceRevision === "string" &&
    healthReceipt.sourceRevision.length > 0
  );
  const headersValid = Object.values(securityHeaders).every(Boolean);
  const originOk = !originEvidenceRequired || (healthReceiptValid && headersValid);
  const blockers = [];
  if (!routesOk) blockers.push("One or more public routes failed or could not be checked.");
  if (!emailOk) blockers.push("On-domain email forwarding/copying is unverified.");
  if (originEvidenceRequired && !healthReceiptValid) blockers.push("Canonical-origin health receipt is missing or invalid.");
  if (originEvidenceRequired && !headersValid) blockers.push("Canonical-origin edge security headers are incomplete.");
  return {
    schemaVersion: "1.0",
    generatedBy: "scripts/launch-evidence-report.mjs",
    checkedAt,
    baseUrl: normalizeBaseUrl(baseUrl),
    summary: {
      status: routesOk && emailOk && originOk ? "ready" : "blocked",
      routesOk,
      emailForwardingVerified: emailOk,
      originEvidenceVerified: originOk,
      blocker: blockers.length ? blockers.join(" ") : null
    },
    routeChecks,
    emailForwarding,
    originEvidence: {
      required: originEvidenceRequired,
      healthReceiptValid,
      securityHeaders,
      status: originOk ? "verified" : "blocked"
    }
  };
}

function renderText(report) {
  const lines = [
    `Launch evidence: ${report.summary.status.toUpperCase()}`,
    `Base URL: ${report.baseUrl}`,
    `Routes: ${report.summary.routesOk ? "ok" : "blocked"}`,
    `Email: ${report.emailForwarding.status}`,
    `Origin evidence: ${report.originEvidence.status}`,
    report.summary.blocker ? `Blocker: ${report.summary.blocker}` : "Blocker: none"
  ];
  for (const check of report.routeChecks) {
    lines.push(`- ${check.route}: ${check.ok ? "ok" : "fail"} (${check.detail})`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const fixture = await readFixture(args.fixture);
  const report = await buildLaunchEvidenceReport({
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
    fixture,
    emailEvidence: args.emailEvidence
  });
  if (args.output) {
    const outputPath = path.resolve(rootDir, args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderText(report));
  process.exitCode = report.summary.status === "ready" ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
