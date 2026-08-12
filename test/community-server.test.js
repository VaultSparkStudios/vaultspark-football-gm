import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  createCommunityStatsHandler,
  createMemoryRateLimiter,
  createParticipationCapabilityAuthority,
  createPrivacySafeAddressKey,
  runtimeSourceRevision
} from "../src/community/server.js";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";

const ALLOWED_ORIGIN = "https://playfranchisearchitect.com";

async function withServer(store, run, options = {}) {
  const server = http.createServer(createCommunityStatsHandler({ store, origins: new Set([ALLOWED_ORIGIN]), ...options }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

function validEvent(id = "valid_event_1234") {
  return { schemaVersion: "1.0", eventId: id, type: "rare_feat", occurredAt: new Date().toISOString(), dimensions: { feat: "championship" }, metrics: { count: 1 }, evidenceTier: "browser-receipt" };
}

async function issueCapability(origin, participantId, headers = {}) {
  const response = await fetch(`${origin}/community/v1/capability`, {
    method: "POST",
    headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ schemaVersion: "1.0", participantId })
  });
  const body = await response.json();
  return { response, body };
}

async function postEvents(origin, participantId, capability, events, headers = {}) {
  return fetch(`${origin}/community/v1/events`, {
    method: "POST",
    headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ schemaVersion: "1.0", participantId, capability, events })
  });
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
    const { body: lease } = await issueCapability(origin, "browser_identifier_1234");
    const response = await postEvents(origin, "browser_identifier_1234", lease.capability, [{ ...validEvent(), dimensions: { feat: "championship", playerName: "Secret" } }]);
    assert.equal(response.status, 202);
    assert.equal(received.id, "browser_identifier_1234");
    assert.deepEqual(received.events[0].dimensions, { feat: "championship" });
    const invalid = await postEvents(origin, "browser_identifier_1234", lease.capability, [{ ...validEvent("bad") }]);
    assert.equal(invalid.status, 400);
  });
});

test("mutation routes reject missing origins and require a participant-bound capability", async () => {
  let ingests = 0;
  const store = {
    ingest: async () => { ingests += 1; return { accepted: 1, duplicates: 0 }; },
    deleteParticipant: async () => ({ deleted: 0 }),
    health: async () => ({ ok: true }),
    snapshot: async () => aggregateCommunitySnapshot([]),
    cache: null
  };
  await withServer(store, async (origin) => {
    const noOriginIssue = await fetch(`${origin}/community/v1/capability`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234" })
    });
    assert.equal(noOriginIssue.status, 403);

    const { body: lease } = await issueCapability(origin, "browser_identifier_1234");
    const noCapabilityIngest = await postEvents(origin, "browser_identifier_1234", "", [validEvent("valid_event_no_cap_1")]);
    assert.equal(noCapabilityIngest.status, 401);
    const missingOriginIngest = await fetch(`${origin}/community/v1/events`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234", capability: lease.capability, events: [validEvent()] })
    });
    assert.equal(missingOriginIngest.status, 403);

    const wrongParticipant = await postEvents(origin, "different_browser_identifier", lease.capability, [validEvent("valid_event_bound_1")]);
    assert.equal(wrongParticipant.status, 401);
    assert.equal(ingests, 0);

    const missingOriginWithdrawal = await fetch(`${origin}/community/v1/participation`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234", capability: lease.capability })
    });
    assert.equal(missingOriginWithdrawal.status, 403);
    const noCapabilityWithdrawal = await fetch(`${origin}/community/v1/participation`, {
      method: "DELETE", headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234" })
    });
    assert.equal(noCapabilityWithdrawal.status, 401);
  });
});

test("public ingress always stores browser-receipt evidence even when a client claims server-runtime", async () => {
  let received = null;
  const store = {
    ingest: async (_id, events) => { received = events; return { accepted: 1, duplicates: 0 }; },
    health: async () => ({ ok: true }),
    snapshot: async () => aggregateCommunitySnapshot([]),
    cache: null
  };
  await withServer(store, async (origin) => {
    const { body: lease } = await issueCapability(origin, "browser_identifier_spoof");
    const response = await postEvents(origin, "browser_identifier_spoof", lease.capability, [
      { ...validEvent("valid_event_spoof_1"), evidenceTier: "server-runtime" }
    ]);
    assert.equal(response.status, 202);
    assert.equal(received[0].evidenceTier, "browser-receipt");
  });
});

