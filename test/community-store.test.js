import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommunityStore, hashParticipant } from "../src/community/communityStore.js";

class FakePool {
  constructor() { this.rows = []; this.feedback = []; this.diagnostics = []; this.schemaSql = ""; }

  async query(sql, params = []) {
    if (/CREATE SCHEMA/.test(sql)) { this.schemaSql = sql; return {}; }
    if (/SELECT count\(\*\)::int AS count FROM community_stats\.feedback WHERE received_at > now\(\) - interval '1 day'/.test(sql)) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return { rows: [{ count: this.feedback.filter((r) => r.received_at.getTime() > cutoff).length }] };
    }
    if (/^INSERT INTO community_stats\.feedback\(category,message,rating,context\)/.test(sql)) {
      const [category, message, rating, context] = params;
      this.feedback.push({ category, message, rating, context: JSON.parse(context), received_at: new Date() });
      return { rowCount: 1 };
    }
    if (/SELECT count\(\*\)::int AS count FROM community_stats\.diagnostics WHERE participant_hash=\$1 AND report_day=\$2/.test(sql)) {
      const [participantHash, day] = params;
      return { rows: [{ count: this.diagnostics.filter((r) => r.participant_hash === participantHash && r.report_day === day).length }] };
    }
    if (/^INSERT INTO community_stats\.diagnostics\(.*ON CONFLICT \(participant_hash,report_day,signature\) DO NOTHING/.test(sql)) {
      const [participantHash, day, signature, name, message, stack, screen, build] = params;
      if (this.diagnostics.some((r) => r.participant_hash === participantHash && r.report_day === day && r.signature === signature)) return { rowCount: 0 };
      this.diagnostics.push({ participant_hash: participantHash, report_day: day, signature, error_name: name, message, stack: JSON.parse(stack), screen, build, received_at: new Date() });
      return { rowCount: 1 };
    }
    if (/DELETE FROM community_stats\.diagnostics WHERE participant_hash=\$1/.test(sql)) {
      const [participantHash] = params;
      const before = this.diagnostics.length;
      this.diagnostics = this.diagnostics.filter((r) => r.participant_hash !== participantHash);
      return { rowCount: before - this.diagnostics.length };
    }
    const sweep = /DELETE FROM community_stats\.(feedback|diagnostics) WHERE received_at < now\(\) - \(\$1::int \* interval '1 day'\)/.exec(sql);
    if (sweep) {
      const [days] = params;
      assert.ok(Number.isInteger(days) && days > 0, "retention days must be bound as a positive integer");
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const before = this[sweep[1]].length;
      this[sweep[1]] = this[sweep[1]].filter((r) => r.received_at.getTime() >= cutoff);
      return { rowCount: before - this[sweep[1]].length };
    }
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
    if (/DELETE FROM community_stats\.receipts WHERE received_at < now\(\) - \(\$1::int \* interval '1 day'\)/.test(sql)) {
      // S113: retention days are a bound parameter, never interpolated SQL.
      const [days] = params;
      assert.ok(Number.isInteger(days) && days > 0, "retention days must be bound as a positive integer");
      this.retentionSweeps = (this.retentionSweeps || 0) + 1;
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
  assert.equal(pool.retentionSweeps, 2, "the parameterized retention sweep must actually execute");
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
  assert.equal(health.schemaVersion, 2);
});

test("schema setup only ever adds: the new tables are created if missing and nothing existing is altered or dropped", async () => {
  const pool = new FakePool();
  await makeStore({ pool }).initialize();
  assert.match(pool.schemaSql, /CREATE TABLE IF NOT EXISTS community_stats\.receipts/);
  assert.match(pool.schemaSql, /CREATE TABLE IF NOT EXISTS community_stats\.feedback/);
  assert.match(pool.schemaSql, /CREATE TABLE IF NOT EXISTS community_stats\.diagnostics/);
  assert.match(pool.schemaSql, /schema_migrations\(version\) VALUES \(2\) ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(pool.schemaSql, /\b(DROP|ALTER|TRUNCATE)\b/i);
  for (const statement of pool.schemaSql.split(";").map((part) => part.replace(/--.*$/gm, "").trim()).filter((part) => /^CREATE/.test(part))) {
    assert.match(statement, /^CREATE (SCHEMA|TABLE|INDEX) IF NOT EXISTS /, `must be safe to repeat on a live database: ${statement.slice(0, 60)}`);
  }
});

test("a feedback note is stored with its fixed context and nothing that identifies the sender", async () => {
  const pool = new FakePool();
  const store = makeStore({ pool });
  const result = await store.saveFeedback({ category: "idea", message: "More trade logic please.", rating: 4, context: { screen: "overviewTab", season: 2027, week: 3 } });
  assert.deepEqual(result, { accepted: 1 });
  assert.equal(pool.feedback.length, 1);
  assert.deepEqual(Object.keys(pool.feedback[0]).sort(), ["category", "context", "message", "rating", "received_at"]);
  assert.deepEqual(pool.feedback[0].context, { screen: "overviewTab", season: 2027, week: 3 });
});

test("the feedback inbox refuses new notes once the daily ceiling is reached", async () => {
  const pool = new FakePool();
  const store = makeStore({ pool });
  pool.feedback = Array.from({ length: 2000 }, () => ({ category: "bug", message: "x", rating: null, context: {}, received_at: new Date() }));
  await assert.rejects(
    () => store.saveFeedback({ category: "bug", message: "one too many", rating: null, context: {} }),
    (error) => { assert.equal(error.status, 429); return true; }
  );
  assert.equal(pool.feedback.length, 2000);
});

test("error reports are counted once per browser, per day, per error name and top frame", async () => {
  let now = new Date("2026-08-09T10:00:00.000Z");
  const pool = new FakePool();
  const store = makeStore({ pool, clock: () => now });
  const report = (overrides = {}) => ({ name: "TypeError", message: "x is undefined", stack: ["/app.js:10:5", "/lib/gameFlow.js:20:1"], screen: "overviewTab", ...overrides });
  assert.deepEqual(await store.saveDiagnostics("player-1", [report(), report({ message: "same place, different words" })]), { accepted: 1, duplicates: 1 });
  assert.deepEqual(await store.saveDiagnostics("player-1", [report()]), { accepted: 0, duplicates: 1 });
  assert.deepEqual(await store.saveDiagnostics("player-1", [report({ stack: ["/app.js:11:5"] }), report({ name: "RangeError" })]), { accepted: 2, duplicates: 0 }, "a different top frame or error name is a different error");
  assert.deepEqual(await store.saveDiagnostics("player-2", [report()]), { accepted: 1, duplicates: 0 }, "another browser is counted separately");
  now = new Date("2026-08-10T10:00:00.000Z");
  assert.deepEqual(await store.saveDiagnostics("player-1", [report()]), { accepted: 1, duplicates: 0 }, "a new day is counted again");
  assert.equal(pool.diagnostics.length, 5);
  assert.ok(pool.diagnostics.every((row) => /^[0-9a-f]{64}$/.test(row.participant_hash) && /^[0-9a-f]{64}$/.test(row.signature)));
  assert.doesNotMatch(JSON.stringify(pool.diagnostics), /player-1|player-2/);
});

test("one browser cannot store more than its daily allowance of error reports", async () => {
  const pool = new FakePool();
  const store = makeStore({ pool });
  const many = (offset) => Array.from({ length: 10 }, (_, index) => ({ name: "Error", message: "boom", stack: [`/app.js:${offset + index}:1`] }));
  for (let batch = 0; batch < 4; batch += 1) assert.equal((await store.saveDiagnostics("player-loop", many(batch * 10))).accepted, 10);
  assert.deepEqual(await store.saveDiagnostics("player-loop", many(400)), { accepted: 0, duplicates: 0 });
  assert.equal(pool.diagnostics.length, 40);
});

test("turning sharing off deletes that browser's error reports along with its game stats", async () => {
  const pool = new FakePool();
  const store = makeStore({ pool });
  await store.ingest("player-a", [event("evt-a1")]);
  await store.saveDiagnostics("player-a", [{ name: "Error", message: "boom", stack: ["/app.js:1:1"] }]);
  await store.saveDiagnostics("player-b", [{ name: "Error", message: "boom", stack: ["/app.js:1:1"] }]);
  assert.deepEqual(await store.deleteParticipant("player-a"), { deleted: 2 });
  assert.equal(pool.diagnostics.length, 1);
});

test("feedback notes and error reports expire with the same 30-day sweep as game stats", async () => {
  let now = new Date();
  const pool = new FakePool();
  const store = makeStore({ pool, clock: () => now });
  await store.saveFeedback({ category: "praise", message: "old note", rating: null, context: {} });
  await store.saveDiagnostics("player-1", [{ name: "Error", message: "old", stack: ["/app.js:1:1"] }]);
  const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  pool.feedback[0].received_at = longAgo;
  pool.diagnostics[0].received_at = longAgo;
  await store.saveFeedback({ category: "praise", message: "fresh note", rating: null, context: {} });
  now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  await store.cleanupIfDue();
  assert.deepEqual(pool.feedback.map((row) => row.message), ["fresh note"]);
  assert.equal(pool.diagnostics.length, 0);
});
