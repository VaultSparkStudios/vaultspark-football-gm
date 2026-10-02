import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { spawn } from "../scripts/lib/safe-spawn.mjs";
import {
  BUFFERED_BODY,
  SECURITY_HEADERS,
  clampQueryInt,
  isPathInsideBaseDir,
  readRequestBody,
  resolveClientAddress,
  stopOversizeUpload
} from "../src/server/httpHardening.js";
import { createPrivacySafeAddressKey } from "../src/community/server.js";

/**
 * S113 — Node server hardening.
 *
 * Unit coverage for the helpers in src/server/httpHardening.js, plus live HTTP
 * coverage against the real src/server.js (booted once, as in
 * server-routes.test.js) so the wiring is proved by execution, not by grep.
 */

const realFetch = globalThis.fetch;
const RATE_LIMIT = 40;

// ── Unit: readRequestBody ────────────────────────────────────────────────────

function fakeRequest(headers = {}) {
  const stream = new PassThrough();
  stream.headers = headers;
  return stream;
}

test("readRequestBody counts bytes, not UTF-16 code units", async () => {
  // 4-byte emoji: 3 of them are 6 string code units but 12 bytes.
  const req = fakeRequest();
  const pending = readRequestBody(req, { limit: 10 });
  req.end(Buffer.from("😀😀😀", "utf8"));
  await assert.rejects(pending, (error) => error.status === 413 && error.code === "BODY_TOO_LARGE");
});

test("readRequestBody rejects once with 413 and stops consuming the stream", async () => {
  const req = fakeRequest();
  let rejections = 0;
  const pending = readRequestBody(req, { limit: 1024 }).catch((error) => { rejections += 1; return error; });
  req.write(Buffer.alloc(800, 0x61));
  req.write(Buffer.alloc(800, 0x61));
  req.write(Buffer.alloc(800, 0x61));
  const error = await pending;
  assert.equal(error.status, 413);
  assert.equal(error.expose, true);
  assert.equal(rejections, 1);
  assert.equal(req.listenerCount("data"), 0, "the reader must detach so no further bytes are consumed");
  assert.equal(req.isPaused(), true, "the request must be paused after overflow");
  assert.equal(req[BUFFERED_BODY], undefined, "an overflowing body is never memoized");
});

test("readRequestBody rejects a declared oversize Content-Length without reading", async () => {
  const req = fakeRequest({ "content-length": "5000" });
  await assert.rejects(readRequestBody(req, { limit: 1024 }), (error) => error.status === 413);
  assert.equal(req.listenerCount("data"), 0);
});

test("readRequestBody still reads and memoizes a normal multi-chunk UTF-8 body", async () => {
  const req = fakeRequest();
  const pending = readRequestBody(req);
  const payload = Buffer.from(JSON.stringify({ name: "Zoë 😀" }), "utf8");
  // Split inside the multi-byte sequence: decoding per chunk would corrupt it.
  req.write(payload.subarray(0, 10));
  req.end(payload.subarray(10));
  const body = await pending;
  assert.deepEqual(JSON.parse(body), { name: "Zoë 😀" });
  assert.equal(await readRequestBody(req), body, "the second read returns the memoized body");
});

test("stopOversizeUpload drains only a bounded remainder, then destroys the request", async () => {
  const req = fakeRequest();
  req.pause();
  const res = { writableFinished: true };
  stopOversizeUpload(req, res, { graceMs: 5_000, maxDiscardBytes: 1024 });
  req.write(Buffer.alloc(800));
  req.write(Buffer.alloc(800));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(req.destroyed, true, "exceeding the discard cap must destroy the request");

  const slow = fakeRequest();
  stopOversizeUpload(slow, { writableFinished: true }, { graceMs: 20, maxDiscardBytes: 1 << 30 });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(slow.destroyed, true, "the grace timer must destroy a stalled upload");
});

// ── Unit: static path containment ────────────────────────────────────────────

test("isPathInsideBaseDir rejects a sibling directory sharing the base prefix", () => {
  const base = path.resolve("public");
  assert.equal(isPathInsideBaseDir(base, base), true);
  assert.equal(isPathInsideBaseDir(path.join(base, "index.html"), base), true);
  assert.equal(isPathInsideBaseDir(path.join(base, "lib", "x.js"), base), true);
  assert.equal(isPathInsideBaseDir(`${base}-evil${path.sep}secret.txt`, base), false, "public-evil/ must not pass as public/");
  assert.equal(isPathInsideBaseDir(`${base}2`, base), false);
  assert.equal(isPathInsideBaseDir(path.resolve(base, "..", "package.json"), base), false);
});

