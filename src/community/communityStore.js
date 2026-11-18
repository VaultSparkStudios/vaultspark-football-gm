import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_RAW_RETENTION_DAYS } from "./eventContract.js";
import { diagnosticSignatureSource } from "./feedbackContract.js";

const { Pool } = pg;
const MAX_SNAPSHOT_ROWS = 500_000;
const FEEDBACK_DAILY_CEILING = 2000;
const DIAGNOSTICS_DAILY_PER_PARTICIPANT = 40;

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
  constructor({ databaseUrl, keyPath = path.resolve("data/community-stats/pepper"), clock = () => new Date(), pool = null } = {}) {
    if (!pool && !databaseUrl) throw new Error("DATABASE_URL is required for Community Stats.");
    this.pool = pool || new Pool({ connectionString: databaseUrl, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
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
        -- Version 2: feedback notes and error reports. Every statement is
        -- IF NOT EXISTS / ON CONFLICT, so this is safe to run on each start
        -- against a database that already holds version 1.
        CREATE TABLE IF NOT EXISTS community_stats.feedback (
          feedback_id bigserial PRIMARY KEY,
          received_at timestamptz NOT NULL DEFAULT now(),
          category varchar(16) NOT NULL,
          message text NOT NULL,
          rating smallint,
          context jsonb NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS community_feedback_received_idx ON community_stats.feedback (received_at DESC);
        CREATE TABLE IF NOT EXISTS community_stats.diagnostics (
          participant_hash char(64) NOT NULL,
          report_day date NOT NULL,
          signature char(64) NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now(),
          error_name varchar(64) NOT NULL,
          message varchar(300) NOT NULL,
          stack jsonb NOT NULL DEFAULT '[]'::jsonb,
          screen varchar(48),
          build varchar(64),
          PRIMARY KEY (participant_hash, report_day, signature)
        );
        CREATE INDEX IF NOT EXISTS community_diagnostics_received_idx ON community_stats.diagnostics (received_at DESC);
        INSERT INTO community_stats.schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
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
    const participantHash = this.digest(participantId);
    const result = await this.pool.query("DELETE FROM community_stats.receipts WHERE participant_hash=$1", [participantHash]);
    // Error reports are tied to the same anonymous code, so they go too.
    const reports = await this.pool.query("DELETE FROM community_stats.diagnostics WHERE participant_hash=$1", [participantHash]);
    this.cacheAt = 0;
    return { deleted: (result.rowCount || 0) + (reports.rowCount || 0) };
  }

  /**
   * Stores one feedback note. Nothing identifies the sender: there is no
   * browser code and no address on the row. The daily ceiling is a disk
   * backstop behind the per-address limit in the request handler.
   */
  async saveFeedback(feedback) {
    await this.initialize();
    const recent = await this.pool.query("SELECT count(*)::int AS count FROM community_stats.feedback WHERE received_at > now() - interval '1 day'");
    if (Number(recent.rows[0]?.count || 0) >= FEEDBACK_DAILY_CEILING) {
      const error = new Error("The feedback inbox is full for today; please use email instead."); error.status = 429; throw error;
    }
    await this.pool.query(
      "INSERT INTO community_stats.feedback(category,message,rating,context) VALUES($1,$2,$3,$4::jsonb)",
      [feedback.category, feedback.message, feedback.rating ?? null, JSON.stringify(feedback.context || {})]
    );
    await this.cleanupIfDue();
    return { accepted: 1 };
  }

  /**
   * Stores error reports once per browser code, per day, per signature
   * (error name plus the top stack frame), so a crash loop is one row.
   */
  async saveDiagnostics(participantId, reports) {
    await this.initialize();
    const participantHash = this.digest(participantId);
    const day = this.clock().toISOString().slice(0, 10);
    const today = await this.pool.query("SELECT count(*)::int AS count FROM community_stats.diagnostics WHERE participant_hash=$1 AND report_day=$2", [participantHash, day]);
    let room = DIAGNOSTICS_DAILY_PER_PARTICIPANT - Number(today.rows[0]?.count || 0);
    let accepted = 0;
    let duplicates = 0;
    for (const report of reports) {
      if (room <= 0) break;
      const signature = createHash("sha256").update(diagnosticSignatureSource(report)).digest("hex");
      const result = await this.pool.query(
        "INSERT INTO community_stats.diagnostics(participant_hash,report_day,signature,error_name,message,stack,screen,build) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (participant_hash,report_day,signature) DO NOTHING",
        [participantHash, day, signature, report.name, report.message, JSON.stringify(report.stack), report.screen ?? null, report.build ?? null]
      );
      if (result.rowCount) { accepted += 1; room -= 1; } else duplicates += 1;
    }
    await this.cleanupIfDue();
    return { accepted, duplicates };
  }

  async cleanupIfDue() {
    const now = this.clock().getTime();
    if (now - this.lastCleanupAt < 6 * 60 * 60 * 1000) return;
    await this.pool.query(
      "DELETE FROM community_stats.receipts WHERE received_at < now() - ($1::int * interval '1 day')",
      [COMMUNITY_RAW_RETENTION_DAYS]
    );
    // Feedback notes and error reports keep the same 30-day life as game stats.
    await this.pool.query(
      "DELETE FROM community_stats.feedback WHERE received_at < now() - ($1::int * interval '1 day')",
      [COMMUNITY_RAW_RETENTION_DAYS]
    );
    await this.pool.query(
      "DELETE FROM community_stats.diagnostics WHERE received_at < now() - ($1::int * interval '1 day')",
      [COMMUNITY_RAW_RETENTION_DAYS]
    );
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
    return { ok: true, database: "ready", latencyMs: Math.max(0, this.clock().getTime() - started), schemaVersion: 2 };
  }

  async close() { await this.pool.end(); }
}
