import test from "node:test";
import assert from "node:assert/strict";
import { extractCommunityEvents } from "../src/community/extractCommunityEvents.js";
import { normalizeCommunityEvent } from "../src/community/eventContract.js";
import {
  applyEventsToLocalLedger,
  COMMUNITY_CONSENT_KEY,
  COMMUNITY_PENDING_DELETION_KEY,
  COMMUNITY_PARTICIPANT_KEY,
  COMMUNITY_QUEUE_KEY,
  emptyLocalCommunityLedger,
  flushCommunityQueue,
  getPendingCommunityDeletion,
  observeCommunityApiReceipt,
  retryPendingCommunityDeletion,
  setCommunityParticipation
} from "../public/lib/communityTelemetry.js";
import { communityParticipationPresentation, loadSnapshot, resolveSnapshotRefreshMs } from "../public/community-stats.js";

const now = () => "2026-08-08T12:00:00.000Z";
let sequence = 0;
const idFactory = () => `event_contract_${String(++sequence).padStart(4, "0")}`;

test("league starts produce one allowlisted receipt without names, save data or player ids", () => {
  const events = extractCommunityEvents({
    method: "POST", path: "/api/new-league", runtime: "client", now, idFactory,
    body: { mode: "play", controlledTeamId: "BUF", eraProfile: "modern-pass", franchiseArchetype: "rebuild", difficultyPreset: "architect", ownerName: "Private Founder", save: { players: [1, 2, 3] } },
    response: { ok: true, state: { controlledTeamId: "BUF", settings: {} } }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "league_started");
  assert.equal(events[0].dimensions.team, "buf");
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /Private Founder|players|ownerName|save/i);
});

test("weekly receipts derive bounded outcomes and rare feats from contract authority", () => {
  const events = extractCommunityEvents({
    method: "POST", path: "/api/advance-week", runtime: "server", now, idFactory,
    body: { count: 4, gmDecisionChoice: { decisionId: "owner-pressure", choiceId: "hold-course", note: "never transmit" } },
    response: {
      ok: true,
      commandReceipt: { count: 4, tactic: "aggressive-pass", gmDecisionApplied: true, started: { year: 2026, phase: "regular-season" }, completed: { year: 2027, phase: "offseason" } },
      architectEntry: { teamBefore: { wins: 13, losses: 0, ties: 0 }, teamAfter: { wins: 17, losses: 0, ties: 0 } },
      state: { controlledTeamId: "BUF", champions: [{ year: 2026, championTeamId: "BUF" }], settings: { difficultyPreset: "architect" } }
    }
  });
  assert.equal(events[0].type, "weeks_managed");
  assert.deepEqual(events[0].metrics, { weeks: 4, wins: 4, losses: 0, ties: 0, seasonsCompleted: 1, playoffBerths: 1, championships: 1 });
  assert.equal(events[0].dimensions.decision, "hold-course");
  assert.equal(events[0].evidenceTier, "server-runtime");
  assert.equal(events[1].dimensions.feat, "championship");
  assert.equal(events[2].dimensions.feat, "undefeated-season");
  assert.doesNotMatch(JSON.stringify(events), /never transmit/);
});

test("event normalization rejects unknown types, bad ids, unbounded timestamps and strips unknown fields", () => {
  assert.equal(normalizeCommunityEvent({ eventId: "valid_event_123", type: "unknown", occurredAt: now() }, { now: Date.parse(now()) }), null);
  assert.equal(normalizeCommunityEvent({ eventId: "short", type: "rare_feat", occurredAt: now() }, { now: Date.parse(now()) }), null);
  const normalized = normalizeCommunityEvent({ eventId: "valid_event_123", type: "rare_feat", occurredAt: now(), dimensions: { feat: "championship", playerName: "Secret" }, metrics: { count: 999, salary: 999999999 } }, { now: Date.parse(now()) });
  assert.deepEqual(normalized.dimensions, { feat: "championship" });
  assert.deepEqual(normalized.metrics, { count: 20 });
});

test("local comparison ledger remains useful even when network participation is off", () => {
  const events = extractCommunityEvents({ method: "POST", path: "/api/draft/user-pick", runtime: "client", now, idFactory, body: { playerId: "private-player-id" }, response: { ok: true, pick: { round: 1, overallPick: 12, player: { position: "QB", name: "Private Name", overall: 78, potential: 91 } }, state: {} } });
  const ledger = applyEventsToLocalLedger(emptyLocalCommunityLedger(), events, now());
  assert.equal(ledger.totals.draftPicks, 1);
  assert.equal(ledger.choices.positions.qb, 1);
  assert.doesNotMatch(JSON.stringify(ledger), /Private Name|private-player-id/);
});

