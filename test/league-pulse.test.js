import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createCommunityStatsHandler } from "../src/community/server.js";
import { CommunityStore } from "../src/community/communityStore.js";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";
import { LEAGUE_PULSE_METRICS, normalizeLeaguePulse } from "../public/lib/leaguePulseContract.js";
import {
  LEAGUE_PULSE_PREFERENCE_KEY,
  addActiveTimeForTests,
  countPulse,
  flushLeaguePulse,
  isLeaguePulseEnabled,
  observePulseReceipt,
  pendingLeaguePulse,
  resetLeaguePulseForTests,
  setLeaguePulse
} from "../public/lib/leaguePulse.js";
import { shouldShowPulseNotice } from "../public/lib/leaguePulseNotice.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { executeAdvanceWeekCommand } from "../src/runtime/advanceWeekCommand.js";

const ALLOWED_ORIGIN = "https://playfranchisearchitect.com";

// Browser stand-ins, installed per test and always restored (shards share one process).
function withBrowser({ gpc = false, dnt = null, stored = {} } = {}, run) {
  const saved = { localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), window: Object.getOwnPropertyDescriptor(globalThis, "window"), document: Object.getOwnPropertyDescriptor(globalThis, "document") };
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: { querySelector: () => null } });
  const items = new Map(Object.entries(stored));
  const writes = [];
  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { writes.push(key); items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); }
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { globalPrivacyControl: gpc, doNotTrack: dnt } });
  resetLeaguePulseForTests();
  try { return run({ items, writes }); }
  finally {
    resetLeaguePulseForTests();
    if (saved.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved.localStorage;
    if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator); else delete globalThis.navigator;
    for (const key of ["window", "document"]) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; }
  }
}

function recordingFetch() {
  const calls = [];
  const fetchImpl = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
  return { calls, fetchImpl };
}

// ── The contract ────────────────────────────────────────────────────────────

test("a pulse is counters only: unknown keys, identifiers, over-cap and negative values are refused", () => {
  assert.deepEqual(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { gamesPlayed: 3, championships: 1, hallOfFamers: 0 } }), { gamesPlayed: 3, championships: 1 });
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { gamesPlayed: 3 }, participantId: "browser_123456789012" }), null, "no identifier may ride along");
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { teamName: 1 } }), null);
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { gamesPlayed: LEAGUE_PULSE_METRICS.gamesPlayed + 1 } }), null, "over the cap is refused, not clipped");
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { gamesPlayed: -1 } }), null);
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { gamesPlayed: 1.5 } }), null);
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: {} }), null, "an empty pulse is nothing");
  assert.equal(normalizeLeaguePulse({ schemaVersion: "pulse-1", counts: { returningLoad: 1 } }), null, "a return needs a load");
  assert.equal(normalizeLeaguePulse({ schemaVersion: "1.0", counts: { gamesPlayed: 1 } }), null);
});

// ── The browser side ────────────────────────────────────────────────────────

test("by default the pulse counts and sends counters with no identifier, no credentials and no stored analytics", () => {
  withBrowser({}, ({ writes }) => {
    assert.equal(isLeaguePulseEnabled(), true, "on by default");
    observePulseReceipt({
      path: "/api/advance-week",
      response: { franchiseOpeningWeek: true, clubHallOfFameInductions: 2 },
      events: [{ type: "weeks_managed", metrics: { weeks: 3, seasonsCompleted: 0, championships: 0 } }, { type: "draft_pick", metrics: {} }]
    });
    addActiveTimeForTests(17 * 60_000);
    const { calls, fetchImpl } = recordingFetch();
    const payload = flushLeaguePulse({ fetchImpl });
    assert.deepEqual(payload.counts, { gamesPlayed: 3, firstWeekPlayed: 1, hallOfFamers: 2, playersDrafted: 1, activeMinutes: 15 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.credentials, "omit");
    assert.equal(calls[0].init.keepalive, true);
    assert.match(calls[0].init.headers["Content-Type"], /^text\/plain/, "a simple request: no preflight");
    assert.doesNotMatch(calls[0].init.body, /participant|browser_|evt_|team|name/i);
    assert.deepEqual(writes, [], "nothing is written to the browser for the pulse");
    assert.deepEqual(pendingLeaguePulse(), {}, "a sent pulse starts again from zero");
  });
});

test("negative controls: opted out, Global Privacy Control or Do Not Track means no request at all", () => {
  for (const setup of [{ stored: { [LEAGUE_PULSE_PREFERENCE_KEY]: "off" } }, { gpc: true }, { dnt: "1" }]) {
    withBrowser(setup, () => {
      assert.equal(isLeaguePulseEnabled(), false);
      assert.equal(countPulse("gamesPlayed", 4), false);
      observePulseReceipt({ path: "/api/advance-week", response: { franchiseOpeningWeek: true }, events: [{ type: "league_started", metrics: {} }] });
      const { calls, fetchImpl } = recordingFetch();
      assert.equal(flushLeaguePulse({ fetchImpl }), null);
      assert.equal(calls.length, 0, JSON.stringify(setup));
    });
  }
});

test("turning the pulse off drops what was counted; turning it on overrides a browser signal for this site", () => {
  withBrowser({ gpc: true }, () => {
    assert.equal(setLeaguePulse(true), true, "an explicit choice beats the browser default");
    countPulse("gamesPlayed", 2);
    setLeaguePulse(false);
    const { calls, fetchImpl } = recordingFetch();
    assert.equal(flushLeaguePulse({ fetchImpl }), null);
    assert.equal(calls.length, 0);
  });
});

test("a new franchise is sent at once, because setup navigates away before a hide listener could run", () => {
  withBrowser({}, () => {
    const saved = globalThis.fetch;
    const { calls, fetchImpl } = recordingFetch();
    globalThis.fetch = fetchImpl;
    try {
      observePulseReceipt({ path: "/api/new-league", response: {}, events: [{ type: "league_started", metrics: {} }] });
      assert.equal(calls.length, 1);
      assert.deepEqual(JSON.parse(calls[0].init.body).counts, { leagueCreated: 1 });
    } finally { globalThis.fetch = saved; }
  });
});

test("outside a browser page the pulse is inert, so tests and scripts never post to the live service", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(isLeaguePulseEnabled(), false);
  assert.equal(countPulse("gamesPlayed", 3), false);
  assert.equal(flushLeaguePulse({ fetchImpl: () => assert.fail("no request outside a page") }), null);
});

