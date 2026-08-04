/**
 * Precache service worker (S62) — the ~110-module static bundle loads once,
 * then boots from cache. Generator is deterministic, dependency-free,
 * static-host-safe, and never caches freshness/evidence surfaces.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildPrecacheManifest,
  renderServiceWorker,
  emitServiceWorker,
  shouldPrecache,
  SW_REGISTRATION_SNIPPET,
  PRECACHE_EXCLUDES
} from "../scripts/lib/service-worker.mjs";

async function fixtureMount() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vsfgm-sw-"));
  await fs.writeFile(path.join(dir, "index.html"), "<html>app</html>");
  await fs.writeFile(path.join(dir, "app.js"), "console.log('app');");
  await fs.mkdir(path.join(dir, "lib"));
  await fs.writeFile(path.join(dir, "lib", "core.js"), "export const x = 1;");
  await fs.writeFile(path.join(dir, "styles.css"), ":root{}");
  await fs.writeFile(path.join(dir, "styles.abc123def0.css"), ":root{}");
  await fs.writeFile(path.join(dir, "_health"), "{}");
  await fs.writeFile(path.join(dir, "deploy-manifest.json"), "{}");
  await fs.writeFile(path.join(dir, "_headers"), "X: y");
  await fs.writeFile(path.join(dir, "photo.bin"), "binary");
  return dir;
}

test("evidence and freshness surfaces are never precached", () => {
  for (const excluded of PRECACHE_EXCLUDES) {
    assert.equal(shouldPrecache(excluded), false, `${excluded} must stay network-only`);
  }
  assert.equal(shouldPrecache("lib/gameFlow.js"), true);
  assert.equal(shouldPrecache("src/runtime/GameSession.js"), true);
  assert.equal(shouldPrecache("photo.bin"), false, "unknown binaries stay out of the manifest");
  assert.equal(shouldPrecache("styles.css"), false, "plain styles.css duplicates the hashed stylesheet (S70)");
  assert.equal(shouldPrecache("styles.abc123def0.css"), true, "the hashed stylesheet is the one HTML references");
});

test("manifest is deterministic, content-versioned, and byte-accounted", async () => {
  const dir = await fixtureMount();
  const first = await buildPrecacheManifest(dir);
  const second = await buildPrecacheManifest(dir);
  assert.deepEqual(first, second, "same content, same manifest");
  assert.equal(first.assetCount, 4, "html + 2 js + hashed css (plain styles.css deduped)");
  assert.ok(!first.assets.some((asset) => asset.url === "./styles.css"), "plain styles.css never precached twice");
  assert.ok(first.totalBytes > 0);
  assert.ok(first.assets.every((asset) => asset.url.startsWith("./")));
  assert.ok(!first.assets.some((asset) => asset.url.includes("_health")));

  await fs.writeFile(path.join(dir, "app.js"), "console.log('changed');");
  const third = await buildPrecacheManifest(dir);
  assert.notEqual(third.version, first.version, "content change rolls the cache version");
});

test("rendered worker is dependency-free with the right cache policy", async () => {
  const dir = await fixtureMount();
  const manifest = await emitServiceWorker(dir);
  const source = await fs.readFile(path.join(dir, "sw.js"), "utf8");
  assert.match(source, new RegExp(`vsfgm-precache-${manifest.version}`));
  assert.match(source, /Promise\.allSettled\(PRECACHE_URLS\.map/, "install caches each URL independently (S70: one 404 cannot kill offline)");
  assert.match(source, /precache incomplete/, "failed precache URLs are logged, not swallowed");
  assert.doesNotMatch(source, /cache\.addAll\(/, "atomic addAll retired — it silently disabled offline on any 404");
  assert.match(source, /caches\.delete\(name\)/, "activate swaps old caches atomically");
  assert.match(source, /\/api\\\//, "API routes are network-only");
  assert.match(source, /_health\$/, "health stays network-only");
  assert.doesNotMatch(source, /import |require\(/, "worker is dependency-free");
  assert.doesNotMatch(source, /https?:\/\//, "worker makes no hard-coded external requests");
  const written = JSON.parse(await fs.readFile(path.join(dir, "precache-manifest.json"), "utf8"));
  assert.equal(written.version, manifest.version);
});

test("registration snippet is scoped, resilient, and update-aware", () => {
  assert.match(SW_REGISTRATION_SNIPPET, /register\("\.\/sw\.js"\)/, "mount-relative scope");
  assert.match(SW_REGISTRATION_SNIPPET, /catch\(\(\) => \{\}\)/, "registration failure never breaks the app");
  assert.match(SW_REGISTRATION_SNIPPET, /vsfgm:sw-updated/, "updates surface to the app toast");
});

test("the build injects registration into app shells and the app listens", async () => {
  const buildSource = await fs.readFile(new URL("../scripts/build-pages.mjs", import.meta.url), "utf8");
  assert.match(buildSource, /emitServiceWorker\(outDir\)/);
  assert.match(buildSource, /SW_REGISTRATION_SNIPPET/);
  const appSource = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(appSource, /vsfgm:sw-updated/, "app shows the update toast");
  const devHtml = await fs.readFile(new URL("../public/game.html", import.meta.url), "utf8");
  assert.doesNotMatch(devHtml, /serviceWorker\.register/, "dev shell stays clean — registration is build-injected");
});
