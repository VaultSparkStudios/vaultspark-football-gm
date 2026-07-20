import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { migrateSnapshot, LATEST_SNAPSHOT_SCHEMA_VERSION } from "../src/runtime/snapshotMigration.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

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

test("snapshot migration rejects future schemas and malformed franchise roots", () => {
  const snapshot = createSession({ seed: 49011, startYear: 2026, controlledTeamId: "BUF" }).toSnapshot();
  assert.throws(
    () => migrateSnapshot({ ...snapshot, schemaVersion: 99 }),
    (error) => error.reasonCode === "SNAPSHOT_FUTURE_VERSION" && error.status === 409
  );
  assert.throws(
    () => migrateSnapshot({ ...snapshot, league: { teams: snapshot.league.teams } }),
    (error) => error.reasonCode === "SNAPSHOT_INVALID_SHAPE" && error.details.missing.includes("league.players")
  );
});

test("failed browser import reports recovery evidence and preserves the active league", async () => {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
  const runtime = createLocalApiRuntime({ storage, autoBackup: false });
  await runtime.request("/api/setup/init");
  const before = (await runtime.request("/api/state")).payload;
  const future = createSession({ seed: 49012, startYear: 2030, controlledTeamId: "DEN" }).toSnapshot();
  future.schemaVersion = 99;
  const rejected = await runtime.request("/api/snapshot/import", { method: "POST", body: { snapshot: future } });
  const after = await runtime.request("/api/state");

  assert.equal(rejected.status, 409);
  assert.equal(rejected.payload.reasonCode, "SNAPSHOT_FUTURE_VERSION");
  assert.match(rejected.payload.recovery, /active league was not replaced/i);
  assert.equal(after.payload.controlledTeamId, before.controlledTeamId);
  assert.equal(after.payload.currentYear, before.currentYear);
  assert.equal(after.payload.currentWeek, before.currentWeek);
});

test("snapshot preflight explains compatibility without replacing the league", async () => {
  const data = new Map();
  const storage = {
    get length() { return data.size; }, key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); }, removeItem(key) { data.delete(String(key)); }
  };
  const runtime = createLocalApiRuntime({ storage, autoBackup: false });
  await runtime.request("/api/setup/init");
  const before = (await runtime.request("/api/state")).payload;
  const compatible = createSession({ seed: 49013, startYear: 2034, controlledTeamId: "MIA" }).toSnapshot();
  const report = await runtime.request("/api/snapshot/inspect", { method: "POST", body: { snapshot: compatible } });
  const after = (await runtime.request("/api/state")).payload;
  assert.equal(report.status, 200);
  assert.equal(report.payload.activeLeaguePreserved, true);
  assert.equal(report.payload.targetVersion, LATEST_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(after.currentYear, before.currentYear);
  assert.equal(after.controlledTeamId, before.controlledTeamId);
});
