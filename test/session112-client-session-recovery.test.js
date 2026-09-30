import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrityStamp, verifyIntegrityStamp } from "../src/adapters/persistence/saveStoreShared.js";
import {
  createClientSessionRecovery, CLIENT_SESSION_RECOVERY_KEY as KEY, CLIENT_SESSION_PENDING_KEY as PENDING
} from "../public/lib/api/clientSessionRecovery.js";

const clone = value => structuredClone(value);
const encode = async value => JSON.stringify(value);
const decode = async value => JSON.parse(value);
function snapshot(overrides = {}) {
  return { schemaVersion: 9, rngSeed: 817263, startYear: 2031, currentYear: 2033, currentWeek: 8,
    controlledTeamId: "CHI", mode: "play", phase: "regular-season",
    league: { settings: { eraProfile: "legacy", enableOwnerMode: false }, players: [{ id: "chosen-player", teamId: "CHI" }] }, ...overrides };
}
function memory(entries = []) {
  const data = new Map(entries);
  return { data, beforeSet: null, beforeGet: null, afterSet: null, beforeRemove: null,
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { this.beforeGet?.(key); return data.get(key) ?? null; },
    setItem(key, value) { this.beforeSet?.(key, value); data.set(key, String(value)); this.afterSet?.(key, value); },
    removeItem(key) { this.beforeRemove?.(key); data.delete(key); } };
}
function fakeRuntime(initial = null, sharedSlots = new Map()) {
  let state = initial && clone(initial);
  const calls = [];
  const slots = sharedSlots;
  const jobs = [];
  const raw = { calls, slots, jobs, onRequest: null, get state() { return state && clone(state); },
    set state(value) { state = clone(value); },
    async request(path, options = {}) {
      const route = new URL(path, "http://local").pathname;
      const method = options.method || "GET";
      calls.push({ route, method, body: clone(options.body || {}) });
      const custom = await raw.onRequest?.(route, options);
      if (custom) return custom;
      const response = payload => ({ ok: true, status: 200, payload: { ok: true, ...payload } });
      if (route === "/api/setup/init") return response({ activeLeague: state });
      if (route === "/api/saves" || route === "/api/backups") return response({ slots: [...slots.keys()] });
      if (route === "/api/new-league") state = snapshot(options.body);
      else if (route === "/api/snapshot/import") state = clone(options.body.snapshot);
      else if (route === "/api/saves/load" || route === "/api/backups/load") {
        if (!slots.has(options.body.slot)) return { ok: false, status: 404, payload: { ok: false, error: "Missing slot" } };
        const savedBytes = JSON.stringify(slots.get(options.body.slot));
        if (options.body.expectedSavedSnapshotIntegrity && !verifyIntegrityStamp(savedBytes, options.body.expectedSavedSnapshotIntegrity)) {
          return { ok: false, status: 409, payload: { ok: false, reasonCode: "RECOVERY_REFERENCE_CHANGED" } };
        }
        state = clone(slots.get(options.body.slot));
        return response({ state: clone(state), savedSnapshotIntegrity: buildIntegrityStamp(savedBytes) });
      }
      state ||= snapshot({ controlledTeamId: "BUF", startYear: 2026, currentYear: 2026, currentWeek: 1, mode: "drive" });
      if (route === "/api/advance-week") state.currentWeek++;
      if (route === "/api/realism/verify") {
        state.lastRealismVerificationReport = { id: "verification-1", passed: true };
        state.realismVerificationHistory = [...(state.realismVerificationHistory || []), state.lastRealismVerificationReport];
      }
      if (route === "/api/saves/save") {
        const slot = String(options.body.slot || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 64);
        slots.set(slot, clone(state));
        return response({ saved: { slot }, savedSnapshotIntegrity: buildIntegrityStamp(JSON.stringify(state)) });
      }
      if (route === "/api/saves/delete" || route === "/api/backups/delete") {
        const slot = String(options.body.slot || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 64);
        return response({ deleted: slots.delete(slot) });
      }
      if (route === "/api/snapshot/export") return response({ snapshot: clone(state) });
      if (route === "/api/jobs/simulate") {
        if (method === "POST") { jobs.push({ id: "job-1", status: "queued", completedSeasons: 0, totalSeasons: 4 }); return response({ job: clone(jobs[0]) }); }
        return response({ jobs: clone(jobs) });
      }
      return response({ state: clone(state) });
    }
  };
  return raw;
}
function create(runtime = fakeRuntime(), storage = memory(), options = {}) {
  const statuses = [];
  const recovery = createClientSessionRecovery({ runtime, storage, encode, decode, now: () => 123456,
    onStatus: value => statuses.push(value), ...options });
  return { recovery, runtime, storage, statuses };
}
async function seeded(overrides = {}) {
  const harness = create();
  await harness.recovery.request("/api/new-league", { method: "POST", body: overrides });
  return harness;
}
const countCalls = (runtime, route) => runtime.calls.filter(call => call.route === route).length;
const quota = () => Object.assign(new Error("Storage quota exceeded"), { name: "QuotaExceededError" });

