#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import { parseArtifactHeaderRules, resolveArtifactHeaders } from "./lib/edge-security-policy.mjs";

const root = process.cwd();
const staticDir = path.join(root, "static");
const outputDir = path.join(root, "output", "playwright", "public-qa");
const routes = ["index.html", "features.html", "how-to-play.html", "faq.html", "roadmap.html", "about.html", "press.html", "status.html", "status-archive.html", "stats.html", "simulation.html", "contact.html", "privacy.html", "terms.html"];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };

const manifest = JSON.parse(await fs.readFile(path.join(staticDir, "deploy-manifest.json"), "utf8"));
if (!/^[a-f0-9]{40}$/i.test(manifest.sourceRevision || "")) throw new Error("Public evidence requires an immutable source revision.");
if (!/^[a-f0-9]{64}$/i.test(manifest.artifactFingerprint?.digest || "")) throw new Error("Public evidence requires an immutable artifact fingerprint.");
const artifactHeaderRules = parseArtifactHeaderRules(await fs.readFile(path.join(staticDir, "_headers"), "utf8"));
await fs.mkdir(outputDir, { recursive: true });
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = path.resolve(staticDir, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(`${staticDir}${path.sep}`)) throw new Error("Invalid path");
    const body = await fs.readFile(target);
    response.writeHead(200, { ...resolveArtifactHeaders(artifactHeaderRules, pathname), "content-type": mime[path.extname(target)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const captures = [];
try {
  for (const viewport of viewports) {
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      await context.addInitScript((value) => localStorage.setItem("franchise-architect-theme", value), theme);
      await context.addInitScript(() => {
        globalThis.__evidencePolicyViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          globalThis.__evidencePolicyViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
      });
      const page = await context.newPage();
      for (const route of routes) {
        const response = await page.goto(`${baseUrl}/${route}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        const name = `${viewport.name}-${theme}-${route.replace(".html", "")}.png`;
        await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
        const dimensions = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, policyViolations: globalThis.__evidencePolicyViolations || [] }));
        const deliveredCsp = response?.headers()["content-security-policy"] || null;
        const policyMatchesArtifact = deliveredCsp === resolveArtifactHeaders(artifactHeaderRules, `/${route}`)["content-security-policy"];
        captures.push({ file: name, route, theme, viewport, status: response?.status() || 0, deliveredCsp, policyMatchesArtifact, ...dimensions });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
const failures = captures.filter((item) => item.status !== 200 || item.documentWidth > item.width + 1 || !item.policyMatchesArtifact || item.policyViolations.length);
const report = { sourceRevision: manifest.sourceRevision, artifactFingerprint: manifest.artifactFingerprint, policySource: "static/_headers", capturedAt: new Date().toISOString(), captures, status: failures.length ? "failed" : "passed", failures };
await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ count: captures.length, failures, outputDir }, null, 2));
if (failures.length) process.exitCode = 1;
