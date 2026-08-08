import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_RAW_RETENTION_DAYS } from "./eventContract.js";

const { Pool } = pg;
const MAX_SNAPSHOT_ROWS = 500_000;

async function loadPepper(filePath) {
  try { return (await fs.readFile(filePath, "utf8")).trim(); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const pepper = randomBytes(32).toString("hex");
    await fs.writeFile(filePath, `${pepper}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }).catch(async (writeError) => {
      if (writeError.code !== "EEXIST") throw writeError;
    });
    return (await fs.readFile(filePath, "utf8")).trim();
  }
}

export function hashParticipant(participantId, pepper) {
  return createHash("sha256").update(`fa-community-v1:${pepper}:${participantId}`).digest("hex");
}

export class CommunityStore {
  constructor({ databaseUrl, keyPath = path.resolve("data/community-stats/pepper"), clock = () => new Date() } = {}) {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for Community Stats.");
    this.pool = new Pool({ connectionString: databaseUrl, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    this.keyPath = keyPath;
    this.clock = clock;
    this.pepper = null;
    this.cache = null;
    this.cacheAt = 0;
    this.ready = null;
    this.lastCleanupAt = 0;
  }

  async initialize() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.pepper = await loadPepper(this.keyPath);
      await this.pool.query(`
        CREATE SCHEMA IF NOT EXISTS community_stats;
        CREATE TABLE IF NOT EXISTS community_stats.receipts (
          event_id varchar(96) PRIMARY KEY,
          participant_hash char(64) NOT NULL,
          event_type varchar(32) NOT NULL,
          occurred_at timestamptz NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now(),
          dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
          metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
          evidence_tier varchar(24) NOT NULL,
          schema_version varchar(12) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS community_receipts_occurred_idx ON community_stats.receipts (occurred_at DESC);
        CREATE INDEX IF NOT EXISTS community_receipts_participant_idx ON community_stats.receipts (participant_hash, received_at DESC);
        CREATE TABLE IF NOT EXISTS community_stats.schema_migrations (
          version integer PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO community_stats.schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
      `);
      return true;
    })().catch((error) => { this.ready = null; throw error; });
    return this.ready;
  }

  digest(participantId) { return hashParticipant(participantId, this.pepper); }

  async ingest(participantId, events) {
    await this.initialize();
    const participantHash = this.digest(participantId);
    const recent = await this.pool.query("SELECT count(*)::int AS count FROM community_stats.receipts WHERE participant_hash=$1 AND received_at > now() - interval '1 hour'", [participantHash]);
    if (Number(recent.rows[0]?.count || 0) + events.length > 480) {
      const error = new Error("Participant contribution limit reached; try again later."); error.status = 429; throw error;
    }
    const client = await this.pool.connect();
    let accepted = 0;
    let duplicates = 0;
    try {
      await client.query("BEGIN");
      for (const row of events) {
        const result = await client.query(
          "INSERT INTO community_stats.receipts(event_id,participant_hash,event_type,occurred_at,dimensions,metrics,evidence_tier,schema_version) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) ON CONFLICT (event_id) DO NOTHING",
          [row.eventId, participantHash, row.type, row.occurredAt, JSON.stringify(row.dimensions), JSON.stringify(row.metrics), row.evidenceTier, row.schemaVersion]
        );
        if (result.rowCount) accepted += 1; else duplicates += 1;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
    if (accepted) this.cacheAt = 0;
    await this.cleanupIfDue();
    return { accepted, duplicates };
  }

  async deleteParticipant(participantId) {
    await this.initialize();
    const result = await this.pool.query("DELETE FROM community_stats.receipts WHERE participant_hash=$1", [this.digest(participantId)]);
    this.cacheAt = 0;
    return { deleted: result.rowCount || 0 };
  }

  async cleanupIfDue() {
    const now = this.clock().getTime();
    if (now - this.lastCleanupAt < 6 * 60 * 60 * 1000) return;
    await this.pool.query(`DELETE FROM community_stats.receipts WHERE received_at < now() - interval '${COMMUNITY_RAW_RETENTION_DAYS} days'`);
    this.lastCleanupAt = now;
  }

  async snapshot({ force = false } = {}) {
    await this.initialize();
    const now = this.clock();
    if (!force && this.cache && now.getTime() - this.cacheAt < 60_000) return this.cache;
    const result = await this.pool.query(
      "SELECT participant_hash,event_type AS type,occurred_at,received_at,dimensions,metrics FROM community_stats.receipts WHERE occurred_at >= now() - interval '30 days' ORDER BY occurred_at DESC LIMIT $1",
      [MAX_SNAPSHOT_ROWS + 1]
    );
    const truncated = result.rows.length > MAX_SNAPSHOT_ROWS;
    this.cache = aggregateCommunitySnapshot(result.rows.slice(0, MAX_SNAPSHOT_ROWS), { now: now.toISOString(), truncated });
    this.cacheAt = now.getTime();
    return this.cache;
  }

  async health() {
    const started = this.clock().getTime();
    await this.initialize();
    await this.pool.query("SELECT 1");
    return { ok: true, database: "ready", latencyMs: Math.max(0, this.clock().getTime() - started), schemaVersion: 1 };
  }

  async close() { await this.pool.end(); }
}