test("S112 recovery preserves exact nondefault franchise and restores before first read, once per runtime", async () => {
  const { storage, runtime } = await seeded({ controlledTeamId: "MIA", rngSeed: 78129, mode: "play" });
  const expected = runtime.state;
  const fresh = create(fakeRuntime(), storage);
  await fresh.recovery.request("/api/state");
  await fresh.recovery.request("/api/state");
  assert.deepEqual(fresh.runtime.state, expected);
  assert.equal(fresh.runtime.calls[0].route, "/api/snapshot/import");
  assert.equal(countCalls(fresh.runtime, "/api/snapshot/import"), 1);
  assert.equal(storage.getItem(PENDING), null);
  assert.equal(fresh.recovery.getStatus().status, "ready");
});

test("S112 a direct fresh dashboard checkpoints its initial state and setup remains catalog-only", async () => {
  const { recovery, runtime, storage } = create();
  await recovery.request("/api/setup/init?includeSaves=0");
  assert.equal(runtime.state, null);
  assert.equal(storage.getItem(KEY), null);
  await recovery.request("/api/state");
  assert.equal(countCalls(runtime, "/api/snapshot/export"), 1);
  assert.equal(JSON.parse(JSON.parse(storage.getItem(KEY)).snapshot).controlledTeamId, "BUF");
});

test("S112 command and asynchronous checkpoint serialize before the next command", async () => {
  let release;
  let encoding;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { encoding = resolve; });
  let first = true;
  const h = create(undefined, undefined, { encode: async value => {
    if (first) { first = false; encoding(); await held; }
    return JSON.stringify(value);
  } });
  const creation = h.recovery.request("/api/new-league", { method: "POST" });
  await started;
  assert.equal(h.recovery.getStatus().status, "pending");
  assert.ok(h.storage.getItem(PENDING));
  const advance = h.recovery.request("/api/advance-week", { method: "POST" });
  await Promise.resolve();
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 0);
  release();
  await Promise.all([creation, advance]);
  assert.equal(h.runtime.state.currentWeek, 9);
  assert.equal(JSON.parse(JSON.parse(h.storage.getItem(KEY)).snapshot).currentWeek, 9);
});

for (const failure of ["unavailable", "read", "pending-write", "pending-mismatch"]) {
  test(`S112 ${failure} storage fails before executing a new league`, async () => {
    const storage = failure === "unavailable" ? null : memory();
    if (failure === "read") storage.beforeGet = () => { throw new Error("Access denied"); };
    if (failure === "pending-write") storage.beforeSet = key => { if (key === PENDING) throw quota(); };
    if (failure === "pending-mismatch") storage.afterSet = key => { if (key === PENDING) storage.data.set(key, "wrong bytes"); };
    const h = create(fakeRuntime(), storage);
    await assert.rejects(h.recovery.request("/api/new-league", { method: "POST" }), /recovery|checkpoint/i);
    assert.equal(h.runtime.calls.length, 0);
  });
}

test("S112 quota after mutation keeps success and previous checkpoint, retry saves without repeating action", async () => {
  const h = await seeded();
  const previous = h.storage.getItem(KEY);
  h.storage.beforeSet = key => { if (key === KEY) throw quota(); };
  const result = await h.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(result.ok, true);
  assert.equal(result.payload.state.currentWeek, 9);
  assert.equal(h.storage.getItem(KEY), previous);
  assert.ok(h.storage.getItem(PENDING));
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal(h.recovery.getStatus().canRestorePrevious, true);
  await assert.rejects(h.recovery.flush());
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 1);
  h.storage.beforeSet = null;
  await h.recovery.flush();
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 1);
  assert.equal(JSON.parse(JSON.parse(h.storage.getItem(KEY)).snapshot).currentWeek, 9);
  assert.equal(h.storage.getItem(PENDING), null);
});

test("S112 checkpoint readback mismatch restores old bytes and preserves pending authority", async () => {
  const h = await seeded();
  const previous = h.storage.getItem(KEY);
  let corruptOnce = true;
  h.storage.afterSet = key => { if (key === KEY && corruptOnce) { corruptOnce = false; h.storage.data.set(key, "corrupt"); } };
  assert.equal((await h.recovery.request("/api/advance-week", { method: "POST" })).ok, true);
  assert.equal(h.storage.getItem(KEY), previous);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  const fresh = create(fakeRuntime(), h.storage);
  await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: "RECOVERY_PENDING" });
  assert.equal(fresh.runtime.calls.length, 0);
  await fresh.recovery.restorePreviousCheckpoint();
  assert.equal(fresh.runtime.state.currentWeek, 8);
  assert.equal(h.storage.getItem(PENDING), null);
});

