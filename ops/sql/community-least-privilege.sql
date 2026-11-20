-- Community Stats: least-privilege runtime role (PREPARED, NOT APPLIED).
--
-- Today the service connects as the database owner, so a flaw in the
-- internet-facing process could drop tables or read anything in the database.
-- This script creates a role that can only do what the service does at
-- runtime: read and write rows in its own tables. It cannot create, alter or
-- drop anything, and it has no access outside the community_stats schema.
--
-- Nothing runs this file. It contains no host names, user names or secrets.
--
-- ── One-time steps, run by the database owner ───────────────────────────────
--
--   1. Start the current release once as the owner, so the schema and every
--      table below exist (the service creates them on start).
--   2. Run this file as the owner, against the service's database:
--        psql --set ON_ERROR_STOP=1 --dbname <database> --file community-least-privilege.sql
--   3. Give the role a password out of band (never in this file or in git):
--        ALTER ROLE community_stats_runtime PASSWORD '<generated secret>';
--   4. Only after the code change described under "Before switching" has
--      shipped: point the service's connection setting at the new role and
--      restart it. Roll back by restoring the previous connection setting.
--
-- ── Before switching: the service cannot start as this role yet ─────────────
--
--   On every start the service runs its schema setup (CREATE SCHEMA / CREATE
--   TABLE / CREATE INDEX ... IF NOT EXISTS and an insert into
--   schema_migrations). PostgreSQL checks the CREATE privilege before it
--   checks "IF NOT EXISTS", and CREATE INDEX needs table ownership, so a role
--   without those rights is refused and the service will not start.
--   The schema setup therefore has to move to an owner-run migration step (or
--   be skipped when the service is told the schema is managed) BEFORE the
--   connection is switched. Confirm on a scratch database first: start the
--   service as this role and check that /health answers.
--
-- ── When a release adds a table ─────────────────────────────────────────────
--
--   Run the owner migration first, then re-run this file. Every statement is
--   safe to repeat. A table this file does not name gets no runtime access, so
--   a forgotten grant fails loudly instead of widening access silently.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'community_stats_runtime') THEN
    CREATE ROLE community_stats_runtime
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
      CONNECTION LIMIT 12;
  END IF;
END
$$;

-- The service's pool holds at most 6 connections; 12 leaves room for a
-- restart overlapping the old process, and bounds a runaway client.
ALTER ROLE community_stats_runtime CONNECTION LIMIT 12;
-- A stuck query or a transaction left open must not hold a connection forever.
ALTER ROLE community_stats_runtime SET statement_timeout = '30s';
ALTER ROLE community_stats_runtime SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE community_stats_runtime SET search_path = community_stats;

-- Start from nothing: remove whatever the role holds here, then grant exactly
-- what the service uses.
REVOKE ALL ON SCHEMA public FROM community_stats_runtime;
REVOKE ALL ON SCHEMA community_stats FROM community_stats_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA community_stats FROM community_stats_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA community_stats FROM community_stats_runtime;

-- CONNECT to the current database, whatever it is named.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO community_stats_runtime', current_database());
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM community_stats_runtime', current_database());
END
$$;

-- USAGE lets the role see the schema; it does not allow creating objects in it.
GRANT USAGE ON SCHEMA community_stats TO community_stats_runtime;

-- Game-stat receipts: inserted, counted and aggregated, deleted on request
-- and by the 30-day retention pass. Never updated.
GRANT SELECT, INSERT, DELETE ON community_stats.receipts TO community_stats_runtime;

-- Feedback notes: inserted, counted for the daily ceiling, deleted by retention.
GRANT SELECT, INSERT, DELETE ON community_stats.feedback TO community_stats_runtime;
-- feedback_id is a bigserial; inserting needs its sequence.
GRANT USAGE ON SEQUENCE community_stats.feedback_feedback_id_seq TO community_stats_runtime;

-- Error reports: inserted, counted per day, deleted on request and by retention.
GRANT SELECT, INSERT, DELETE ON community_stats.diagnostics TO community_stats_runtime;

-- Migration ledger: the service only needs to read it once migrations are
-- owner-run. No INSERT, so the runtime role cannot claim a migration ran.
GRANT SELECT ON community_stats.schema_migrations TO community_stats_runtime;

-- Weekly-challenge scores (schema version 3). Granted only if the table
-- exists, so this file also runs against a database on an earlier version.
-- UPDATE is needed because a better score replaces the stored one (an
-- INSERT ... ON CONFLICT DO UPDATE); rows are deleted on request and by
-- retention.
DO $$
DECLARE
  score_sequence text;
BEGIN
  IF to_regclass('community_stats.challenge_scores') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON community_stats.challenge_scores TO community_stats_runtime;
    FOR score_sequence IN
      SELECT format('%I.%I', seq_ns.nspname, seq.relname)
      FROM pg_depend dep
      JOIN pg_class seq ON seq.oid = dep.objid AND seq.relkind = 'S'
      JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
      WHERE dep.refobjid = to_regclass('community_stats.challenge_scores') AND dep.deptype IN ('a', 'i')
    LOOP
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO community_stats_runtime', score_sequence);
    END LOOP;
  END IF;
END
$$;

-- Deliberately absent: ALTER DEFAULT PRIVILEGES. Future tables get no runtime
-- access until this file names them.

COMMIT;

-- ── Check the result (read-only; run as the owner) ──────────────────────────
--
--   SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'community_stats_runtime'
--   GROUP BY table_name ORDER BY table_name;
--
--   SELECT has_schema_privilege('community_stats_runtime', 'community_stats', 'CREATE') AS can_create,   -- expect f
--          has_schema_privilege('community_stats_runtime', 'public', 'CREATE')          AS public_create; -- expect f
--
-- On PostgreSQL 14 and earlier every role can create objects in schema
-- "public" through the PUBLIC pseudo-role; if public_create is true, also run
--   REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- (PostgreSQL 15 and later no longer grant it by default.)
