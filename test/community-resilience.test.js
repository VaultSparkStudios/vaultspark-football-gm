import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { CommunityStore } from "../src/community/communityStore.js";
import {
  createCommunityStatsHandler,
  createMemoryRateLimiter,
  createPrivacySafeAddressKey,
  rateLimitAddressGroup
} from "../src/community/server.js";

class StubPool extends EventEmitter {
  constructor() { super(); this.queries = []; this.ended = 0; this.gate = null; }
  async query(sql) {
    this.queries.push(String(sql).trim().split("\n")[0]);
    if (this.gate && /^DELETE FROM community_stats\.receipts WHERE received_at/.test(sql)) await this.gate;
    return { rows: [{ count: 0 }], rowCount: 0 };
  }
  async end() { this.ended += 1; }
  sweeps() { return this.queries.filter((sql) => /^DELETE FROM community_stats\.receipts WHERE received_at/.test(sql)).length; }
}

function makeStore(options = {}) {
  const keyPath = path.join(os.tmpdir(), `fa-community-resilience-${Math.random().toString(36).slice(2)}`, "pepper");
  const logged = [];
  const pool = options.pool || new StubPool();
  const store = new CommunityStore({ pool, keyPath, logger: { error: (line) => logged.push(line) }, ...(options.clock ? { clock: options.clock } : {}) });
  return { store, pool, logged };
}