test("S112 a later pending-marker failure preserves dirty applied progress and checkpoint-only retry", async () => {
  const h = await seeded();
  h.storage.beforeSet = key => { if (key === KEY) throw quota(); };
  assert.equal((await h.recovery.request("/api/advance-week", { method: "POST" })).ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal(h.runtime.state.currentWeek, 9);
  h.storage.beforeSet = key => { if (key === PENDING) throw quota(); };
  await assert.rejects(h.recovery.request("/api/advance-week", { method: "POST" }), { reasonCode: "RECOVERY_WRITE_FAILED" });
  assert.equal(h.recovery.getStatus().status, "recovery-required");
  assert.equal(h.recovery.getStatus().dirty, true);
  assert.equal(h.runtime.state.currentWeek, 9);
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 1);
  const boot = create(fakeRuntime(), h.storage);
  await assert.rejects(boot.recovery.request("/api/state"), { reasonCode: "RECOVERY_PENDING" });
  assert.equal(boot.recovery.getStatus().dirty, false, "boot recovery must not offer an active-state checkpoint retry");
  h.storage.beforeSet = null;
  await h.recovery.flush();
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.equal(h.recovery.getStatus().dirty, false);
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 1);
  const fresh = create(fakeRuntime(), h.storage);
  await fresh.recovery.request("/api/state");
  assert.equal(fresh.runtime.state.currentWeek, 9);
});

for (const corruption of ["invalid-json", "wrong-integrity", "wrong-version", "missing", "pending"]) {
  test(`S112 ${corruption} recovery refuses a default dashboard while setup and listings remain usable`, async () => {
    const h = await seeded();
    if (corruption === "invalid-json") h.storage.data.set(KEY, "{");
    if (corruption === "wrong-integrity") { const e = JSON.parse(h.storage.getItem(KEY)); e.snapshot += " "; h.storage.data.set(KEY, JSON.stringify(e)); }
    if (corruption === "wrong-version") { const e = JSON.parse(h.storage.getItem(KEY)); e.version = 99; h.storage.data.set(KEY, JSON.stringify(e)); }
    if (corruption === "missing") { h.storage.data.delete(KEY); h.storage.data.set(PENDING, "interrupted"); }
    if (corruption === "pending") h.storage.data.set(PENDING, "interrupted");
    const fresh = create(fakeRuntime(), h.storage);
    await assert.rejects(fresh.recovery.request("/api/state"));
    assert.equal(fresh.runtime.calls.length, 0);
    assert.equal(fresh.recovery.getStatus().status, "recovery-required");
    assert.equal(fresh.recovery.getStatus().canRestorePrevious, corruption === "pending");
    await fresh.recovery.request("/api/setup/init");
    await fresh.recovery.request("/api/saves");
    await fresh.recovery.request("/api/backups");
    assert.equal(countCalls(fresh.runtime, "/api/state"), 0);
  });
}

test("S112 a stateful realism verification GET checkpoints report history while ordinary reads do not", async () => {
  const h = await seeded();
  const before = countCalls(h.runtime, "/api/snapshot/export");
  h.runtime.onRequest = route => {
    if (route === "/api/realism/verify") assert.ok(h.storage.getItem(PENDING), "pending marker must precede verification");
  };
  assert.equal((await h.recovery.request("/api/realism/verify?seasons=1")).ok, true);
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), before + 1);
  assert.equal(h.storage.getItem(PENDING), null);
  await h.recovery.request("/api/state");
  await h.recovery.request("/api/calibration");
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), before + 1);
  const fresh = create(fakeRuntime(), h.storage);
  await fresh.recovery.request("/api/state");
  assert.deepEqual(fresh.runtime.state.lastRealismVerificationReport, h.runtime.state.lastRealismVerificationReport);
  assert.deepEqual(fresh.runtime.state.realismVerificationHistory, h.runtime.state.realismVerificationHistory);
  h.storage.beforeSet = key => { if (key === PENDING) throw quota(); };
  await assert.rejects(h.recovery.request("/api/realism/verify?seasons=1"), { reasonCode: "RECOVERY_WRITE_FAILED" });
  assert.equal(countCalls(h.runtime, "/api/realism/verify"), 1, "storage failure must not execute verification again");
});

