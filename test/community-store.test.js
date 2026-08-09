import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommunityStore, hashParticipant } from "../src/community/communityStore.js";

class FakePool {
  constructor() { this.rows = []; }

  async query(sql, params = []) {
    if (/CREATE SCHEMA/.test(sql)) return {};
    if (/^SELECT 1$/.test(sql.trim())) return { rows: [{}] };
    if (/SELECT count\(\*\)::int AS count FROM community_stats\.receipts WHERE participant_hash=\$1 AND received_at > now\(\) - interval '1 hour'/.test(sql)) {
      const [participantHash] = params;
      const cutoff = Date.now() - 60 * 60 * 1000;
      const count = this.rows.filter((r) => r.participant_hash === participantHash && r.received_at.getTime() > cutoff).length;
      return { rows: [{ count }] };
    }
    if (/DELETE FROM community_stats\.receipts WHERE participant_hash=\$1/.test(sql)) {
      const [participantHash] = params;
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.participant_hash !== participantHash);
      return { rowCount: before - this.rows.length };
    }
    if (/DELETE FROM community_stats\.receipts WHERE received_at < now\(\) - interval '(\d+) days'/.test(sql)) {
      const days = Number(sql.match(/interval '(\d+) days'/)[1]);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.received_at.getTime() >= cutoff);
      return { rowCount: before - this.rows.length };
    }
    if (/SELECT participant_hash,event_type AS type,occurred_at,received_at,dimensions,metrics FROM community_stats\.receipts/.test(sql)) {
      const [limit] = params;
      const sorted = [...this.rows].sort((a, b) => b.occurred_at - a.occurred_at);
      return { rows: sorted.slice(0, limit) };
    }
    throw new Error(`FakePool: unhandled query: ${sql}`);
  }

  async connect() {
    const pool = this;
    return {
      async query(sql, params = []) {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return {};
        if (/^INSERT INTO community_stats\.receipts/.test(sql)) {
          const [eventId, participantHash, eventType, occurredAt, dimensions, metrics, evidenceTier, schemaVersion] = params;
          if (pool.rows.some((r) => r.event_id === eventId)) return { rowCount: 0 };
          pool.rows.push({
            event_id: eventId, participant_hash: participantHash, event_type: eventType,
            occurred_at: new Date(occurredAt), received_at: new Date(), dimensions, metrics,
            evidence_tier: evidenceTier, schema_version: schemaVersion
          });
          return { rowCount: 1 };
        }
        throw new Error(`FakePool client: unhandled query: ${sql}`);
      },
      release() {}
    };
  }

  async end() {}
}

function makeStore({ pool = new FakePool(), clock } = {}) {
  const keyPath = path.join(os.tmpdir(), `fa-community-store-test-${Math.random().toString(36).slice(2)}`, "pepper");
  return new CommunityStore({ pool, keyPath, ...(clock ? { clock } : {}) });
}

function event(id, overrides = {}) {
  return {
    eventId: id, type: "rare_feat", occurredAt: new Date().toISOString(),
    dimensions: { feat: "championship" }, metrics: { count: 1 },
    evidenceTier: "browser-receipt", schemaVersion: "1.0", ...overrides
  };
}

test("constructor accepts an injected pool and skips creating a real one", () => {
  const pool = new FakePool();
  const store = new CommunityStore({ pool, keyPath: path.join(os.tmpdir(), "unused-pepper") });
  assert.equal(store.pool, pool);
});

test("constructor still requires databaseUrl when no pool is injected", () => {
  assert.throws(() => new CommunityStore({}), /DATABASE_URL is required/);
});

test("ingest accepts new events and reports duplicates via ON CONFLICT", async () => {
  const store = makeStore();
  const first = await store.ingest("player-1", [event("evt-1"), event("evt-2")]);
  assert.deepEqual(first, { accepted: 2, duplicates: 0 });
  const second = await store.ingest("player-1", [event("evt-1"), event("evt-3")]);
  assert.deepEqual(second, { accepted: 1, duplicates: 1 });
});

