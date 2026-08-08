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