test("S112 real runtime save references survive diagnostic request traffic and reject changed gameplay", async () => {
  const { createLocalApiRuntime } = await import("../src/app/api/localApiRuntime.js");
  const durableStorage = memory();
  const raw = createLocalApiRuntime({ storage: durableStorage, currentYear: 2031 });
  const created = await raw.request("/api/new-league", { method: "POST", body: {
    controlledTeamId: "CHI", seed: 817263, startYear: 2031, mode: "play"
  } });
  assert.equal(created.ok, true);
  assert.equal((await raw.request("/api/saves/save", { method: "POST", body: { slot: "selected-exact" } })).ok, true);
  const tabStorage = limitedStorage();
  const h = create(raw, tabStorage, { requireCheckpoint: true });
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected-exact" } });
  const initialReference = JSON.parse(tabStorage.getItem(KEY));
  assert.equal(initialReference.kind, "save-reference");
  assert.equal(initialReference.reference.slot, "selected-exact");
  const firstExport = clone((await raw.request("/api/snapshot/export")).payload.snapshot);
  assert.ok(firstExport.league.observability, "full snapshot keeps diagnostic data");
  for (let i = 0; i < 3; i++) {
    await h.recovery.request("/api/state");
    await raw.request("/api/snapshot/export");
  }
  const laterExport = clone((await raw.request("/api/snapshot/export")).payload.snapshot);
  assert.notDeepEqual(laterExport.league.observability, firstExport.league.observability);
  await h.recovery.flush();
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.deepEqual(JSON.parse(tabStorage.getItem(KEY)).reference.integrity, initialReference.reference.integrity);
  for (let i = 0; i < 2; i++) {
    const freshRaw = createLocalApiRuntime({ storage: durableStorage, currentYear: 2031 });
    const fresh = create(freshRaw, tabStorage, { requireCheckpoint: true });
    const restored = await fresh.recovery.request("/api/state");
    assert.equal(restored.payload.controlledTeamId, "CHI");
    assert.equal(restored.payload.franchiseId, created.payload.state.franchiseId);
    assert.equal(restored.payload.currentWeek, created.payload.state.currentWeek);
    assert.equal(restored.payload.currentYear, 2031);
    assert.equal((await freshRaw.request("/api/snapshot/export")).payload.snapshot.mode, "play");
    await fresh.recovery.flush();
    assert.equal(JSON.parse(tabStorage.getItem(KEY)).kind, "save-reference");
  }
  const advanced = await h.recovery.request("/api/advance-week", { method: "POST", body: { count: 1 } });
  assert.equal(advanced.ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal((await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "after-week" } })).ok, true);
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.equal(JSON.parse(tabStorage.getItem(KEY)).reference.slot, "after-week");
  const afterWeekRaw = createLocalApiRuntime({ storage: durableStorage, currentYear: 2031 });
  const afterWeek = create(afterWeekRaw, tabStorage, { requireCheckpoint: true });
  const restoredWeek = await afterWeek.recovery.request("/api/state");
  assert.equal(restoredWeek.payload.currentWeek, advanced.payload.state.currentWeek);
  assert.equal(restoredWeek.payload.franchiseId, created.payload.state.franchiseId);
  // Re-select the original source for the changed-evidence rejection below.
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected-exact" } });
  // Same franchise, team and week: persisted report evidence is still authority.
  laterExport.lastRealismVerificationReport = { id: "changed-report", passed: false };
  assert.equal((await raw.request("/api/snapshot/import", { method: "POST", body: { snapshot: laterExport } })).ok, true);
  assert.equal((await raw.request("/api/saves/save", { method: "POST", body: { slot: "selected-exact" } })).ok, true);
  const changedRaw = createLocalApiRuntime({ storage: durableStorage, currentYear: 2031 });
  const active = await changedRaw.request("/api/new-league", { method: "POST", body: {
    controlledTeamId: "DAL", seed: 99187, startYear: 2031, mode: "play"
  } });
  assert.equal(active.ok, true);
  const calls = [];
  const changed = create({ request: (path, options) => { calls.push(path); return changedRaw.request(path, options); } }, tabStorage, { requireCheckpoint: true });
  await assert.rejects(changed.recovery.request("/api/state"), { reasonCode: "RECOVERY_REFERENCE_CHANGED" });
  assert.equal(calls.includes("/api/state"), false);
  assert.equal(changed.recovery.getStatus().canRestorePrevious, false);
  const preserved = await changedRaw.request("/api/state");
  assert.equal(preserved.payload.franchiseId, active.payload.state.franchiseId);
  assert.equal(preserved.payload.controlledTeamId, "DAL", "raw integrity rejection must precede runtime replacement");
});

test("S112 an unstamped save response cannot authorize a quota reference", async () => {
  const slots = new Map([["selected", largeSnapshot()]]);
  const raw = fakeRuntime(null, slots);
  const runtime = { request: async (path, options) => {
    const response = await raw.request(path, options);
    if (path === "/api/saves/load") delete response.payload.savedSnapshotIntegrity;
    return response;
  } };
  const h = create(runtime, limitedStorage());
  const response = await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
  assert.equal(response.ok, true, "the explicit load was applied");
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal(h.storage.getItem(KEY), null);
  assert.ok(h.storage.getItem(PENDING));
  await assert.rejects(h.recovery.flush());
  assert.equal(countCalls(raw, "/api/saves/load"), 1);
});

for (const route of ["/api/saves/load", "/api/backups/load"]) {
  test(`S112 explicit ${route} replaces broken recovery with exactly the selected checkpoint`, async () => {
    const storage = memory([[KEY, "broken"], [PENDING, "interrupted"]]);
    const runtime = fakeRuntime();
    runtime.slots.set("selected-old", snapshot({ controlledTeamId: "GB", currentYear: 2037, currentWeek: 13 }));
    runtime.slots.set("newer-other", snapshot({ controlledTeamId: "DAL", currentYear: 2040 }));
    const h = create(runtime, storage);
    const response = await h.recovery.request(route, { method: "POST", body: { slot: "selected-old" } });
    assert.equal(response.ok, true);
    assert.equal(storage.getItem(PENDING), null);
    const fresh = create(fakeRuntime(), storage);
    await fresh.recovery.request("/api/state");
    assert.deepEqual(fresh.runtime.state, runtime.slots.get("selected-old"));
  });
}