test("serveStatic uses the separator-aware containment check", () => {
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /if \(!isPathInsideBaseDir\(resolved, baseDir\)\)/);
  assert.doesNotMatch(source, /resolved\.startsWith\(baseDir\)/);
});

// ── Unit: query clamps ───────────────────────────────────────────────────────

test("clampQueryInt clamps, floors and falls back like the routes expect", () => {
  const bounds = { min: 1, max: 500, fallback: 200 };
  assert.equal(clampQueryInt(null, bounds), 200);
  assert.equal(clampQueryInt("", bounds), 200);
  assert.equal(clampQueryInt("abc", bounds), 200);
  assert.equal(clampQueryInt("0", bounds), 200, "0 keeps the historical `|| fallback` semantics");
  assert.equal(clampQueryInt("999999999", bounds), 500);
  assert.equal(clampQueryInt("-40", bounds), 1);
  assert.equal(clampQueryInt("37.9", bounds), 37);
  assert.equal(clampQueryInt("Infinity", bounds), 200);
});

// ── Unit: rate-limit identity ────────────────────────────────────────────────

test("resolveClientAddress ignores forwarding headers without VSFGM_TRUST_PROXY", () => {
  const req = (headers) => ({ headers, socket: { remoteAddress: "203.0.113.50" } });
  const env = {};
  assert.equal(resolveClientAddress(req({ "x-forwarded-for": "198.51.100.1" }), { env }), "203.0.113.50");
  assert.equal(resolveClientAddress(req({ "cf-connecting-ip": "198.51.100.2" }), { env }), "203.0.113.50");
  assert.equal(resolveClientAddress(req({}), { env: { VSFGM_TRUST_PROXY: "0" } }), "203.0.113.50");
});

