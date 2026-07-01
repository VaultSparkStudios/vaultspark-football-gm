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
  "/sitemap.xml"
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

function probeHttps(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = https.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          statusCode: response.statusCode,
          detail: `HTTP ${response.statusCode}`
        });
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, statusCode: null, detail: `timeout after ${timeoutMs}ms` });
    });
    request.on("error", (error) => {
      resolve({ ok: false, statusCode: null, detail: error.message });
    });
  });
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
    const observed = fixtureRoutes[route] || (fixture ? null : await probeHttps(url, timeoutMs));
    const result = observed || { ok: false, statusCode: null, detail: "missing fixture route result" };
    routeChecks.push({
      route,
      url,
      ok: result.ok === true,
      statusCode: result.statusCode ?? null,
      detail: result.detail || (result.ok ? "ok" : "failed")
    });
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
  return {
    schemaVersion: "1.0",
    generatedBy: "scripts/launch-evidence-report.mjs",
    checkedAt,
    baseUrl: normalizeBaseUrl(baseUrl),
    summary: {
      status: routesOk && emailOk ? "ready" : "blocked",
      routesOk,
      emailForwardingVerified: emailOk,
      blocker: routesOk
        ? (emailOk ? null : "On-domain email forwarding/copying is unverified.")
        : "One or more public routes failed or could not be checked."
    },
    routeChecks,
    emailForwarding
  };
}

function renderText(report) {
  const lines = [
    `Launch evidence: ${report.summary.status.toUpperCase()}`,
    `Base URL: ${report.baseUrl}`,
    `Routes: ${report.summary.routesOk ? "ok" : "blocked"}`,
    `Email: ${report.emailForwarding.status}`,
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