test("S112 invalid explicit selection preserves the blocked receipt and does not create a checkpoint", async () => {
  const storage = memory([[KEY, "broken"], [PENDING, "original-marker"]]);
  const h = create(fakeRuntime(), storage);
  const response = await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "missing" } });
  assert.equal(response.ok, false);
  assert.equal(storage.getItem(KEY), "broken");
  assert.equal(storage.getItem(PENDING), "original-marker");
  await assert.rejects(h.recovery.request("/api/state"));
});

test("S112 cloned tab recovery checkpoints evolve independently", async () => {
  const original = await seeded();
  const clonedStorage = memory(original.storage.data);
  const tab = create(fakeRuntime(), clonedStorage);
  await tab.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(JSON.parse(JSON.parse(clonedStorage.getItem(KEY)).snapshot).currentWeek, 9);
  assert.equal(JSON.parse(JSON.parse(original.storage.getItem(KEY)).snapshot).currentWeek, 8);
  await original.recovery.request("/api/advance-week", { method: "POST" });
  await original.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(JSON.parse(JSON.parse(clonedStorage.getItem(KEY)).snapshot).currentWeek, 9);
});

test("S112 read-only evaluation and deletion do not checkpoint, while an explicit manual save checkpoints once", async () => {
  const h = await seeded();
  const count = countCalls(h.runtime, "/api/snapshot/export");
  for (const route of ["/api/trade/evaluate", "/api/snapshot/inspect", "/api/saves/delete", "/api/backups/delete"]) await h.recovery.request(route, { method: "POST", body: { slot: "manual" } });
  await h.recovery.request("/api/state");
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), count);
  await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "manual" } });
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), count + 1);
  assert.equal(countCalls(h.runtime, "/api/saves/save"), 1);
});

test("S112 observed job progress checkpoints once per signature and reload reports interruption without restarting", async () => {
  const h = await seeded();
  await h.recovery.request("/api/jobs/simulate", { method: "POST" });
  assert.equal(h.recovery.getStatus().backgroundRunning, true);
  const before = countCalls(h.runtime, "/api/snapshot/export");
  await h.recovery.request("/api/jobs/simulate");
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), before);
  h.runtime.jobs[0].status = "running";
  h.runtime.jobs[0].completedSeasons = 2;
  h.runtime.state = snapshot({ currentYear: 2035 });
  await h.recovery.request("/api/jobs/simulate");
  await h.recovery.request("/api/jobs/simulate");
  assert.equal(countCalls(h.runtime, "/api/snapshot/export"), before + 1);
  const fresh = create(fakeRuntime(), memory(h.storage.data));
  await fresh.recovery.request("/api/state");
  assert.equal(fresh.runtime.state.currentYear, 2035);
  assert.equal(fresh.recovery.getStatus().interruptedJob, true);
  assert.equal(fresh.recovery.getStatus().backgroundRunning, false);
  assert.equal(countCalls(fresh.runtime, "/api/jobs/simulate"), 0);
  h.runtime.jobs[0].status = "completed";
  h.runtime.jobs[0].completedSeasons = 4;
  await h.recovery.request("/api/jobs/simulate");
  assert.equal(h.recovery.getStatus().backgroundRunning, false);
});

test("S112 failed checkpoint after a job observation remains visible and retry never restarts the job", async () => {
  const h = await seeded();
  await h.recovery.request("/api/jobs/simulate", { method: "POST" });
  h.runtime.jobs[0].completedSeasons = 1;
  h.runtime.jobs[0].status = "running";
  h.storage.beforeSet = key => { if (key === KEY) throw quota(); };
  assert.equal((await h.recovery.request("/api/jobs/simulate")).ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  h.storage.beforeSet = null;
  await h.recovery.flush();
  assert.equal(h.runtime.calls.filter(call => call.route === "/api/jobs/simulate" && call.method === "POST").length, 1);
});

test("S112 pending marker is retained until an explicit prior restore succeeds", async () => {
  const h = await seeded();
  h.storage.data.set(PENDING, "interrupted");
  const runtime = fakeRuntime();
  runtime.onRequest = route => route === "/api/snapshot/import" ? { ok: false, status: 400, payload: { ok: false, error: "Corrupt runtime snapshot" } } : null;
  const fresh = create(runtime, h.storage);
  await assert.rejects(fresh.recovery.restorePreviousCheckpoint(), /Corrupt runtime snapshot/);
  assert.equal(fresh.recovery.getStatus().canRestorePrevious, false);
  assert.equal(h.storage.getItem(PENDING), "interrupted");
  runtime.onRequest = null;
  await fresh.recovery.restorePreviousCheckpoint();
  assert.equal(h.storage.getItem(PENDING), null);
});

test("S112 a full recovery quota leaves explicit ongoing play and manual saves available with an unsaved warning", async () => {
  const h = await seeded();
  const previous = h.storage.getItem(KEY);
  h.storage.beforeSet = key => { if (key === KEY) throw quota(); };
  await h.recovery.request("/api/advance-week", { method: "POST" });
  await h.recovery.request("/api/advance-week", { method: "POST" });
  await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "manual-recovery" } });
  assert.equal(h.runtime.state.currentWeek, 10);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal(h.storage.getItem(KEY), previous);
  assert.ok(h.storage.getItem(PENDING));
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 2);
  h.storage.beforeSet = null;
  await h.recovery.flush();
  assert.equal(JSON.parse(JSON.parse(h.storage.getItem(KEY)).snapshot).currentWeek, 10);
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 2);
});