function fakeTimers() {
  const state = { callback: null, intervalMs: null, started: 0, cleared: [], unrefs: 0 };
  const handle = { unref() { state.unrefs += 1; return handle; } };
  return {
    state,
    handle,
    setIntervalFn: (callback, intervalMs) => { state.callback = callback; state.intervalMs = intervalMs; state.started += 1; return handle; },
    clearIntervalFn: (value) => { state.cleared.push(value); }
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

test("IPv6 addresses are grouped by /64 for rate limiting and IPv4 addresses are not grouped", () => {
  assert.equal(rateLimitAddressGroup("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(rateLimitAddressGroup("2001:0DB8:0001:0002::1"), "2001:db8:1:2::/64");
  assert.equal(rateLimitAddressGroup("[2001:db8:1:2::9]"), "2001:db8:1:2::/64");
  assert.equal(rateLimitAddressGroup("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(rateLimitAddressGroup("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(rateLimitAddressGroup("::1"), "0:0:0:0::/64");
  assert.notEqual(rateLimitAddressGroup("2001:db8:1:2::1"), rateLimitAddressGroup("2001:db8:1:3::1"));
  assert.equal(rateLimitAddressGroup("198.51.100.7"), "198.51.100.7");
  assert.equal(rateLimitAddressGroup("::ffff:198.51.100.7"), "198.51.100.7", "IPv4-mapped IPv6 is the IPv4 address");
  assert.equal(rateLimitAddressGroup("64:ff9b::198.51.100.7"), "64:ff9b:0:0::/64");
  assert.equal(rateLimitAddressGroup("unknown"), "unknown");
  assert.equal(rateLimitAddressGroup(""), "");
});

test("the privacy-safe address key is shared across one IPv6 /64, differs across /64s, and never contains the address", () => {
  const keyFor = createPrivacySafeAddressKey("deterministic-test-key");
  const request = (address) => ({ headers: {}, socket: { remoteAddress: address } });
  const a = keyFor(request("2001:db8:1:2:1111:2222:3333:4444"));
  const b = keyFor(request("2001:db8:1:2::beef"));
  const other = keyFor(request("2001:db8:1:3::beef"));
  assert.equal(a, b);
  assert.notEqual(a, other);
  assert.notEqual(keyFor(request("198.51.100.1")), keyFor(request("198.51.100.2")), "IPv4 stays per address");
  assert.equal(keyFor(request("::ffff:198.51.100.1")), keyFor(request("198.51.100.1")));
  assert.doesNotMatch(`${a}${other}`, /2001|db8|198\.51/);
  // Forwarded IPv6 addresses from the loopback proxy are grouped the same way.
  const proxied = (address) => ({ headers: { "x-forwarded-for": address }, socket: { remoteAddress: "127.0.0.1" } });
  assert.equal(keyFor(proxied("2001:db8:1:2::1")), keyFor(proxied("2001:db8:1:2:ffff:ffff:ffff:ffff")));
});

test("rotating addresses inside one IPv6 /64 does not reset the feedback, capability or diagnostics limits", async () => {
  const store = { saveFeedback: async () => ({ accepted: 1 }), saveDiagnostics: async () => ({ accepted: 0, duplicates: 0 }) };
  const handler = createCommunityStatsHandler({
    store,
    feedbackRateLimit: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    feedbackCapabilityRateLimit: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    diagnosticsRateLimit: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 })
  });
  async function post(pathname, address) {
    const request = {
      method: "POST", url: pathname,
      headers: { origin: "https://playfranchisearchitect.com" },
      socket: { remoteAddress: address },
      async *[Symbol.asyncIterator]() { yield Buffer.from("{}"); }
    };
    const response = { status: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status) { this.status = status; }, end() {} };
    await handler(request, response);
    return response.status;
  }
  for (const pathname of ["/community/v1/feedback", "/community/v1/diagnostics"]) {
    assert.equal(await post(pathname, "2001:db8:7:7::1"), 400, `${pathname}: the first request is inside the limit (and fails validation)`);
    assert.equal(await post(pathname, "2001:db8:7:7:abcd::2"), 429, `${pathname}: a second address in the same /64 shares the limit`);
    assert.equal(await post(pathname, "2001:db8:7:8::1"), 400, `${pathname}: a different /64 has its own limit`);
  }
});

test("an idle-client pool error is logged by code and does not throw", () => {
  const { pool, logged } = makeStore();
  assert.equal(pool.listenerCount("error"), 1, "the store must listen for pool errors");
  const error = Object.assign(new Error("terminating connection due to administrator command at db.internal.example"), { code: "57P01" });
  assert.doesNotThrow(() => pool.emit("error", error, {}));
  assert.equal(logged.length, 1);
  assert.match(logged[0], /57P01/);
  assert.doesNotMatch(logged[0], /internal\.example/, "the raw driver message is not logged");
});

test("a pool without an event interface is still accepted", () => {
  const keyPath = path.join(os.tmpdir(), "fa-community-resilience-unused", "pepper");
  assert.doesNotThrow(() => new CommunityStore({ pool: { query: async () => ({}), end: async () => {} }, keyPath }));
});

test("the retention timer runs the sweep without any write, is unref'd, starts once and stops on close", async () => {
  const { store, pool } = makeStore();
  const timers = fakeTimers();
  store.startRetentionTimer({ setIntervalFn: timers.setIntervalFn });
  store.startRetentionTimer({ setIntervalFn: timers.setIntervalFn });
  assert.equal(timers.state.started, 1, "starting twice must not create a second timer");
  assert.equal(timers.state.intervalMs, 6 * 60 * 60 * 1000);
  assert.equal(timers.state.unrefs, 1, "the timer must not keep the process alive");
  assert.equal(pool.sweeps(), 0);

  timers.state.callback();
  await settle(); await settle();
  assert.equal(pool.sweeps(), 1, "a tick sweeps even though nothing was written");
  assert.ok(pool.queries.some((sql) => /^DELETE FROM community_stats\.feedback WHERE received_at/.test(sql)));
  assert.ok(pool.queries.some((sql) => /^DELETE FROM community_stats\.diagnostics WHERE received_at/.test(sql)));

  timers.state.callback();
  await settle(); await settle();
  assert.equal(pool.sweeps(), 2, "each tick sweeps, whatever the write path did last");

  store.stopRetentionTimer({ clearIntervalFn: timers.clearIntervalFn });
  assert.deepEqual(timers.state.cleared, [timers.handle]);
  assert.equal(store.retentionTimer, null);
});

test("close stops a real retention timer and ends the pool", async () => {
  const { store, pool } = makeStore();
  const timer = store.startRetentionTimer({ intervalMs: 60_000 });
  assert.equal(timer.hasRef(), false);
  await store.close();
  assert.equal(store.retentionTimer, null);
  assert.equal(pool.ended, 1);
});

test("a timer tick and a write that arrive together share one retention pass", async () => {
  const { store, pool } = makeStore();
  await store.initialize();
  let release;
  pool.gate = new Promise((resolve) => { release = resolve; });
  const timers = fakeTimers();
  store.startRetentionTimer({ setIntervalFn: timers.setIntervalFn });
  timers.state.callback();
  await settle();
  const fromWrite = store.cleanupIfDue();
  const forced = store.cleanupIfDue({ force: true });
  release();
  await Promise.all([fromWrite, forced]);
  await settle();
  assert.equal(pool.sweeps(), 1, "overlapping triggers must not run the sweep twice");
  assert.equal(store.cleanupInFlight, null);
  store.stopRetentionTimer();
});

test("a failed retention tick is logged and the next tick still runs", async () => {
  const { store, pool, logged } = makeStore();
  await store.initialize();
  const realQuery = pool.query.bind(pool);
  let fail = true;
  pool.query = async (sql) => {
    if (fail && /^DELETE FROM community_stats\.receipts WHERE received_at/.test(sql)) throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    return realQuery(sql);
  };
  const timers = fakeTimers();
  store.startRetentionTimer({ setIntervalFn: timers.setIntervalFn });
  timers.state.callback();
  await settle(); await settle();
  assert.equal(logged.length, 1);
  assert.match(logged[0], /retention pass failed: ECONNREFUSED/);
  fail = false;
  timers.state.callback();
  await settle(); await settle();
  assert.equal(pool.sweeps(), 1);
  store.stopRetentionTimer();
});

test("the server starts the retention timer and relies on store.close to stop it", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../src/community/server.js", import.meta.url), "utf8");
  const start = source.slice(source.indexOf("export function startCommunityStatsServer"));
  assert.match(start, /store\.startRetentionTimer\(\)/);
  assert.match(start, /await store\.close\(\)/);
});