test("capabilities expire, enforce their use ceiling, and fail closed after process-key rotation", async () => {
  let now = Date.now();
  const store = {
    ingest: async () => ({ accepted: 1, duplicates: 0 }),
    health: async () => ({ ok: true }),
    snapshot: async () => aggregateCommunitySnapshot([]),
    cache: null
  };
  const capabilities = createParticipationCapabilityAuthority({
    signingKey: Buffer.alloc(32, 7), clock: () => now, ttlMs: 100, useLimit: 1
  });
  await withServer(store, async (origin) => {
    const participant = "browser_identifier_ceiling";
    const { body: first } = await issueCapability(origin, participant);
    assert.equal((await postEvents(origin, participant, first.capability, [validEvent("valid_event_ceiling_1")])).status, 202);
    assert.equal((await postEvents(origin, participant, first.capability, [validEvent("valid_event_ceiling_2")])).status, 401);

    const { body: expiring } = await issueCapability(origin, participant);
    now += 101;
    assert.equal((await postEvents(origin, participant, expiring.capability, [validEvent("valid_event_expired_1")])).status, 401);

    const foreignProcess = createParticipationCapabilityAuthority({ signingKey: Buffer.alloc(32, 8) });
    const foreign = foreignProcess.issue(participant);
    assert.equal((await postEvents(origin, participant, foreign.capability, [validEvent("valid_event_foreign_1")])).status, 401);
  }, { capabilities });
});

test("one network address cannot rotate enough participant IDs to manufacture a public k=5 cohort", async () => {
  const store = { health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const statuses = [];
    for (let index = 0; index < 5; index += 1) {
      const { response } = await issueCapability(origin, `rotating_browser_id_${index}`, { "X-Forwarded-For": "203.0.113.10" });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 429]);
    const repeat = await issueCapability(origin, "rotating_browser_id_0", { "X-Forwarded-For": "203.0.113.10" });
    assert.equal(repeat.response.status, 201, "the same anonymous browser may renew without consuming another cohort slot");
    const differentAddress = await issueCapability(origin, "rotating_browser_id_4", { "X-Forwarded-For": "203.0.113.11" });
    assert.equal(differentAddress.response.status, 201);
  });
});

test("address rate keys honor X-Forwarded-For only from a loopback proxy and reveal no raw address", () => {
  const keyFor = createPrivacySafeAddressKey("deterministic-test-key");
  const directA = keyFor({ headers: { "x-forwarded-for": "198.51.100.1" }, socket: { remoteAddress: "203.0.113.50" } });
  const directB = keyFor({ headers: { "x-forwarded-for": "198.51.100.2" }, socket: { remoteAddress: "203.0.113.50" } });
  assert.equal(directA, directB, "an untrusted direct peer cannot rotate X-Forwarded-For");
  const proxiedA = keyFor({ headers: { "x-forwarded-for": "198.51.100.1" }, socket: { remoteAddress: "::ffff:127.0.0.1" } });
  const proxiedB = keyFor({ headers: { "x-forwarded-for": "198.51.100.2" }, socket: { remoteAddress: "127.0.0.1" } });
  assert.notEqual(proxiedA, proxiedB);
  assert.doesNotMatch(`${directA}${proxiedA}${proxiedB}`, /198\.51\.100|203\.0\.113/);
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
    assert.equal(healthBody.sourceRevision, runtimeSourceRevision());
    assert.equal(health.headers.get("cache-control"), "no-store");
    const versioned = await fetch(`${origin}/community/v1/health`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(versioned.status, 200);
    const notFound = await fetch(`${origin}/community/v1/unknown-route`, { headers: { Origin: "https://playfranchisearchitect.com" } });
    assert.equal(notFound.status, 404);
  });
});

test("runtime source revisions are bounded to public-safe immutable tokens", () => {
  assert.equal(runtimeSourceRevision("7becc57385515042dee5d80146c635d45962ea40"), "7becc57385515042dee5d80146c635d45962ea40");
  assert.equal(runtimeSourceRevision("bad revision with spaces"), "local-worktree");
  assert.equal(runtimeSourceRevision("x".repeat(65)), "local-worktree");
});

test("withdrawal deletes the participant aggregate and IP limiter stores only ephemeral counts", async () => {
  let deleted = null;
  const store = { deleteParticipant: async (id) => { deleted = id; return { deleted: 7 }; }, health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null };
  await withServer(store, async (origin) => {
    const { body: lease } = await issueCapability(origin, "browser_identifier_1234");
    const response = await fetch(`${origin}/community/v1/participation`, { method: "DELETE", headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: "1.0", participantId: "browser_identifier_1234", capability: lease.capability }) });
    assert.equal(response.status, 200);
    assert.equal(deleted, "browser_identifier_1234");
    assert.equal((await response.json()).deleted, 7);
  });
  let clock = 0;
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 100, clock: () => clock });
  assert.equal(limiter("ip").ok, true); assert.equal(limiter("ip").ok, true); assert.equal(limiter("ip").ok, false);
  clock = 101; assert.equal(limiter("ip").ok, true);
});