test("the first-visit notice shows once, only when the player has made no choice and the browser sends no signal", () => {
  assert.equal(shouldShowPulseNotice({ seen: false, preference: "default", privacySignal: false }), true);
  assert.equal(shouldShowPulseNotice({ seen: true, preference: "default", privacySignal: false }), false);
  assert.equal(shouldShowPulseNotice({ seen: false, preference: "off", privacySignal: false }), false);
  assert.equal(shouldShowPulseNotice({ seen: false, preference: "default", privacySignal: true }), false);
});

// ── The service ─────────────────────────────────────────────────────────────

// Shards run many files in one process and some stub globalThis.fetch, so the
// service is reached through node:http, never the shared global.
function httpRequest(url, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, json: async () => JSON.parse(text || "null") }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function withServer(store, run) {
  const server = http.createServer(createCommunityStatsHandler({ store, origins: new Set([ALLOWED_ORIGIN, "https://staging.playfranchisearchitect.com"]), humanCheck: null }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

test("the service adds a valid pulse to the totals, refuses anything else and serves the totals", async () => {
  const added = [];
  const store = {
    health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null,
    addPulse: async (counts) => { added.push(counts); return { added: Object.keys(counts).length }; },
    pulseTotals: async () => ({ schemaVersion: "pulse-1", allTime: { gamesPlayed: 9 }, last30Days: { gamesPlayed: 9 } })
  };
  await withServer(store, async (origin) => {
    const post = (body, headers = {}) => httpRequest(`${origin}/community/v1/pulse`, { method: "POST", headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "text/plain;charset=UTF-8", ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({ schemaVersion: "pulse-1", counts: { gamesPlayed: 3, seasonsCompleted: 1 } })).status, 202);
    assert.deepEqual(added, [{ gamesPlayed: 3, seasonsCompleted: 1 }]);
    assert.equal((await post({ schemaVersion: "pulse-1", counts: { gamesPlayed: 3 }, participantId: "browser_123456789012" })).status, 400);
    assert.equal((await post({ schemaVersion: "pulse-1", counts: { championships: 999 } })).status, 400);
    const noOrigin = await httpRequest(`${origin}/community/v1/pulse`, { method: "POST", body: JSON.stringify({ schemaVersion: "pulse-1", counts: { gamesPlayed: 1 } }) });
    assert.equal(noOrigin.status, 403, "a pulse must come from the game's own pages");
    assert.equal(added.length, 1, "nothing refused reached the store");
    const staging = await post({ schemaVersion: "pulse-1", counts: { gamesPlayed: 2 } }, { Origin: "https://staging.playfranchisearchitect.com" });
    assert.equal(staging.status, 202, "staging play is accepted");
    assert.equal(added.length, 1, "but only the live game is counted");
    const totals = await (await httpRequest(`${origin}/community/v1/pulse`)).json();
    assert.equal(totals.allTime.gamesPlayed, 9);
  });
});

test("the store keeps one daily total per metric and nothing per browser", async () => {
  const queries = [];
  const pool = {
    on() {},
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/FROM community_stats\.pulse_daily GROUP BY/.test(sql)) return { rows: [{ metric: "championships", all_time: "7", last_30: "2" }, { metric: "unknown", all_time: "1", last_30: "1" }] };
      return { rows: [], rowCount: 0 };
    },
    async end() {}
  };
  const store = new CommunityStore({ pool, keyPath: path.join(os.tmpdir(), `fa-pulse-pepper-${process.pid}`), clock: () => new Date("2026-11-23T12:00:00Z") });
  await store.addPulse({ gamesPlayed: 4, championships: 1 });
  const insert = queries.find((row) => /INSERT INTO community_stats\.pulse_daily/.test(row.sql));
  assert.deepEqual(insert.params, ["2026-11-23", ["gamesPlayed", "championships"], [4, 1]]);
  assert.doesNotMatch(insert.sql, /participant|address|ip/i);
  const totals = await store.pulseTotals();
  assert.equal(totals.allTime.championships, 7);
  assert.equal(totals.last30Days.championships, 2);
  assert.equal(totals.allTime.gamesPlayed, 0);
  assert.equal(Object.hasOwn(totals.allTime, "unknown"), false, "only known metrics are published");
});

// ── The game side ───────────────────────────────────────────────────────────

test("the advance-week response says when a new franchise played its opening week, and only then", () => {
  const session = createSession({ seed: 133, startYear: 2026, controlledTeamId: "BUF" });
  while (session.phase !== "regular-season") {
    const step = executeAdvanceWeekCommand(session, { count: 1 });
    assert.equal(step.ok, true);
    assert.equal(step.franchiseOpeningWeek, false);
  }
  const first = executeAdvanceWeekCommand(session, { count: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.franchiseOpeningWeek, true);
  assert.equal(first.clubHallOfFameInductions, 0);
  const second = executeAdvanceWeekCommand(session, { count: 1 });
  assert.equal(second.franchiseOpeningWeek, false);
});
