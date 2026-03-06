import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { migrateSnapshot, LATEST_SNAPSHOT_SCHEMA_VERSION } from "../src/runtime/snapshotMigration.js";

test("snapshot migration upgrades legacy snapshots", () => {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF" });
  const snapshot = session.toSnapshot();

  const legacy = {
    ...snapshot,
    schemaVersion: undefined,
    league: {
      ...snapshot.league,
      transactionLog: undefined,
      transactionSeq: undefined,
      history: snapshot.league.history.map((entry) => ({
        ...entry,
        playoffBracket: undefined
      }))
    }
  };

  const migrated = migrateSnapshot(legacy);
  assert.equal(migrated.schemaVersion, LATEST_SNAPSHOT_SCHEMA_VERSION);
  assert.ok(Array.isArray(migrated.league.transactionLog));
  assert.equal(Number.isFinite(migrated.league.transactionSeq), true);

  const loaded = createSessionFromSnapshot(legacy);
  assert.equal(loaded.schemaVersion, LATEST_SNAPSHOT_SCHEMA_VERSION);
  assert.ok(Array.isArray(loaded.getTransactionLog()));
});