test("browser participation acquires a short-lived capability, retries one rejected lease, flushes, and withdraws without persisting it", async () => {
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
  const saved = Object.fromEntries(["window", "document", "navigator", "CustomEvent", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls = [];
  let capabilities = 0;
  let eventAttempts = 0;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, dispatchEvent() {} } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => null } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
    Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url: String(url), method: init.method, body });
        if (String(url).endsWith("/capability")) {
          capabilities += 1;
          return new Response(JSON.stringify({
            ok: true,
            capability: `lease-${capabilities}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            useLimit: 4,
            remainingUses: 4
          }), { status: 201, headers: { "content-type": "application/json" } });
        }
        if (String(url).endsWith("/events")) {
          eventAttempts += 1;
          if (eventAttempts === 1) return new Response(JSON.stringify({ ok: false }), { status: 401 });
          return new Response(JSON.stringify({ ok: true, accepted: 1, duplicates: 0 }), { status: 202 });
        }
        if (String(url).endsWith("/participation")) return new Response(JSON.stringify({ ok: true, deleted: 1 }), { status: 200 });
        return new Response("", { status: 404 });
      }
    });

    await setCommunityParticipation(true);
    assert.equal(localStorage.getItem(COMMUNITY_CONSENT_KEY), "participating");
    assert.ok(localStorage.getItem(COMMUNITY_PARTICIPANT_KEY));
    observeCommunityApiReceipt({
      method: "POST",
      path: "/api/new-league",
      body: { controlledTeamId: "BUF" },
      response: { ok: true, state: { controlledTeamId: "BUF", settings: {} } },
      runtime: "client"
    });
    const flushed = await flushCommunityQueue();
    assert.equal(flushed.sent, 2, "the league start and its one-time setup milestone travel together");
    assert.deepEqual(calls.filter((row) => row.url.endsWith("/events")).at(-1).body.events.map((row) => row.type), ["league_started", "setup_finished"]);
    assert.equal(eventAttempts, 2, "a rejected process-local lease is refreshed exactly once");
    assert.equal(calls.filter((row) => row.url.endsWith("/capability")).length, 2);
    assert.equal(calls.filter((row) => row.url.endsWith("/events"))[0].body.capability, "lease-1");
    assert.equal(calls.filter((row) => row.url.endsWith("/events"))[1].body.capability, "lease-2");
    assert.deepEqual(JSON.parse(localStorage.getItem(COMMUNITY_QUEUE_KEY)), []);
    assert.doesNotMatch(JSON.stringify(Object.fromEntries(values)), /lease-[12]/, "capabilities remain in memory only");

    const stopped = await setCommunityParticipation(false);
    const withdrawal = calls.find((row) => row.url.endsWith("/participation"));
    assert.equal(withdrawal.body.capability, "lease-2");
    assert.deepEqual(stopped.deletion, { status: "success", deleted: 1 });
    assert.equal(localStorage.getItem(COMMUNITY_CONSENT_KEY), "declined");
    assert.equal(localStorage.getItem(COMMUNITY_PARTICIPANT_KEY), null);
    assert.equal(localStorage.getItem(COMMUNITY_PENDING_DELETION_KEY), null);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("decline is immediate while an identifier-only deletion tombstone retries to acknowledgement", async () => {
  const values = new Map([
    [COMMUNITY_CONSENT_KEY, "participating"],
    [COMMUNITY_PARTICIPANT_KEY, "browser_identifier_retry"],
    [COMMUNITY_QUEUE_KEY, JSON.stringify([{ eventId: "queued_private_event" }])]
  ]);
  const localStorage = {
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
  const saved = Object.fromEntries(["window", "document", "navigator", "CustomEvent", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let deleteAttempts = 0;
  const calls = [];
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, dispatchEvent() {} } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => null } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
    Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url, init = {}) => {
        calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
        if (String(url).endsWith("/capability")) {
          return new Response(JSON.stringify({ capability: "deletion-lease", expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingUses: 4 }), { status: 201 });
        }
        if (String(url).endsWith("/participation")) {
          deleteAttempts += 1;
          return deleteAttempts === 1
            ? new Response(JSON.stringify({ ok: false }), { status: 503 })
            : new Response(JSON.stringify({ ok: true, deleted: 3 }), { status: 200 });
        }
        throw new Error("declined participation must not send queued events");
      }
    });

    const stopped = await setCommunityParticipation(false);
    assert.equal(stopped.participating, false);
    assert.equal(stopped.deletion.status, "failed");
    assert.equal(localStorage.getItem(COMMUNITY_CONSENT_KEY), "declined");
    assert.equal(localStorage.getItem(COMMUNITY_PARTICIPANT_KEY), null);
    assert.equal(localStorage.getItem(COMMUNITY_QUEUE_KEY), null);
    assert.equal(getPendingCommunityDeletion(), "browser_identifier_retry");
    assert.deepEqual(Object.fromEntries(values), {
      [COMMUNITY_CONSENT_KEY]: "declined",
      [COMMUNITY_PENDING_DELETION_KEY]: "browser_identifier_retry"
    }, "the retry tombstone contains only the purpose-bound anonymous identifier");

    const acknowledged = await retryPendingCommunityDeletion();
    assert.deepEqual(acknowledged, { status: "success", deleted: 3 });
    assert.equal(getPendingCommunityDeletion(), "");
    assert.equal(calls.some((row) => row.url.endsWith("/events")), false);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("snapshot polling is single-flight, ETag-aware, and never schedules below sixty seconds", async () => {
  assert.equal(resolveSnapshotRefreshMs({ refreshAfterSeconds: 10 }), 60_000);
  assert.equal(resolveSnapshotRefreshMs({ refreshAfterSeconds: 60 }, 1), 120_000);
  assert.equal(resolveSnapshotRefreshMs({ refreshAfterSeconds: 60 }, 9), 300_000);

  const saved = Object.fromEntries(["document", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls = [];
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", querySelector: () => null } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { connection: { saveData: false } } });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (_url, init = {}) => {
        calls.push(init);
        if (calls.length === 1) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return new Response(JSON.stringify({ schemaVersion: "1.0", status: "warming", refreshAfterSeconds: 60, periods: {} }), { status: 200, headers: { ETag: '"snapshot-v1"' } });
        }
        return new Response(null, { status: 304, headers: { ETag: '"snapshot-v1"' } });
      }
    });

    const first = loadSnapshot({ force: true });
    const coalesced = loadSnapshot({ force: true });
    assert.equal(first, coalesced);
    await first;
    assert.equal(calls.length, 1);
    await loadSnapshot({ force: true });
    assert.equal(calls[1].headers["If-None-Match"], '"snapshot-v1"');
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("participation controls distinguish pending, failed, and acknowledged deletion truth", () => {
  const pending = communityParticipationPresentation({ pending: true, outcome: { status: "pending" } });
  assert.equal(pending.deletionStatus, "pending");
  assert.match(pending.heading, /deletion pending/i);
  const failed = communityParticipationPresentation({ pending: true, outcome: { status: "failed" } });
  assert.equal(failed.deletionStatus, "failed");
  assert.match(failed.detail, /retry/i);
  const success = communityParticipationPresentation({ pending: false, outcome: { status: "success" } });
  assert.equal(success.deletionStatus, "success");
  assert.match(success.heading, /confirmed/i);
  const refused = communityParticipationPresentation({ participationFailed: true });
  assert.match(refused.heading, /sharing is off/i);
  assert.match(refused.detail, /storage/i);
  assert.doesNotMatch(refused.heading, /contributing/i);
  assert.match(communityParticipationPresentation({ participating: true, participationFailed: true }).heading, /contributing/i);
  assert.match(communityParticipationPresentation({ pending: true, participationFailed: true }).heading, /deletion pending/i);
});

// ── First-steps milestones, feedback notes and error reports ────────────────

test("the four first-steps milestones normalise to fixed fields and drop everything else", async () => {
  const { COMMUNITY_EVENT_TYPES, COMMUNITY_FUNNEL_EVENT_TYPES, COMMUNITY_RETURN_GAPS, returnVisitGap } = await import("../src/community/eventContract.js");
  assert.deepEqual(COMMUNITY_FUNNEL_EVENT_TYPES, ["setup_finished", "first_advance", "first_season_finished", "return_visit"]);
  for (const type of COMMUNITY_FUNNEL_EVENT_TYPES) assert.ok(COMMUNITY_EVENT_TYPES.includes(type));
  const at = Date.parse(now());
  for (const type of ["setup_finished", "first_advance", "first_season_finished"]) {
    const normalized = normalizeCommunityEvent({
      eventId: "valid_event_123", type, occurredAt: now(),
      dimensions: { runtime: "client", team: "BUF", ownerName: "Private Founder", gap: "1-6" },
      metrics: { weeks: 4, count: 3 }
    }, { now: at });
    assert.deepEqual(normalized.dimensions, { runtime: "client" }, `${type} carries nothing but the runtime`);
    assert.deepEqual(normalized.metrics, {});
  }
  const visit = (gap) => normalizeCommunityEvent({ eventId: "valid_event_123", type: "return_visit", occurredAt: now(), dimensions: { runtime: "client", gap, lastSeen: "2026-08-01" }, metrics: { days: 12 } }, { now: at });
  for (const gap of COMMUNITY_RETURN_GAPS) assert.deepEqual(visit(gap).dimensions, { runtime: "client", gap });
  assert.deepEqual(visit("12").dimensions, { runtime: "client" }, "an exact day count is not one of the four buckets and is dropped");
  assert.deepEqual(visit("2026-08-01").dimensions, { runtime: "client" });
  assert.deepEqual(visit("7-29").metrics, {});
  assert.deepEqual([0, 0.5, 1, 6, 7, 29, 30, 400, -3, "x"].map(returnVisitGap), ["same-day", "same-day", "1-6", "1-6", "7-29", "7-29", "30-plus", "30-plus", "same-day", "same-day"]);
});

test("milestones are derived only while sharing is on, once per browser, with a bucketed return visit", async () => {
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
  const saved = Object.fromEntries(["window", "document", "navigator", "CustomEvent", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, dispatchEvent() {} } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => null } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
    Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { throw new Error("offline fixture: nothing may be sent"); } });
    const telemetry = await import("../public/lib/communityTelemetry.js?funnel-test=1");
    const league = () => telemetry.observeCommunityApiReceipt({ method: "POST", path: "/api/new-league", body: { controlledTeamId: "BUF" }, response: { ok: true, state: { controlledTeamId: "BUF", settings: {} } }, runtime: "client" });
    const advance = (completedYear) => telemetry.observeCommunityApiReceipt({
      method: "POST", path: "/api/advance-week", body: {}, runtime: "client",
      response: { ok: true, commandReceipt: { count: 1, started: { year: 2026, phase: "regular-season" }, completed: { year: completedYear, phase: "regular-season" } }, state: { controlledTeamId: "BUF", champions: [], latestStandings: [{ team: "BUF", wins: 1, losses: 1 }] } }
    });
    const types = (rows) => rows.map((row) => row.type);

    assert.deepEqual(types(league()), ["league_started"], "sharing is off: no milestone is derived");
    assert.equal(values.has(telemetry.COMMUNITY_FUNNEL_KEY), false, "sharing is off: nothing is remembered either");

    values.set(COMMUNITY_CONSENT_KEY, "participating");
    values.set(COMMUNITY_PARTICIPANT_KEY, "browser_identifier_funnel");
    assert.deepEqual(types(league()), ["league_started", "setup_finished"]);
    assert.deepEqual(types(league()), ["league_started"], "setup is reported once per browser");
    assert.deepEqual(types(advance(2026)), ["weeks_managed", "first_advance"]);
    assert.deepEqual(types(advance(2027)), ["weeks_managed", "first_season_finished"]);
    assert.deepEqual(types(advance(2028)), ["weeks_managed"]);
    const stored = JSON.parse(values.get(telemetry.COMMUNITY_FUNNEL_KEY));
    assert.deepEqual(Object.keys(stored).sort(), ["advance", "day", "season", "setup"]);

    // A later page load, nine days on: one return visit in the 7-29 bucket, then none for that load.
    values.set(telemetry.COMMUNITY_FUNNEL_KEY, JSON.stringify({ ...stored, day: stored.day - 9 }));
    const later = await import("../public/lib/communityTelemetry.js?funnel-test=2");
    const returned = later.observeCommunityApiReceipt({ method: "POST", path: "/api/settings", body: { difficultyPreset: "standard" }, response: { ok: true }, runtime: "client" });
    assert.deepEqual(types(returned), ["settings_changed", "return_visit"]);
    assert.deepEqual(returned[1].dimensions, { runtime: "client", gap: "7-29" });
    assert.deepEqual(returned[1].metrics, {});
    assert.deepEqual(types(later.observeCommunityApiReceipt({ method: "POST", path: "/api/settings", body: {}, response: { ok: true }, runtime: "client" })), ["settings_changed"]);
    assert.doesNotMatch(JSON.stringify(JSON.parse(values.get(COMMUNITY_QUEUE_KEY)).filter((row) => row.type === "return_visit")), /"day"|lastSeen/);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("a feedback note keeps only its category, message, rating and six fixed context fields", async () => {
  const { normalizeFeedback, FEEDBACK_MESSAGE_LIMIT } = await import("../src/community/feedbackContract.js");
  assert.equal(normalizeFeedback(null), null);
  assert.equal(normalizeFeedback({ category: "rant", message: "hello" }), null);
  assert.equal(normalizeFeedback({ category: "bug", message: " \n\t " }), null);
  const normalized = normalizeFeedback({
    category: "confusing", message: `  Line one\r\nLine two\u0007  ${"x".repeat(3000)}`, rating: "5", email: "me@example.com",
    context: { screen: "rosterTab", season: 2031, week: 7, viewport: "tablet", theme: "light", build: "7becc57", teamName: "Secret", save: {}, token: "abc" }
  });
  assert.deepEqual(Object.keys(normalized).sort(), ["category", "context", "message", "rating"]);
  assert.equal(normalized.message.length, FEEDBACK_MESSAGE_LIMIT);
  assert.match(normalized.message, /^Line one\nLine two /);
  assert.equal(normalized.rating, 5);
  assert.deepEqual(normalized.context, { build: "7becc57", screen: "rosterTab", season: 2031, week: 7, viewport: "tablet", theme: "light" });
  assert.equal(normalizeFeedback({ category: "idea", message: "ok", rating: 0 }).rating, null);
  assert.deepEqual(normalizeFeedback({ category: "idea", message: "ok", context: { viewport: "1920x1080", season: "abc", week: 900 } }).context, {});
});

test("stack scrubbing keeps only this site's script paths and line numbers", async () => {
  const { scrubStack, buildDiagnosticReport, scrubDiagnosticMessage } = await import("../src/community/feedbackContract.js");
  const origin = "https://playfranchisearchitect.com";
  const stack = [
    "TypeError: Cannot read properties of undefined (reading 'name')",
    "    at renderRoster (https://playfranchisearchitect.com/lib/tabRoster.js?v=abc&token=secret:120:15)",
    "    at https://playfranchisearchitect.com/app.js#frag:44:9",
    "    at inject (chrome-extension://abcdefghijklmnop/content.js:1:1)",
    "    at track (https://cdn.tracker.example/t.js?id=42:9:9)",
    "    at https://evil.example/https://playfranchisearchitect.com/app.js:5:5",
    "    at https://playfranchisearchitect.com/game.html?save=private:12:3",
    "loadDashboard@https://playfranchisearchitect.com/lib/gameFlow.js:88:21",
    "    at <anonymous>"
  ].join("\n");
  assert.deepEqual(scrubStack(stack, origin), ["/lib/tabRoster.js:120:15", "/app.js:44:9", "/lib/gameFlow.js:88:21"]);
  assert.deepEqual(scrubStack(stack, "https://staging.playfranchisearchitect.com"), [], "another origin's frames are never kept");
  assert.deepEqual(scrubStack(stack, ""), []);
  assert.equal(scrubStack(Array.from({ length: 30 }, (_, i) => `at f (${origin}/app.js:${i + 1}:1)`).join("\n"), origin).length, 8);

  const report = buildDiagnosticReport(Object.assign(new TypeError(`Player "Avery Stone Jr" missing at ${origin}/app.js?token=abc, mail a@b.co ${"y".repeat(500)}`), { stack }), { origin, screen: "rosterTab", build: "7becc57" });
  assert.deepEqual(Object.keys(report).sort(), ["build", "message", "name", "screen", "stack"]);
  assert.equal(report.name, "TypeError");
  assert.ok(report.message.length <= 300);
  assert.doesNotMatch(JSON.stringify(report), /Avery|token|secret|tracker|evil|chrome-extension|a@b\.co|save=private/);
  assert.equal(scrubDiagnosticMessage("x is undefined (reading 'name')"), "x is undefined (reading '[text]')", "a single quoted word can be a surname used as a key");
});

test("an error report keeps message text only for the runtime's own error types", async () => {
  const { normalizeDiagnosticReport } = await import("../public/lib/communityFeedbackContract.js");
  const appWritten = normalizeDiagnosticReport({ name: "Error", message: "Player Marcus Bell not found", stack: [] });
  assert.equal(appWritten.message, "", "a message the game wrote can carry a name, so it is not sent");
  const runtime = normalizeDiagnosticReport({ name: "TypeError", message: "Cannot read properties of undefined (reading 'id')", stack: [] });
  assert.match(runtime.message, /Cannot read properties of undefined/);
});
