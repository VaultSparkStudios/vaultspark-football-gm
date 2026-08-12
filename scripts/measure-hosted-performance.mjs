#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { evaluateHostedPerformance, percentile, sha256Json } from "./lib/hosted-performance.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { baseUrl: null, output: "docs/performance/LATEST.json", runs: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base-url") args.baseUrl = argv[++index];
    else if (argv[index] === "--output") args.output = argv[++index];
    else if (argv[index] === "--runs") args.runs = Math.max(1, Number(argv[++index]) || 1);
  }
  return args;
}

async function jsonAt(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function measureProfile(browser, baseUrl, profile, runs) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__hostedVitals = { lcp: 0, lcpElement: null, cls: 0, shifts: [], events: [] };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          globalThis.__hostedVitals.lcp = Math.max(globalThis.__hostedVitals.lcp, entry.startTime);
          const element = entry.element;
          globalThis.__hostedVitals.lcpElement = element ? {
            tag: element.tagName,
            id: element.id || null,
            className: String(element.className || "").slice(0, 160),
            text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180)
          } : null;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
          globalThis.__hostedVitals.cls += entry.value;
          globalThis.__hostedVitals.shifts.push({
            value: Number(entry.value.toFixed(4)),
            sources: (entry.sources || []).map((source) => ({
              tag: source.node?.tagName || null,
              id: source.node?.id || null,
              className: String(source.node?.className || "").slice(0, 120),
              previousRect: source.previousRect,
              currentRect: source.currentRect
            }))
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (entry.interactionId) globalThis.__hostedVitals.events.push(entry.duration);
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
      } catch {}
    });
    await page.goto(new URL("./", baseUrl).href, { waitUntil: "networkidle", timeout: 90_000 });
    const interactionSelector = "#setupThemeToggleBtn";
    await page.waitForSelector(interactionSelector, { state: "visible", timeout: 90_000 });
    await page.waitForTimeout(1600);
    await page.click(interactionSelector);
    await page.waitForTimeout(700);
    samples.push(await page.evaluate(() => ({
      lcpMs: Math.round(globalThis.__hostedVitals.lcp || 0),
      lcpElement: globalThis.__hostedVitals.lcpElement,
      cls: Number((globalThis.__hostedVitals.cls || 0).toFixed(4)),
      shifts: globalThis.__hostedVitals.shifts,
      inpMs: Math.round(Math.max(0, ...globalThis.__hostedVitals.events)),
      interactionObserved: globalThis.__hostedVitals.events.length > 0
    })));
    await context.close();
  }
  return {
    name: profile.name,
    viewport: profile.viewport,
    runs,
    lcpMs: percentile(samples.map((sample) => sample.lcpMs)),
    inpMs: percentile(samples.map((sample) => sample.inpMs)),
    cls: percentile(samples.map((sample) => sample.cls)),
    interactionObserved: samples.every((sample) => sample.interactionObserved),
    samples
  };
}

export async function measureHostedPerformance({ baseUrl, output, runs = 3 } = {}) {
  const origin = String(baseUrl || "").replace(/\/+$/, "");
  if (!origin) throw new Error("Pass --base-url with the stable hosted origin.");
  const manifest = await jsonAt(`${origin}/deploy-manifest.json`);
  const health = await jsonAt(`${origin}/_health`);
  if (manifest.sourceRevision !== health.sourceRevision) throw new Error("Hosted manifest and health source revisions disagree.");
  const browser = await chromium.launch({ headless: true });
  let profiles;
  try {
    profiles = await Promise.all([
      measureProfile(browser, `${origin}/`, { name: "desktop", viewport: { width: 1440, height: 1000 } }, runs),
      measureProfile(browser, `${origin}/`, { name: "mobile", viewport: { width: 390, height: 844 } }, runs)
    ]);
  } finally {
    await browser.close();
  }
  const headersResponse = await fetch(`${origin}/`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const edgeHeaders = Object.fromEntries([...headersResponse.headers.entries()]);
  const evaluation = evaluateHostedPerformance({ profiles, sourceRevision: manifest.sourceRevision, artifactFingerprint: manifest.artifactFingerprint, edgeHeaders });
  const body = {
    schemaVersion: "1.0",
    kind: "hosted-performance-evidence",
    generatedBy: "scripts/measure-hosted-performance.mjs",
    observedAt: new Date().toISOString(),
    baseUrl: origin,
    route: "/",
    sourceRevision: manifest.sourceRevision,
    artifactFingerprint: manifest.artifactFingerprint,
    edgeHeaders,
    profiles,
    evaluation,
    boundary: "Lab evidence for the canonical public entry route from a real hosted browser interaction; it is not field cohort data. Direct game-shell hydration is retained as a separate diagnostic and is not silently collapsed into this route."
  };
  const receipt = { ...body, receiptSha256: sha256Json(body) };
  const target = path.resolve(process.cwd(), output || "docs/performance/LATEST.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  measureHostedPerformance(parseArgs()).then((receipt) => {
    console.log(`${receipt.evaluation.status.toUpperCase()} — hosted performance ${receipt.sourceRevision.slice(0, 12)} (${receipt.receiptSha256})`);
    process.exitCode = receipt.evaluation.status === "verified" ? 0 : 2;
  }).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
