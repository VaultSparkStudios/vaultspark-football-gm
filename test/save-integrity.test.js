import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";
import {
  buildIntegrityStamp,
  computeSnapshotChecksum,
  verifyIntegrityStamp
} from "../src/adapters/persistence/saveStoreShared.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
    _raw: data
  };
}

const SNAPSHOT = {
  schemaVersion: 1,
  rngSeed: 49020,
  currentYear: 2031,
  currentWeek: 4,
  phase: "regular-season",
  controlledTeamId: "BUF",
  seasonsSimulated: 5,
  league: { teams: [{ id: "BUF", name: "Buffalo", abbrev: "BUF" }], players: [] }
};

// ── Save integrity guard (S14) ───────────────────────────────────────────────

test("saveSessionToSlot stamps integrity metadata", () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  store.saveSessionToSlot("dynasty", SNAPSHOT);
  const meta = JSON.parse(storage.getItem("vsfgm:meta:dynasty"));
  assert.equal(meta.integrity.algo, "fnv1a32");
  assert.match(meta.integrity.checksum, /^[0-9a-f]{8}$/);
  assert.equal(meta.integrity.length, JSON.stringify(SNAPSHOT).length);
});

test("clean round-trip loads the snapshot", () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  store.saveSessionToSlot("dynasty", SNAPSHOT);
  const loaded = store.loadSessionFromSlot("dynasty");
  assert.equal(loaded.currentYear, 2031);
  assert.equal(loaded.controlledTeamId, "BUF");
});

test("silent corruption that is still valid JSON is detected on load", () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  store.saveSessionToSlot("dynasty", SNAPSHOT);
  // Corrupt the payload while keeping it valid JSON — the killer failure mode.
  const corrupted = JSON.stringify({ ...SNAPSHOT, currentYear: 1999 });
  storage.setItem("vsfgm:save:dynasty", corrupted);
  assert.throws(() => store.loadSessionFromSlot("dynasty"), /integrity verification/);
});

test("truncated payload is detected on load", () => {
  const storage = createMemoryStorage();
  const store = createBrowserSaveStore({ storage });
  store.saveSessionToSlot("dynasty", SNAPSHOT);
  const raw = storage.getItem("vsfgm:save:dynasty");
  storage.setItem("vsfgm:save:dynasty", raw.slice(0, raw.length - 10));
  assert.throws(() => store.loadSessionFromSlot("dynasty"), /integrity verification/);
});

test("legacy saves without an integrity stamp still load (backward compatible)", () => {
  const storage = createMemoryStorage();
  // Simulate a pre-S14 save: data present, meta has no integrity field.
  storage.setItem("vsfgm:save:old", JSON.stringify(SNAPSHOT));
  storage.setItem("vsfgm:meta:old", JSON.stringify({ updatedAt: "2026-01-01T00:00:00.000Z" }));
  const store = createBrowserSaveStore({ storage });
  const loaded = store.loadSessionFromSlot("old");
  assert.equal(loaded.currentYear, 2031);
});

test("verifyIntegrityStamp helpers behave at the boundaries", () => {
  const s = JSON.stringify(SNAPSHOT);
  const stamp = buildIntegrityStamp(s);
  assert.equal(verifyIntegrityStamp(s, stamp), true);
  assert.equal(verifyIntegrityStamp(s + " ", stamp), false);
  assert.equal(verifyIntegrityStamp(s, null), true, "missing stamp = legacy = pass");
  assert.equal(verifyIntegrityStamp(s, { algo: "unknown" }), false, "unknown algorithms never bypass verification");
  assert.equal(computeSnapshotChecksum(s), computeSnapshotChecksum(s), "deterministic");
});
