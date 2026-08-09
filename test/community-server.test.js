import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createCommunityStatsHandler, createMemoryRateLimiter } from "../src/community/server.js";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";

async function withServer(store, run, options = {}) {
  const server = http.createServer(createCommunityStatsHandler({ store, origins: new Set(["https://playfranchisearchitect.com"]), ...options }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

function validEvent(id = "valid_event_1234") {
  return { schemaVersion: "1.0", eventId: id, type: "rare_feat", occurredAt: new Date().toISOString(), dimensions: { feat: "championship" }, metrics: { count: 1 }, evidenceTier: "browser-receipt" };
}

test("snapshot uses public cache validators and CORS only for allowed origins", async () => {
  const snapshot = aggregateCommunitySnapshot([], { now: "2026-08-08T12:00:00.000Z" });
  const store = { snapshot: async () => snapshot, health: async () => ({ ok: true }), cache: null };
  await withServer(store, async (origin) => {
    const response = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://playfranchisearchitect.com");
    assert.match(response.headers.get("cache-control"), /stale-while-revalidate/);
    const tag = response.headers.get("etag");
    const cached = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://playfranchisearchitect.com", "If-None-Match": tag } });
    assert.equal(cached.status, 304);
    const edgeCached = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://playfranchisearchitect.com", "If-None-Match": `W/${tag}` } });
    assert.equal(edgeCached.status, 304, "edge proxies may weaken a strong origin ETag");
    const denied = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://attacker.example" } });
    assert.equal(denied.status, 403);
  });
});

test("ingest validates batches, returns dedupe receipts and never passes unknown fields", async () => {
  let received = null;
  const store = { ingest: async (id, events) => { received = { id, events }; return { accepted: 1, duplicates: 0 }; }, health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const response = await fetch(`${origin}/community/v1/events`, { method: "POST", headers: { Origin: "https://playfranchisearchitect.com", "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234", events: [{ ...validEvent(), dimensions: { feat: "championship", playerName: "Secret" } }] }) });
    assert.equal(response.status, 202);
    assert.equal(received.id, "browser_identifier_1234");
    assert.deepEqual(received.events[0].dimensions, { feat: "championship" });
    const invalid = await fetch(`${origin}/community/v1/events`, { method: "POST", headers: { Origin: "https://playfranchisearchitect.com", "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234", events: [{ ...validEvent("bad") }] }) });
    assert.equal(invalid.status, 400);
  });
});

test("snapshot falls back to the last cached aggregate as stale when the store rejects", async () => {
  const cached = aggregateCommunitySnapshot([], { now: "2026-08-08T12:00:00.000Z" });
  const store = { snapshot: async () => { throw new Error("db unreachable"); }, health: async () => ({ ok: true }), cache: cached };
  await withServer(store, async (origin) => {
    const response = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "stale");
    assert.match(body.degradation, /last computed aggregate/);
  });
});

test("snapshot reports unavailable with 503 when the store rejects and no cache exists", async () => {
  const store = { snapshot: async () => { throw new Error("db unreachable"); }, health: async () => ({ ok: true }), cache: null };
  await withServer(store, async (origin) => {
    const response = await fetch(`${origin}/community/v1/snapshot`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.match(body.degradation, /temporarily unavailable/);
  });
});

test("ingest rejects an oversized body with 413 and malformed JSON with 400", async () => {
  const store = { ingest: async () => ({ accepted: 0, duplicates: 0 }), health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const oversized = "x".repeat(33 * 1024);
    const tooBig = await fetch(`${origin}/community/v1/events`, { method: "POST", headers: { Origin: "https://playfranchisearchitect.com", "Content-Type": "application/json" }, body: oversized });
    assert.equal(tooBig.status, 413);
    const malformed = await fetch(`${origin}/community/v1/events`, { method: "POST", headers: { Origin: "https://playfranchisearchitect.com", "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(malformed.status, 400);
  });
});

test("health endpoint reports store health and unmatched routes return 404", async () => {
  const store = { health: async () => ({ ok: true, latencyMs: 3 }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const health = await fetch(`${origin}/health`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.service, "franchise-architect-community-stats");
    const versioned = await fetch(`${origin}/community/v1/health`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(versioned.status, 200);
    const notFound = await fetch(`${origin}/community/v1/unknown-route`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(notFound.status, 404);
  });
});

test("withdrawal deletes the participant aggregate and IP limiter stores only ephemeral counts", async () => {
  let deleted = null;
  const store = { deleteParticipant: async (id) => { deleted = id; return { deleted: 7 }; }, health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const response = await fetch(`${origin}/community/v1/participation`, { method: "DELETE", headers: { Origin: "https://playfranchisearchitect.com", "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234" }) });
    assert.equal(response.status, 200);
    assert.equal(deleted, "browser_identifier_1234");
    assert.equal((await response.json()).deleted, 7);
  });
  let clock = 0;
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 100, clock: () => clock });
  assert.equal(limiter("ip").ok, true); assert.equal(limiter("ip").ok, true); assert.equal(limiter("ip").ok, false);
  clock = 101; assert.equal(limiter("ip").ok, true);
});