test("S112 a rejected domain command clears only its own pending marker and does not poison later requests", async () => {
  const h = await seeded();
  const previous = h.storage.getItem(KEY);
  h.runtime.onRequest = route => route === "/api/trade" ? { ok: false, status: 400, payload: { ok: false, error: "Illegal trade" } } : null;
  const result = await h.recovery.request("/api/trade", { method: "POST" });
  assert.equal(result.ok, false);
  assert.equal(h.storage.getItem(PENDING), null);
  assert.equal(h.storage.getItem(KEY), previous);
  assert.equal(h.recovery.getStatus().status, "ready");
  await h.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(h.runtime.state.currentWeek, 9);
});

test("S112 marker-removal failure preserves the successful action and blocks silent reload", async () => {
  const h = await seeded();
  h.storage.beforeRemove = key => { if (key === PENDING) throw new Error("Removal denied"); };
  const result = await h.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(result.ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.ok(h.storage.getItem(PENDING));
  const fresh = create(fakeRuntime(), h.storage);
  await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: "RECOVERY_PENDING" });
  assert.equal(fresh.runtime.calls.length, 0);
  h.storage.beforeRemove = null;
  await fresh.recovery.restorePreviousCheckpoint();
  assert.equal(fresh.runtime.state.currentWeek, 9);
});

test("S112 a successful-looking restore of the wrong team refuses dashboard access", async () => {
  const h = await seeded();
  const runtime = fakeRuntime();
  runtime.onRequest = route => route === "/api/snapshot/import" ? { ok: true, status: 200, payload: { ok: true, state: snapshot({ controlledTeamId: "BUF" }) } } : null;
  const fresh = create(runtime, h.storage);
  await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: "RECOVERY_IDENTITY_MISMATCH" });
  assert.equal(countCalls(runtime, "/api/state"), 0);
  assert.equal(fresh.recovery.getStatus().canRestorePrevious, false);
});

test("S112 explicit new-league and snapshot import can replace a broken recovery envelope", async () => {
  for (const route of ["/api/new-league", "/api/snapshot/import"]) {
    const storage = memory([[KEY, "invalid"], [PENDING, "interrupted"]]);
    const h = create(fakeRuntime(), storage);
    const selected = snapshot({ controlledTeamId: "SEA", currentWeek: 12 });
    const body = route === "/api/snapshot/import" ? { snapshot: selected } : selected;
    assert.equal((await h.recovery.request(route, { method: "POST", body })).ok, true);
    assert.equal(storage.getItem(PENDING), null);
    const fresh = create(fakeRuntime(), storage);
    await fresh.recovery.request("/api/state");
    assert.deepEqual(fresh.runtime.state, selected);
  }
});

test("S112 the default lazy codec round-trips a real compressed envelope", async () => {
  const storage = memory();
  const runtime = fakeRuntime();
  const recovery = createClientSessionRecovery({ runtime, storage });
  await recovery.request("/api/new-league", { method: "POST" });
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.version, 1);
  assert.equal(typeof saved.integrity.checksum, "string");
  const freshRuntime = fakeRuntime();
  const fresh = createClientSessionRecovery({ runtime: freshRuntime, storage });
  await fresh.request("/api/state");
  assert.deepEqual(freshRuntime.state, runtime.state);
});

test("S112 UI observer failures cannot turn a committed action into an error", async () => {
  const h = create(undefined, undefined, { onStatus: () => { throw new Error("UI observer failed"); } });
  const result = await h.recovery.request("/api/new-league", { method: "POST" });
  assert.equal(result.ok, true);
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.equal(h.storage.getItem(PENDING), null);
});

test("S112 an expected but entirely missing checkpoint refuses a default and permits explicit recovery", async () => {
  const h = create(undefined, undefined, { requireCheckpoint: true });
  await assert.rejects(h.recovery.request("/api/state"), { reasonCode: "RECOVERY_MISSING" });
  assert.equal(h.runtime.calls.length, 0);
  await h.recovery.request("/api/setup/init");
  await h.recovery.request("/api/saves");
  assert.equal(countCalls(h.runtime, "/api/state"), 0);
  await h.recovery.request("/api/new-league", { method: "POST", body: { controlledTeamId: "NYJ" } });
  assert.equal((await h.recovery.request("/api/state")).payload.state.controlledTeamId, "NYJ");
  assert.equal(h.recovery.getStatus().status, "ready");
});

