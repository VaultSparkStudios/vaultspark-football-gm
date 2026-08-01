import test from "node:test";
import assert from "node:assert/strict";

import {
  encodeSnapshot,
  decodeSnapshot,
  isEncodedSnapshot,
  compressionAvailable,
  ENCODED_PREFIX
} from "../src/adapters/persistence/snapshotCodec.js";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";
import { createSession } from "../src/runtime/bootstrap.js";

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); },
    totalBytes() { return [...data.values()].reduce((sum, v) => sum + String(v).length, 0); }
  };
}

/** A franchise big enough that compression matters. */
function seasonSnapshot() {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  for (let i = 0; i < 6; i += 1) {
    if (session.phase !== "regular-season") break;
    session.advanceWeek();
  }
  return session.toSnapshot();
}

test("this runtime can compress, so saves are not silently falling back", () => {
  assert.equal(compressionAvailable(), true);
});

test("a real snapshot round-trips through the codec byte-for-byte", async () => {
  const snapshot = seasonSnapshot();
  const encoded = await encodeSnapshot(snapshot);
  assert.ok(isEncodedSnapshot(encoded), "a large snapshot must actually compress");
  assert.ok(encoded.startsWith(ENCODED_PREFIX));

  const decoded = await decodeSnapshot(encoded);
  assert.deepEqual(decoded, JSON.parse(JSON.stringify(snapshot)));
});

test("compression is what makes a franchise fit a browser storage budget", async () => {
  const snapshot = seasonSnapshot();
  const raw = JSON.stringify(snapshot).length;
  const encoded = (await encodeSnapshot(snapshot)).length;

  assert.ok(encoded < raw / 4, `expected a large reduction, got ${(raw / encoded).toFixed(1)}x`);
  // The number that actually matters: a mid-season save inside a 5 MB origin.
  assert.ok(
    encoded < 5 * 1024 * 1024,
    `a six-week save encodes to ${(encoded / 1048576).toFixed(2)} MB, which does not fit a 5 MB budget`
  );
});

test("legacy plain-JSON payloads still decode, so existing saves are not stranded", async () => {
  const legacy = JSON.stringify({ schemaVersion: 2, currentYear: 2031, league: {} });
  assert.equal(isEncodedSnapshot(legacy), false);
  assert.deepEqual(await decodeSnapshot(legacy), JSON.parse(legacy));
});

test("a payload smaller than its encoding is stored as plain JSON", async () => {
  // Encoding tiny objects makes them bigger; the codec keeps whichever is smaller.
  const tiny = { schemaVersion: 2, a: 1 };
  const encoded = await encodeSnapshot(tiny);
  assert.equal(isEncodedSnapshot(encoded), false);
  assert.deepEqual(await decodeSnapshot(encoded), tiny);
});

test("the save store persists the encoded form and reads it back", async () => {
  const storage = memoryStorage();
  const store = createBrowserSaveStore({ storage });
  const snapshot = seasonSnapshot();

  await store.saveSessionToSlot("dynasty", snapshot);
  const stored = storage.getItem("vsfgm:save:dynasty");
  assert.ok(isEncodedSnapshot(stored), "the store must persist the compressed payload");

  const loaded = await store.loadSessionFromSlot("dynasty");
  assert.equal(loaded.currentYear, snapshot.currentYear);
  assert.equal(loaded.league.players.length, snapshot.league.players.length);
});

test("rolling backups stay inside a byte budget as the franchise grows", async () => {
  const storage = memoryStorage();
  const store = createBrowserSaveStore({ storage });
  const snapshot = seasonSnapshot();

  const budget = 512 * 1024;
  for (let week = 1; week <= 8; week += 1) {
    await store.saveRollingBackup(snapshot, {
      reason: "weekly", year: 2026, week, phase: "regular", maxBackupBytes: budget
    });
  }

  const backups = store.listBackupSlots();
  const backupBytes = backups.reduce(
    (sum, entry) => sum + (storage.getItem(`vsfgm:save:${entry.slot}`) || "").length,
    0
  );

  // The rule is: evict oldest until the budget is met, but never drop the last
  // backup — an undo runway of one beats none, even when a single franchise
  // snapshot is larger than the budget on its own.
  assert.ok(backups.length >= 1, "the newest backup is always kept");
  assert.ok(
    backupBytes <= budget || backups.length === 1,
    `backups grew to ${(backupBytes / 1024).toFixed(0)} KB over a ${(budget / 1024).toFixed(0)} KB budget ` +
    `while still holding ${backups.length} entries`
  );
  assert.ok(backups.length < 8, "eight writes must not leave eight backups");
});

test("a whole franchise plus its backups fits a 5 MB origin", async () => {
  // The end-to-end guarantee this work exists for.
  const storage = memoryStorage();
  const store = createBrowserSaveStore({ storage });
  const snapshot = seasonSnapshot();

  await store.saveSessionToSlot("dynasty", snapshot);
  for (let week = 1; week <= 6; week += 1) {
    await store.saveRollingBackup(snapshot, { reason: "weekly", year: 2026, week, phase: "regular" });
  }

  const totalMb = storage.totalBytes() / 1048576;
  assert.ok(totalMb < 5, `active save plus backups reached ${totalMb.toFixed(2)} MB`);
});