test("resolveClientAddress honours cf-connecting-ip, then the nearest XFF hop, when trusted", () => {
  const env = { VSFGM_TRUST_PROXY: "1" };
  const peer = { remoteAddress: "10.0.0.2" };
  assert.equal(resolveClientAddress({ headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }, socket: peer }, { env }), "198.51.100.7");
  assert.equal(
    resolveClientAddress({ headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.8" }, socket: peer }, { env }),
    "198.51.100.8",
    "the spoofable left-most hop is never the key"
  );
  assert.equal(resolveClientAddress({ headers: {}, socket: peer }, { env }), "10.0.0.2");
});

test("community address key honours cf-connecting-ip only behind the loopback proxy with COMMUNITY_TRUST_PROXY", () => {
  const untrusted = createPrivacySafeAddressKey("k", { env: {} });
  const trusted = createPrivacySafeAddressKey("k", { env: { COMMUNITY_TRUST_PROXY: "1" } });
  const direct = (cf) => ({ headers: { "cf-connecting-ip": cf }, socket: { remoteAddress: "203.0.113.50" } });
  const proxied = (cf) => ({ headers: { "cf-connecting-ip": cf, "x-forwarded-for": "198.51.100.200" }, socket: { remoteAddress: "127.0.0.1" } });
  assert.equal(trusted(direct("198.51.100.1")), trusted(direct("198.51.100.2")), "a direct peer cannot rotate cf-connecting-ip");
  assert.equal(untrusted(proxied("198.51.100.1")), untrusted(proxied("198.51.100.2")), "without the flag cf-connecting-ip is ignored");
  assert.notEqual(trusted(proxied("198.51.100.1")), trusted(proxied("198.51.100.2")));
});

// ── Live server ──────────────────────────────────────────────────────────────

let server = null;
let base = null;
let saveDirectory = null;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

before(async () => {
  const port = await freePort();
  saveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fa-s113-hardening-"));
  const env = { ...process.env, PORT: String(port), NODE_ENV: "test", VSFGM_SAVE_DIR: saveDirectory, VSFGM_RATE_LIMIT_PER_MIN: String(RATE_LIMIT) };
  delete env.VSFGM_TRUST_PROXY;
  const child = spawn(process.execPath, ["src/server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  child.on("error", (error) => stderr.push(`spawn error: ${error.message}`));
  server = { child, stderr };
  base = `http://127.0.0.1:${port}`;
  // Readiness probes a static asset so the API rate budget stays untouched.
  const deadline = Date.now() + 180_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    try { ready = (await realFetch(`${base}/index.html`)).ok; } catch { /* not listening yet */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `server never became ready\n${stderr.join("")}`);
});

after(async () => {
  if (!server) return;
  server.child.kill();
  await new Promise((resolve) => server.child.once("exit", resolve));
  server = null;
  if (saveDirectory && path.dirname(path.resolve(saveDirectory)) === path.resolve(os.tmpdir()) &&
      path.basename(saveDirectory).startsWith("fa-s113-hardening-")) {
    fs.rmSync(saveDirectory, { recursive: true, force: true });
  }
});

/** Stream `totalBytes` at a route and report what the server answered. */
function streamOversizeBody(route, { totalBytes, declareLength }) {
  return new Promise((resolve) => {
    const target = new URL(route, base);
    const headers = { "content-type": "application/json" };
    if (declareLength) headers["content-length"] = String(totalBytes);
    const req = http.request({ hostname: target.hostname, port: target.port, path: target.pathname, method: "POST", headers });
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let written = 0;
    let status = null;
    let body = "";
    let done = false;
    const finish = (reason) => {
      if (done) return;
      done = true;
      req.destroy();
      resolve({ status, body, written, reason });
    };
    req.on("response", (res) => {
      status = res.statusCode;
      res.setEncoding("utf8");
      res.on("data", (data) => { body += data; });
      res.on("end", () => finish("end"));
      res.on("error", () => finish("response-error"));
    });
    req.on("error", (error) => finish(`request-error:${error.code}`));
    const pump = () => {
      while (!done && written < totalBytes) {
        written += chunk.length;
        if (!req.write(chunk)) { req.once("drain", pump); return; }
      }
      if (!done) req.end();
    };
    pump();
  });
}

test("live: an oversize declared body is answered 413 and the upload is cut off", async () => {
  const totalBytes = 64 * 1024 * 1024;
  const result = await streamOversizeBody("/api/settings", { totalBytes, declareLength: true });
  assert.equal(result.status, 413, JSON.stringify(result));
  assert.equal(JSON.parse(result.body).ok, false);
  assert.ok(result.written < totalBytes, `server must stop reading; client wrote ${result.written} of ${totalBytes}`);
});

test("live: an oversize chunked body is answered 413 and the upload is cut off", async () => {
  const totalBytes = 64 * 1024 * 1024;
  const result = await streamOversizeBody("/api/settings", { totalBytes, declareLength: false });
  assert.equal(result.status, 413, JSON.stringify(result));
  assert.match(JSON.parse(result.body).error, /exceeds/);
  assert.ok(result.written < totalBytes, `server must stop reading; client wrote ${result.written} of ${totalBytes}`);
});

test("live: an unhandled route exception is a generic 500", async () => {
  // teamAPlayerIds must be an array; a number makes the route throw a TypeError.
  const response = await realFetch(`${base}/api/trade/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamA: "BUF", teamB: "NYJ", teamAPlayerIds: 5 })
  });
  const body = await response.json();
  assert.equal(response.status, 500, JSON.stringify(body));
  assert.deepEqual(body, { ok: false, error: "Internal server error." });
  assert.ok(server.stderr.join("").includes("is not a function"), "the real error is logged server-side");
});

test("live: security headers are set on API and static responses", async () => {
  for (const route of ["/api/system/persistence", "/index.html"]) {
    const response = await realFetch(`${base}${route}`);
    await response.arrayBuffer();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(response.headers.get(name), value, `${route} ${name}`);
    }
  }
});

test("live: limit query params are clamped", async () => {
  const freeAgents = await (await realFetch(`${base}/api/free-agents?limit=999999999`)).json();
  assert.equal(freeAgents.ok, true);
  assert.ok(freeAgents.freeAgents.length <= 500);
  const search = await (await realFetch(`${base}/api/players/search?q=a&limit=999999&includeRetired=1`)).json();
  assert.ok(search.players.length <= 100);
  const source = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  for (const [route, max] of [["free-agents", 500], ["retired", 1000], ["players/search", 100], ["free-agency/market", 200], ["calibration/jobs", 200]]) {
    const start = source.indexOf(`url.pathname === "/api/${route}"`);
    const block = source.slice(start, source.indexOf("return true;", start));
    assert.match(block, new RegExp(`clampQueryInt\\(url\\.searchParams\\.get\\("limit"\\), \\{ min: \\d+, max: ${max},`), route);
  }
});

// Runs last: it deliberately exhausts this server's API budget.
test("live: rotating X-Forwarded-For / cf-connecting-ip cannot evade the rate limit", async () => {
  let limitedAt = null;
  for (let i = 0; i < RATE_LIMIT + 5 && limitedAt == null; i += 1) {
    const response = await realFetch(`${base}/api/system/persistence`, {
      headers: { "x-forwarded-for": `198.51.100.${i}`, "cf-connecting-ip": `203.0.113.${i}` }
    });
    await response.arrayBuffer();
    if (response.status === 429) limitedAt = i;
  }
  assert.ok(limitedAt != null, "spoofed forwarding headers must not mint fresh rate buckets");
  assert.ok(limitedAt <= RATE_LIMIT, `limited after ${limitedAt} requests`);
});