test("S112 same-team same-week restoration still rejects another franchise seed", async () => {
  const h = await seeded({ rngStreams: { baseSeed: 67381, streamSeeds: {} } });
  const runtime = fakeRuntime();
  runtime.onRequest = route => route === "/api/snapshot/import" ? { ok: true, status: 200,
    payload: { ok: true, state: { ...h.runtime.state, franchiseId: "fa-112233-CHI" } } } : null;
  const fresh = create(runtime, h.storage);
  await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: "RECOVERY_IDENTITY_MISMATCH" });
  assert.equal(countCalls(runtime, "/api/state"), 0);
});

test("S112 interrupted-job disclosure survives later checkpoints and reloads", async () => {
  const h = await seeded();
  await h.recovery.request("/api/jobs/simulate", { method: "POST" });
  const fresh = create(fakeRuntime(), h.storage);
  await fresh.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(fresh.recovery.getStatus().interruptedJob, true);
  assert.match(fresh.recovery.getStatus().message, /interrupted and was not resumed/);
  const another = create(fakeRuntime(), h.storage);
  await another.recovery.request("/api/state");
  assert.equal(another.recovery.getStatus().interruptedJob, true);
  assert.match(another.recovery.getStatus().message, /interrupted background simulation was not resumed/);
});

function limitedStorage(entries = []) {
  const storage = memory(entries);
  storage.beforeSet = (key, value) => { if (key === KEY && value.length > 1000) throw quota(); };
  return storage;
}
function largeSnapshot(overrides = {}) {
  const result = snapshot(overrides);
  result.league.archive = "a real snapshot-shaped payload ".repeat(1000);
  return result;
}

for (const route of ["/api/saves/load", "/api/backups/load"]) {
  test(`S112 quota uses an exact small reference to the explicitly selected ${route}`, async () => {
    const slots = new Map([["selected-old", largeSnapshot({ controlledTeamId: "NYJ" })], ["newest-other", largeSnapshot({ controlledTeamId: "DAL" })]]);
    const h = create(fakeRuntime(null, slots), limitedStorage(), { requireCheckpoint: true });
    assert.equal((await h.recovery.request(route, { method: "POST", body: { slot: "selected-old" } })).ok, true);
    const receipt = JSON.parse(h.storage.getItem(KEY));
    assert.equal(receipt.kind, "save-reference");
    assert.equal(receipt.reference.slot, "selected-old");
    assert.equal(receipt.reference.loadRoute, route);
    assert.equal(h.recovery.getStatus().status, "ready");
    assert.equal(h.storage.getItem(PENDING), null);
    const fresh = create(fakeRuntime(null, slots), h.storage, { requireCheckpoint: true });
    await fresh.recovery.request("/api/state");
    assert.deepEqual(fresh.runtime.state, slots.get("selected-old"));
    assert.deepEqual(fresh.runtime.calls.slice(0, 3).map(call => call.route), [route, "/api/snapshot/export", "/api/state"]);
    assert.equal(slots.size, 2);
  });
}

for (const change of ["missing", "same-team-overwritten", "pruned-backup"]) {
  test(`S112 a ${change} saved reference refuses a dashboard`, async () => {
    const slot = change === "pruned-backup" ? "auto-selected" : "selected";
    const route = change === "pruned-backup" ? "/api/backups/load" : "/api/saves/load";
    const slots = new Map([[slot, largeSnapshot()]]);
    const h = create(fakeRuntime(null, slots), limitedStorage());
    await h.recovery.request(route, { method: "POST", body: { slot } });
    if (change === "same-team-overwritten") slots.get(slot).league.players[0].id = "different-player-same-team-and-week";
    else slots.delete(slot);
    const fresh = create(fakeRuntime(null, slots), h.storage, { requireCheckpoint: true });
    await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: change === "same-team-overwritten" ? "RECOVERY_REFERENCE_CHANGED" : "RECOVERY_REFERENCE_UNAVAILABLE" });
    assert.equal(countCalls(fresh.runtime, "/api/state"), 0);
    assert.equal(fresh.recovery.getStatus().status, "recovery-required");
    assert.equal(fresh.recovery.getStatus().canRestorePrevious, false);
  });
}

