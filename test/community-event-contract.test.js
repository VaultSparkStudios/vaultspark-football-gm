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
    assert.equal(flushed.sent, 1);
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
});