test("ingest rejects with 429 once the 1-hour participant limit is exceeded", async () => {
  const store = makeStore();
  const events = Array.from({ length: 480 }, (_, i) => event(`evt-bulk-${i}`));
  await store.ingest("player-heavy", events);
  await assert.rejects(
    () => store.ingest("player-heavy", [event("evt-over-limit")]),
    (error) => { assert.equal(error.status, 429); return true; }
  );
});

test("snapshot reuses the cache within the 60s TTL and bypasses it with force", async () => {
  let now = new Date("2026-08-09T00:00:00.000Z");
  const store = makeStore({ clock: () => now });
  await store.ingest("player-1", [event("evt-1")]);
  const first = await store.snapshot();
  now = new Date(now.getTime() + 30_000);
  const cached = await store.snapshot();
  assert.equal(cached, first, "within TTL, snapshot() must return the same cached object");
  const forced = await store.snapshot({ force: true });
  assert.notEqual(forced, first, "force:true must bypass the cache and recompute");
  now = new Date(now.getTime() + 61_000);
  const afterTtl = await store.snapshot();
  assert.notEqual(afterTtl, forced, "after TTL expiry, snapshot() must recompute");
});

test("snapshot only reports status=partial when the row count exceeds MAX_SNAPSHOT_ROWS", async () => {
  const pool = new FakePool();
  const store = makeStore({ pool });
  await store.initialize();
  for (let i = 0; i < 5; i += 1) {
    pool.rows.push({
      event_id: `evt-${i}`, participant_hash: "hash", event_type: "rare_feat",
      occurred_at: new Date(), received_at: new Date(), dimensions: {}, metrics: {},
      evidence_tier: "browser-receipt", schema_version: "1.0"
    });
  }
  const snapshot = await store.snapshot({ force: true });
  assert.notEqual(snapshot.status, "partial", "5 rows must not trigger the truncation status");
});

test("deleteParticipant removes only that participant's rows and invalidates cache", async () => {
  const store = makeStore();
  await store.ingest("player-a", [event("evt-a1")]);
  await store.ingest("player-b", [event("evt-b1")]);
  await store.snapshot();
  const result = await store.deleteParticipant("player-a");
  assert.equal(result.deleted, 1);
  assert.equal(store.cacheAt, 0);
});

test("cleanupIfDue only runs the retention sweep once per 6-hour window", async () => {
  let now = new Date("2026-08-09T00:00:00.000Z");
  const pool = new FakePool();
  const store = makeStore({ pool, clock: () => now });
  await store.ingest("player-1", [event("evt-1")]);
  assert.equal(pool.rows.length, 1);
  now = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  await store.cleanupIfDue();
  now = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  await store.cleanupIfDue();
  assert.equal(store.lastCleanupAt, now.getTime());
});

test("hashParticipant is deterministic for a given pepper and participant", () => {
  const a = hashParticipant("player-1", "pepper-value");
  const b = hashParticipant("player-1", "pepper-value");
  const c = hashParticipant("player-2", "pepper-value");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test("initialize writes a new pepper file on first run and reuses it on the next", async () => {
  const keyPath = path.join(os.tmpdir(), `fa-community-store-pepper-${Math.random().toString(36).slice(2)}`, "pepper");
  const store = new CommunityStore({ pool: new FakePool(), keyPath });
  await store.initialize();
  assert.ok(store.pepper && store.pepper.length > 0);
  const written = (await fs.readFile(keyPath, "utf8")).trim();
  assert.equal(written, store.pepper);

  const second = new CommunityStore({ pool: new FakePool(), keyPath });
  await second.initialize();
  assert.equal(second.pepper, store.pepper, "a second store pointed at the same keyPath must reuse the existing pepper");
});

test("health reports ok after initialize succeeds", async () => {
  const store = makeStore();
  const health = await store.health();
  assert.equal(health.ok, true);
  assert.equal(health.database, "ready");
  assert.equal(health.schemaVersion, 1);
});