test("S112 a later action invalidates a large-save reference until an explicit manual save checkpoints that action", async () => {
  const slots = new Map([["selected", largeSnapshot()]]);
  const h = create(fakeRuntime(null, slots), limitedStorage());
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
  const previous = h.storage.getItem(KEY);
  const result = await h.recovery.request("/api/advance-week", { method: "POST" });
  assert.equal(result.ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.equal(h.storage.getItem(KEY), previous);
  assert.ok(h.storage.getItem(PENDING));
  await assert.rejects(h.recovery.flush());
  const saved = await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "Explicit Slot!!" } });
  assert.equal(saved.ok, true);
  assert.equal(JSON.parse(h.storage.getItem(KEY)).reference.slot, "explicitslot");
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.equal(h.storage.getItem(PENDING), null);
  await h.recovery.flush();
  const fresh = create(fakeRuntime(null, slots), h.storage, { requireCheckpoint: true });
  await fresh.recovery.request("/api/state");
  assert.equal(fresh.runtime.state.currentWeek, 9);
  assert.equal(slots.get("selected").currentWeek, 8);
  assert.equal(countCalls(h.runtime, "/api/advance-week"), 1);
  assert.equal(countCalls(h.runtime, "/api/saves/save"), 1);
});

test("S112 cloned tabs only read the referenced durable save and never overwrite its bytes", async () => {
  const slots = new Map([["selected", largeSnapshot()]]);
  const h = create(fakeRuntime(null, slots), limitedStorage());
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
  const tabA = create(fakeRuntime(null, slots), limitedStorage(h.storage.data));
  const tabB = create(fakeRuntime(null, slots), limitedStorage(h.storage.data));
  await tabA.recovery.request("/api/advance-week", { method: "POST" });
  await tabB.recovery.request("/api/state");
  assert.equal(tabA.runtime.state.currentWeek, 9);
  assert.equal(tabB.runtime.state.currentWeek, 8);
  assert.equal(slots.get("selected").currentWeek, 8);
  assert.equal(countCalls(tabA.runtime, "/api/saves/save") + countCalls(tabB.runtime, "/api/saves/save"), 0);
  assert.ok(tabA.storage.getItem(PENDING));
  assert.equal(tabB.storage.getItem(PENDING), null);
});

test("S112 flush cannot reuse a saved reference after an unobserved state change", async () => {
  const slots = new Map([["selected", largeSnapshot()]]);
  const h = create(fakeRuntime(null, slots), limitedStorage());
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
  h.runtime.state = largeSnapshot({ currentWeek: 15 });
  await assert.rejects(h.recovery.flush());
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.ok(h.storage.getItem(PENDING));
  assert.equal(slots.get("selected").currentWeek, 8);
});

test("S112 a running background job prevents replacement and save-reference publication until a later explicit save", async () => {
  const slots = new Map([["selected", largeSnapshot()]]);
  const h = create(fakeRuntime(null, slots), limitedStorage());
  await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
  await h.recovery.request("/api/jobs/simulate", { method: "POST" });
  const previousLoads = countCalls(h.runtime, "/api/saves/load");
  await assert.rejects(h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } }), { reasonCode: "RECOVERY_SIMULATION_ACTIVE" });
  assert.equal(countCalls(h.runtime, "/api/saves/load"), previousLoads);
  assert.equal((await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "during-job" } })).ok, true);
  assert.equal(h.recovery.getStatus().status, "unsaved");
  assert.ok(h.storage.getItem(PENDING));
  h.runtime.jobs[0].status = "completed";
  h.runtime.jobs[0].completedSeasons = 4;
  await h.recovery.request("/api/jobs/simulate");
  await h.recovery.request("/api/saves/save", { method: "POST", body: { slot: "completed-job" } });
  assert.equal(h.recovery.getStatus().status, "ready");
  assert.equal(JSON.parse(h.storage.getItem(KEY)).reference.slot, "completed-job");
});

test("S112 malformed optional references cannot turn a valid snapshot into an arbitrary recovery route", async () => {
  const h = await seeded();
  const envelope = JSON.parse(h.storage.getItem(KEY));
  envelope.reference = { slot: "selected", loadRoute: "/api/new-league" };
  h.storage.data.set(KEY, JSON.stringify(envelope));
  const fresh = create(fakeRuntime(), h.storage);
  await assert.rejects(fresh.recovery.request("/api/state"), { reasonCode: "RECOVERY_CORRUPT" });
  assert.equal(fresh.runtime.calls.length, 0);
});

for (const route of ["/api/saves/delete", "/api/backups/delete"]) {
  test(`S112 ${route} invalidates a matching recovery reference instead of republishing a missing save`, async () => {
    const slots = new Map([["selected", largeSnapshot()]]);
    const h = create(fakeRuntime(null, slots), limitedStorage());
    await h.recovery.request("/api/saves/load", { method: "POST", body: { slot: "selected" } });
    assert.equal(h.recovery.getStatus().status, "ready");
    const response = await h.recovery.request(route, { method: "POST", body: { slot: "SELECTED!" } });
    assert.equal(response.payload.deleted, true);
    assert.equal(h.recovery.getStatus().status, "unsaved");
    assert.ok(h.storage.getItem(PENDING));
    await assert.rejects(h.recovery.flush());
    assert.equal(countCalls(h.runtime, route), 1);
    assert.equal(slots.size, 0);
  });
}
