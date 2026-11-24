import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_RAW_RETENTION_DAYS } from "./eventContract.js";
import { diagnosticSignatureSource } from "./feedbackContract.js";
import { CHALLENGE_BOARD_MIN_GMS, summarizeChallengeBoard, weeklyObjective } from "./challengeContract.js";
import { emptyLeaguePulseTotals, LEAGUE_PULSE_SCHEMA_VERSION } from "./pulseContract.js";

const { Pool } = pg;
const MAX_SNAPSHOT_ROWS = 500_000;
const MAX_BOARD_ROWS = 200_000;
const FEEDBACK_DAILY_CEILING = 2000;
const DIAGNOSTICS_DAILY_PER_PARTICIPANT = 40;
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
  constructor({ databaseUrl, keyPath = path.resolve("data/community-stats/pepper"), clock = () => new Date(), pool = null, logger = console } = {}) {
    if (!pool && !databaseUrl) throw new Error("DATABASE_URL is required for Community Stats.");
    this.pool = pool || new Pool({ connectionString: databaseUrl, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    this.logger = logger;
    this.retentionTimer = null;
    this.cleanupInFlight = null;
    // pg emits "error" on the pool when an idle client's connection drops (for
    // example a database restart). With no listener that is an uncaught
    // exception and the process exits; the pool already discards the client,
    // so logging is all that is needed. Only the error code is logged.
    if (typeof this.pool.on === "function") {
      this.pool.on("error", (error) => {
        this.logger?.error?.(`Community Stats database pool error (idle client dropped): ${String(error?.code || error?.name || "unknown")}`);
      });
    }
    this.keyPath = keyPath;
    this.clock = clock;
    this.pepper = null;
    this.cache = null;
    this.cacheAt = 0;
    this.ready = null;
    this.lastCleanupAt = 0;
    this.boardCache = new Map();
    this.pulseCache = null;
    this.pulseCacheAt = 0;
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
        -- Version 3: one weekly challenge score per anonymous browser code per
        -- week. Additive and repeatable, like version 2.
        CREATE TABLE IF NOT EXISTS community_stats.challenge_scores (
          participant_hash char(64) NOT NULL,
          week_key varchar(8) NOT NULL,
          objective varchar(24) NOT NULL,
          score integer NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (participant_hash, week_key)
        );
        CREATE INDEX IF NOT EXISTS community_challenge_scores_week_idx ON community_stats.challenge_scores (week_key);
        INSERT INTO community_stats.schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;
        -- Version 4: League Pulse. One running total per metric per day and
        -- nothing else: no browser, no address, no event row. Additive.
        CREATE TABLE IF NOT EXISTS community_stats.pulse_daily (
          day date NOT NULL,
          metric varchar(32) NOT NULL,
          total bigint NOT NULL DEFAULT 0,
          PRIMARY KEY (day, metric)
        );
        INSERT INTO community_stats.schema_migrations(version) VALUES (4) ON CONFLICT DO NOTHING;
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
    // So do its weekly challenge scores.
    const scores = await this.pool.query("DELETE FROM community_stats.challenge_scores WHERE participant_hash=$1", [participantHash]);
    this.cacheAt = 0;
    // Read the scores again on the next request. A board still moves only in steps of five browsers.
    for (const entry of this.boardCache.values()) entry.at = 0;
    return { deleted: (result.rowCount || 0) + (reports.rowCount || 0) + (scores.rowCount || 0) };
  }

  /**
   * Keeps one weekly challenge score per browser code per week: the best one.
   * The entry has already been checked against the shared contract, so only
   * its week, goal and score are stored.
   */
  async saveChallengeScore(participantId, entry) {
    await this.initialize();
    const result = await this.pool.query(
      "INSERT INTO community_stats.challenge_scores(participant_hash,week_key,objective,score) VALUES($1,$2,$3,$4) ON CONFLICT (participant_hash,week_key) DO UPDATE SET score=GREATEST(community_stats.challenge_scores.score, EXCLUDED.score) RETURNING score",
      [this.digest(participantId), entry.week, entry.objective, entry.score]
    );
    // Read the scores again on the next request; see challengeBoard() for when the board itself moves.
    const cachedBoard = this.boardCache.get(entry.week);
    if (cachedBoard) cachedBoard.at = 0;
    await this.cleanupIfDue();
    return { accepted: 1, best: Number(result.rows?.[0]?.score ?? entry.score) };
  }

  /** The shared board for one week. Scores only; no browser code is read. */
  async challengeBoard(weekKey) {
    await this.initialize();
    const now = this.clock().getTime();
    const cached = this.boardCache.get(weekKey);
    if (cached && now - cached.at < 60_000) return cached.board;
    const result = await this.pool.query(
      "SELECT score FROM community_stats.challenge_scores WHERE week_key=$1 AND objective=$2 LIMIT $3",
      [weekKey, weeklyObjective(weekKey)?.id ?? "", MAX_BOARD_ROWS]
    );
    const scores = result.rows.map((row) => Number(row.score));
    // A published board changes only once five more (or five fewer) browsers
    // are counted than when it was last published. Comparing two reads then
    // never shows what a single browser added or removed.
    const previous = cached?.published;
    const published = previous && previous.count >= CHALLENGE_BOARD_MIN_GMS && scores.length >= CHALLENGE_BOARD_MIN_GMS && Math.abs(scores.length - previous.count) < CHALLENGE_BOARD_MIN_GMS
      ? previous
      : { count: scores.length, board: summarizeChallengeBoard(weekKey, scores) };
    if (this.boardCache.size > 16 && !this.boardCache.has(weekKey)) this.boardCache.clear();
    this.boardCache.set(weekKey, { at: now, board: published.board, published });
    return published.board;
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

  /**
   * Starts the periodic retention pass. Writes still trigger cleanupIfDue(),
   * but a service nobody writes to must delete old rows too. The timer is
   * unref'd so it never keeps the process alive, starting twice is a no-op,
   * and a failed pass is logged and retried on the next tick.
   */
  startRetentionTimer({ intervalMs = RETENTION_INTERVAL_MS, setIntervalFn = setInterval } = {}) {
    if (this.retentionTimer) return this.retentionTimer;
    this.retentionTimer = setIntervalFn(() => {
      this.initialize().then(() => this.cleanupIfDue({ force: true })).catch((error) => {
        this.logger?.error?.(`Community Stats retention pass failed: ${String(error?.code || error?.name || "unknown")}`);
      });
    }, intervalMs);
    this.retentionTimer?.unref?.();
    return this.retentionTimer;
  }

  stopRetentionTimer({ clearIntervalFn = clearInterval } = {}) {
    if (!this.retentionTimer) return;
    clearIntervalFn(this.retentionTimer);
    this.retentionTimer = null;
  }

  // One pass at a time: a timer tick and a write (or two writes) that arrive
  // together share the pass already running instead of starting another.
  async cleanupIfDue({ force = false } = {}) {
    if (this.cleanupInFlight) return this.cleanupInFlight;
    if (!force && this.clock().getTime() - this.lastCleanupAt < RETENTION_INTERVAL_MS) return;
    this.cleanupInFlight = this.runCleanup().finally(() => { this.cleanupInFlight = null; });
    return this.cleanupInFlight;
  }

  async runCleanup() {
    const now = this.clock().getTime();
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
    await this.pool.query(
      "DELETE FROM community_stats.challenge_scores WHERE received_at < now() - ($1::int * interval '1 day')",
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

  /** Add one normalized pulse (see pulseContract.js) to today's totals. */
  async addPulse(counts) {
    await this.initialize();
    const entries = Object.entries(counts || {}).filter(([, value]) => Number.isSafeInteger(value) && value > 0);
    if (!entries.length) return { added: 0 };
    const day = this.clock().toISOString().slice(0, 10);
    await this.pool.query(
      `INSERT INTO community_stats.pulse_daily(day,metric,total)
       SELECT $1::date, metric, total FROM unnest($2::varchar[], $3::bigint[]) AS input(metric,total)
       ON CONFLICT (day,metric) DO UPDATE SET total = community_stats.pulse_daily.total + EXCLUDED.total`,
      [day, entries.map(([key]) => key), entries.map(([, value]) => value)]
    );
    this.pulseCache = null;
    return { added: entries.length };
  }

  /** All-time and last-30-day totals per metric, cached for a minute. */
  async pulseTotals() {
    await this.initialize();
    const now = this.clock();
    if (this.pulseCache && now.getTime() - this.pulseCacheAt < 60_000) return this.pulseCache;
    const result = await this.pool.query(
      `SELECT metric, sum(total)::bigint AS all_time,
              sum(total) FILTER (WHERE day >= (now() - interval '30 days')::date)::bigint AS last_30
         FROM community_stats.pulse_daily GROUP BY metric`
    );
    const allTime = emptyLeaguePulseTotals(), last30Days = emptyLeaguePulseTotals();
    for (const row of result.rows) {
      if (!Object.hasOwn(allTime, row.metric)) continue;
      allTime[row.metric] = Number(row.all_time || 0);
      last30Days[row.metric] = Number(row.last_30 || 0);
    }
    this.pulseCache = { schemaVersion: LEAGUE_PULSE_SCHEMA_VERSION, computedAt: now.toISOString(), allTime, last30Days };
    this.pulseCacheAt = now.getTime();
    return this.pulseCache;
  }

  async health() {
    const started = this.clock().getTime();
    await this.initialize();
    await this.pool.query("SELECT 1");
    return { ok: true, database: "ready", latencyMs: Math.max(0, this.clock().getTime() - started), schemaVersion: 4 };
  }

  async close() { this.stopRetentionTimer(); await this.pool.end(); }
}
