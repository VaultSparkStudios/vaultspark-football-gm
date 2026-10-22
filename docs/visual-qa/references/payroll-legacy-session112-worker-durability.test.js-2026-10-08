import test from "node:test";
import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { attachLocalRuntimeWorker, createMirrorStorage } from "../public/lib/api/localRuntimeWorker.js";
import { createWorkerTransport } from "../public/lib/api/workerTransport.js";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";
import { createHybridBrowserSaveStore } from "../src/adapters/persistence/hybridSaveStore.js";
import { buildIntegrityStamp, verifyIntegrityStamp } from "../src/adapters/persistence/saveStoreShared.js";
import { createClientSessionRecovery, CLIENT_SESSION_RECOVERY_KEY, CLIENT_SESSION_PENDING_KEY } from "../public/lib/api/clientSessionRecovery.js";
import { recoverySnapshotIdentity } from "../public/lib/api/recoverySnapshotState.js";

function memoryStorage(entries = []) {
  const data = new Map(entries);
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(String(key)) ?? null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: (key) => { data.delete(String(key)); }
  };
}

function quotaError() {
  const error = new Error("synthetic page quota");
  error.name = "QuotaExceededError";
  error.code = 22;
  return error;
}

function workerHarness(createRuntime, { holdAcknowledgments = false, loadRecovery } = {}) {
  const { port1, port2 } = new MessageChannel();
  const listeners = new Map();
  const replies = [];
  const requests = [];
  const posted = [];
  let terminations = 0;
  const emit = (type, event) => { for (const listener of listeners.get(type) || []) listener(event); };
  port1.on("message", (data) => emit("message", { data }));
  const scope = {
    postMessage: (message) => { posted.push(message); port2.postMessage(message); },
    addEventListener: (_type, listener) => port2.on("message", (data) => listener({ data }))
  };
  const worker = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    postMessage(message) {
      requests.push(message);
      if (holdAcknowledgments && /storage-(ack|nack)/.test(message.type)) replies.push(message);
      else port1.postMessage(message);
    },
    terminate() { terminations += 1; scope.localStorage?.close(); port1.close(); port2.close(); }
  };
  attachLocalRuntimeWorker(scope, { createRuntime, loadRuntimeModule: async () => ({}), ...(loadRecovery ? { loadRecovery } : {}) });
  return {
    worker, scope, replies, requests, posted,
    releaseAcknowledgments() { for (const reply of replies.splice(0)) port1.postMessage(reply); },
    emitError: (error) => emit("error", { error }),
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    terminations: () => terminations
  };
}

const waitFor = async (read) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (read()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail("expected worker event did not arrive");
};

function recoveryRuntime() {
  let snapshot = { schemaVersion: 9, rngSeed: 71392, startYear: 2031, currentYear: 2031, currentWeek: 8,
    phase: "regular-season", mode: "play", controlledTeamId: "CHI",
    league: { players: [{ id: "chosen-player", teamId: "CHI" }], archive: "persisted game evidence ".repeat(500) } };
  const slots = new Map();
  const calls = [];
  return { calls, slots, get snapshot() { return snapshot; },
    async request(path, options = {}) {
      calls.push(path);
      if (path === "/api/snapshot/export") return { ok: true, status: 200, payload: { snapshot } };
      if (path === "/api/snapshot/import") snapshot = structuredClone(options.body.snapshot);
      if (path === "/api/advance-week") snapshot.currentWeek++;
      let savedSnapshotIntegrity;
      if (path === "/api/saves/save") {
        slots.set(options.body.slot, structuredClone(snapshot));
        savedSnapshotIntegrity = buildIntegrityStamp(JSON.stringify(snapshot));
      }
      if (path === "/api/saves/load") {
        const saved = slots.get(options.body.slot);
        if (!saved) return { ok: false, status: 404, payload: { ok: false } };
        const serialized = JSON.stringify(saved);
        if (options.body.expectedSavedSnapshotIntegrity && !verifyIntegrityStamp(serialized, options.body.expectedSavedSnapshotIntegrity)) {
          return { ok: false, status: 409, payload: { ok: false, reasonCode: "RECOVERY_REFERENCE_CHANGED" } };
        }
        savedSnapshotIntegrity = buildIntegrityStamp(serialized);
        snapshot = structuredClone(saved);
      }
      return { ok: true, status: 200, payload: path === "/api/state" ? recoverySnapshotIdentity(snapshot) :
        { ok: true, state: recoverySnapshotIdentity(snapshot), ...(savedSnapshotIntegrity ? { savedSnapshotIntegrity, saved: { slot: options.body.slot } } : {}) } };
    }
  };
}

test("worker recovery freezes before compression, serializes RPCs, and returns no parsed snapshots", async () => {
  const raw = recoveryRuntime();
  let release;
  let began;
  const held = new Promise(resolve => { release = resolve; });
  const encoding = new Promise(resolve => { began = resolve; });
  const harness = workerHarness(() => raw, { loadRecovery: async () => ({ buildIntegrityStamp, verifyIntegrityStamp,
    encodeSnapshot: async snapshot => { began(); await held; return JSON.stringify(snapshot); }, decodeSnapshot: async encoded => JSON.parse(encoded) }) });
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage: memoryStorage() });
  try {
    const capture = transport.captureRecoverySnapshot();
    await encoding;
    raw.snapshot.currentWeek = 9; // Simulates an asynchronous job during compression.
    const next = transport.request("/api/state");
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(raw.calls, ["/api/snapshot/export"], "capture owns the same queue as ordinary requests");
    release();
    const captured = await capture;
    assert.equal(JSON.parse(captured.encoded).currentWeek, 8);
    assert.equal(captured.identity.currentWeek, 8);
    assert.ok(verifyIntegrityStamp(captured.encoded, captured.encodedIntegrity));
    assert.equal((await next).payload.currentWeek, 9);
    assert.equal(Object.hasOwn(captured, "snapshot"), false);
    const currentOnly = await transport.captureRecoverySnapshot({ encode: false });
    assert.equal(Object.hasOwn(currentOnly, "encoded"), false);
    assert.equal(currentOnly.identity.currentWeek, 9);
    assert.ok(JSON.stringify(currentOnly).length < 500);
    const restored = await transport.restoreRecoverySnapshot(captured.encoded, captured.encodedIntegrity);
    assert.equal(restored.identity.currentWeek, 8);
    assert.equal(restored.response.payload.state.currentWeek, 8);
    assert.equal(Object.hasOwn(restored.response.payload.state, "league"), false);
    assert.equal(raw.snapshot.currentWeek, 8);
    const imports = raw.calls.filter(path => path === "/api/snapshot/import").length;
    await assert.rejects(transport.restoreRecoverySnapshot(`${captured.encoded}x`, captured.encodedIntegrity), { reasonCode: "RECOVERY_CORRUPT" });
    await assert.rejects(transport.restoreRecoverySnapshot("bad json", buildIntegrityStamp("bad json")), { reasonCode: "RECOVERY_CORRUPT" });
    assert.equal(raw.calls.filter(path => path === "/api/snapshot/import").length, imports);
    assert.equal(transport.isAlive(), true);
  } finally { release(); transport.terminate(); }
});

test("page recovery uses worker capture/restore capabilities and reference guards without snapshot transport", async () => {
  const raw = recoveryRuntime();
  const harness = workerHarness(() => raw);
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage: memoryStorage() });
  const storage = memoryStorage();
  const recovery = createClientSessionRecovery({ runtime: transport, storage,
    encode: () => { throw new Error("page encoder must not run"); }, decode: () => { throw new Error("page decoder must not run"); } });
  try {
    await recovery.request("/api/new-league", { method: "POST" });
    await recovery.request("/api/advance-week", { method: "POST" });
    assert.equal(recovery.getStatus().status, "ready");
    const fresh = createClientSessionRecovery({ runtime: transport, storage, requireCheckpoint: true,
      decode: () => { throw new Error("page decoder must not run"); } });
    assert.equal((await fresh.request("/api/state")).payload.currentWeek, 9);
    const nativeSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === CLIENT_SESSION_RECOVERY_KEY && JSON.parse(value).kind === "snapshot") throw quotaError();
      nativeSet(key, value);
    };
    await fresh.request("/api/saves/save", { method: "POST", body: { slot: "explicit" } });
    assert.equal(JSON.parse(storage.getItem(CLIENT_SESSION_RECOVERY_KEY)).kind, "save-reference");
    const referenced = createClientSessionRecovery({ runtime: transport, storage, requireCheckpoint: true });
    await referenced.request("/api/state");
    assert.equal(referenced.getStatus().status, "ready");
    assert.equal(storage.getItem(CLIENT_SESSION_PENDING_KEY), null);
    await referenced.request("/api/advance-week", { method: "POST" });
    assert.equal(referenced.getStatus().status, "unsaved");
    await assert.rejects(referenced.flush());
    assert.ok(storage.getItem(CLIENT_SESSION_PENDING_KEY));
    const messages = harness.requests;
    assert.ok(messages.some(row => row.type === "recovery-capture" && row.encode === false), "reference restore uses the small fingerprint capture");
    assert.ok(messages.some(row => row.type === "recovery-restore"));
    assert.equal(messages.some(row => row.type === "request" && ["/api/snapshot/export", "/api/snapshot/import"].includes(row.path)), false);
    assert.equal(harness.posted.some(row => row.response?.payload?.snapshot || row.response?.snapshot), false);
    assert.equal(raw.calls.filter(path => path === "/api/advance-week").length, 2, "flush never replays a mutation");
  } finally { transport.terminate(); }
});

test("worker recovery capture owns its storage NACK barrier and retirement rejects pending capture", async () => {
  const raw = recoveryRuntime();
  let mirror;
  const request = raw.request.bind(raw);
  raw.request = async (...args) => {
    if (args[0] === "/api/snapshot/export") mirror.setItem("vsfgm:meta:checkpoint", "new");
    return request(...args);
  };
  const harness = workerHarness(({ storage }) => { mirror = storage; return raw; }, { holdAcknowledgments: true });
  const pageStorage = memoryStorage();
  pageStorage.setItem = () => { throw quotaError(); };
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage: pageStorage });
  try {
    const capture = transport.captureRecoverySnapshot();
    const rejected = assert.rejects(capture, /synthetic page quota/);
    const next = transport.request("/api/state");
    await waitFor(() => harness.replies.length > 0);
    assert.deepEqual(raw.calls, ["/api/snapshot/export"]);
    harness.releaseAcknowledgments();
    await rejected;
    assert.equal((await next).ok, true);
    const pending = transport.captureRecoverySnapshot();
    const retired = assert.rejects(pending, /terminated/);
    await waitFor(() => harness.replies.length > 0);
    transport.terminate();
    await retired;
    assert.equal(transport.pendingCount(), 0);
    assert.equal(harness.listenerCount(), 0);
  } finally { transport.terminate(); }
});

test("async mirror writes and deletes change committed state only after acknowledgment", async () => {
  const posted = [];
  const mirror = createMirrorStorage([["vsfgm:save:primary", "old"]], (message) => posted.push(message));
  try {
    const saving = mirror.setItemAsync("vsfgm:save:primary", "new");
    assert.equal(mirror.getItem("vsfgm:save:primary"), "old");
    mirror.acknowledge({ type: "storage-ack", storageId: posted.at(-1).storageId, currentValue: "new" });
    await saving;
    assert.equal(mirror.getItem("vsfgm:save:primary"), "new");
    const removing = mirror.removeItemAsync("vsfgm:save:primary");
    assert.equal(mirror.getItem("vsfgm:save:primary"), "new");
    mirror.acknowledge({ type: "storage-ack", storageId: posted.at(-1).storageId, currentValue: null });
    await removing;
    assert.equal(mirror.getItem("vsfgm:save:primary"), null);
    assert.equal(mirror.pendingCount(), 0);
  } finally { mirror.close(); }
});

test("NACK preserves quota identity and restores the page value without poisoning an async recovery", async () => {
  const posted = [];
  const mirror = createMirrorStorage([["vsfgm:save:primary", "old"]], (message) => posted.push(message));
  try {
    const saving = mirror.setItemAsync("vsfgm:save:primary", "new");
    mirror.acknowledge({ type: "storage-nack", storageId: posted.at(-1).storageId, currentValue: "old", error: quotaError() });
    await assert.rejects(saving, { name: "QuotaExceededError", code: 22 });
    assert.equal(mirror.getItem("vsfgm:save:primary"), "old");
    await mirror.flush();
    mirror.setItem("vsfgm:save:primary", "optimistic");
    mirror.acknowledge({ type: "storage-nack", storageId: posted.at(-1).storageId, currentValue: "old", error: quotaError() });
    assert.equal(mirror.getItem("vsfgm:save:primary"), "old");
    await assert.rejects(mirror.flush(), { name: "QuotaExceededError" });
    await mirror.flush();
  } finally { mirror.close(); }
});

test("settling an older write preserves newer synchronous intent and later NACK restores last committed bytes", async () => {
  const posted = [];
  const mirror = createMirrorStorage([["vsfgm:save:primary", "old"]], (message) => posted.push(message));
  try {
    mirror.setItem("vsfgm:save:primary", "first");
    mirror.setItem("vsfgm:save:primary", "second");
    mirror.acknowledge({ type: "storage-ack", storageId: posted[0].storageId, currentValue: "first" });
    assert.equal(mirror.getItem("vsfgm:save:primary"), "second");
    mirror.acknowledge({ type: "storage-nack", storageId: posted[1].storageId, currentValue: "first", error: quotaError() });
    assert.equal(mirror.getItem("vsfgm:save:primary"), "first");
    await assert.rejects(mirror.flush(), /synthetic page quota/);
  } finally { mirror.close(); }
});

test("unacknowledged writes time out, reject all waiters and ignore late acknowledgment", async () => {
  const fatals = [];
  const mirror = createMirrorStorage([["vsfgm:save:primary", "old"]], () => {}, {
    acknowledgmentTimeoutMs: 15,
    onFatal: (error) => fatals.push(error)
  });
  const first = mirror.setItemAsync("vsfgm:save:primary", "new");
  const second = mirror.removeItemAsync("vsfgm:save:primary");
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((result) => result.status === "rejected" && /did not acknowledge/.test(result.reason.message)));
  assert.equal(fatals.length, 1);
  assert.equal(mirror.pendingCount(), 0);
  mirror.acknowledge({ type: "storage-ack", storageId: 1, currentValue: "new" });
  assert.equal(mirror.getItem("vsfgm:save:primary"), "old");
  await assert.rejects(mirror.flush(), /did not acknowledge/);
});

test("legacy synchronous mutations cannot respond before page ACK and reject failed replay", async () => {
  const storage = memoryStorage([["vsfgm:save:primary", "old"]]);
  const harness = workerHarness(({ storage: mirror }) => ({
    request: async () => { mirror.setItem("vsfgm:save:primary", "new"); return { ok: true }; }
  }), { holdAcknowledgments: true });
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage });
  try {
    await transport.ready;
    let finished = false;
    const response = transport.request("/save").then((value) => { finished = true; return value; });
    await waitFor(() => harness.replies.length > 0);
    assert.equal(finished, false);
    assert.equal(Object.hasOwn(harness.replies[0], "currentValue"), false, "ACK does not clone save bytes back to the worker");
    harness.releaseAcknowledgments();
    assert.deepEqual(await response, { ok: true });
    storage.setItem = () => { throw quotaError(); };
    const failing = transport.request("/save");
    await waitFor(() => harness.replies.length > 0);
    harness.releaseAcknowledgments();
    await assert.rejects(failing, /synthetic page quota/);
    assert.equal(harness.scope.localStorage.getItem("vsfgm:save:primary"), "new");
    assert.equal(transport.isAlive(), true, "storage rejection permits a recoverable retry");
  } finally { transport.terminate(); }
});

for (const runtimeThrows of [false, true]) {
  test(`request queue retains a held writer's storage failure through init and concurrent reads${runtimeThrows ? " when the runtime also throws" : ""}`, async () => {
    const posted = [];
    const calls = [];
    let receive;
    let releaseInit;
    let releaseWriter;
    const initHeld = new Promise((resolve) => { releaseInit = resolve; });
    const writerHeld = new Promise((resolve) => { releaseWriter = resolve; });
    const scope = {
      postMessage: (message) => posted.push(message),
      addEventListener: (_type, listener) => { receive = listener; }
    };
    const send = (data) => receive({ data });
    attachLocalRuntimeWorker(scope, {
      loadRuntimeModule: async () => { await initHeld; return {}; },
      createRuntime: ({ storage }) => ({
        request: async (path) => {
          calls.push(path);
          if (path === "/write") {
            storage.setItem("vsfgm:save:primary", "new");
            await writerHeld;
            if (runtimeThrows) throw new Error("writer runtime failed");
          }
          return { status: 200, payload: { ok: true, path, value: storage.getItem("vsfgm:save:primary") } };
        }
      })
    });
    try {
      send({ type: "init", id: 0, storage: [["vsfgm:save:primary", "old"]] });
      send({ type: "request", id: 1, path: "/write" });
      send({ type: "request", id: 2, path: "/read" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(calls, [], "requests wait for runtime initialization");
      releaseInit();
      await waitFor(() => posted.some((message) => message.type === "storage-set"));
      const mutation = posted.find((message) => message.type === "storage-set");
      assert.deepEqual(calls, ["/write"], "read cannot enter while the writer still owns its barrier");
      send({ type: "storage-nack", storageId: mutation.storageId, error: { message: "storage denied" }, currentValue: "old" });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(posted.some((message) => message.id === 2), false, "queued read cannot consume the writer's NACK");
      releaseWriter();
      await waitFor(() => posted.some((message) => message.id === 2));
      const writerReply = posted.find((message) => message.id === 1);
      const readerReply = posted.find((message) => message.id === 2);
      assert.equal(writerReply.type, "response-error");
      assert.match(writerReply.error.message, runtimeThrows ? /writer runtime failed/ : /storage denied/);
      assert.equal(readerReply.type, "response");
      assert.deepEqual(readerReply.response.payload, { ok: true, path: "/read", value: "old" });
      send({ type: "request", id: 3, path: "/next" });
      await waitFor(() => posted.some((message) => message.id === 3));
      assert.equal(posted.find((message) => message.id === 3).type, "response");
      assert.deepEqual(calls, ["/write", "/read", "/next"]);
    } finally {
      releaseInit();
      releaseWriter();
      scope.localStorage?.close();
    }
  });
}

test("diagnostic callback failure does not suppress a storage NACK or hang the request", async () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw quotaError(); };
  const harness = workerHarness(({ storage: mirror }) => ({
    request: async () => { await mirror.setItemAsync("vsfgm:meta:primary", "{}"); return { ok: true }; }
  }));
  const transport = createWorkerTransport({
    createWorker: () => harness.worker, storage,
    onStorageError: () => { throw new Error("diagnostic unavailable"); }
  });
  try {
    await assert.rejects(transport.request("/save"), /synthetic page quota/);
    assert.equal(harness.scope.localStorage.length, 0);
  } finally { transport.terminate(); }
});

test("failed, timed-out and explicitly terminated transports detach and ignore queued late writes", async () => {
  for (const failure of ["init-error", "timeout", "error", "terminate"]) {
    const listeners = new Map();
    let terminations = 0;
    const worker = {
      postMessage() {},
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
      terminate: () => { terminations += 1; }
    };
    const storage = memoryStorage([["vsfgm:save:primary", "old"]]);
    const transport = createWorkerTransport({ createWorker: () => worker, storage, initTimeoutMs: 15 });
    const lateMessage = listeners.get("message");
    if (failure === "init-error") lateMessage({ data: { type: "init-error", error: { message: "failed init" } } });
    else if (failure === "error") listeners.get("error")({ message: "crashed" });
    else if (failure === "terminate") transport.terminate();
    await assert.rejects(transport.ready);
    lateMessage({ data: { type: "storage-set", storageId: 1, key: "vsfgm:save:primary", value: "late" } });
    lateMessage({ data: { type: "ready" } });
    assert.equal(storage.getItem("vsfgm:save:primary"), "old", failure);
    assert.equal(listeners.size, 0, failure);
    assert.equal(terminations, 1, failure);
    transport.terminate();
    assert.equal(terminations, 1, "cleanup is idempotent");
  }
});

test("a worker crash during durable storage rejects pending requests and closes the mirror", async () => {
  const harness = workerHarness(({ storage }) => ({
    request: async () => { await storage.setItemAsync("vsfgm:save:primary", "value"); return { ok: true }; }
  }), { holdAcknowledgments: true });
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage: memoryStorage() });
  const response = transport.request("/save");
  await waitFor(() => harness.replies.length > 0);
  harness.emitError(new Error("worker crashed"));
  await assert.rejects(response, /worker crashed/);
  assert.equal(transport.pendingCount(), 0);
  assert.equal(harness.scope.localStorage.pendingCount(), 0);
  assert.equal(harness.listenerCount(), 0);
  assert.equal(harness.terminations(), 1);
});

test("real browser save failures through worker ACK protocol preserve the old slot and never return success", async () => {
  const snapshot = {
    schemaVersion: 2, rngSeed: 7, currentYear: 2026, currentWeek: 3,
    phase: "regular-season", controlledTeamId: "BUF",
    league: { teams: [{ id: "BUF", abbrev: "BUF", name: "Buffalo" }], players: [] }
  };
  const storage = memoryStorage();
  const oldStore = createBrowserSaveStore({ storage });
  await oldStore.saveSessionToSlot("primary", snapshot);
  const oldBytes = storage.getItem("vsfgm:save:primary");
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === "vsfgm:save:primary" && value !== oldBytes) throw quotaError();
    return originalSet(key, value);
  };
  const harness = workerHarness(({ storage: mirror }) => {
    const store = createBrowserSaveStore({ storage: mirror });
    return { request: async () => {
      const saved = await store.saveSessionToSlot("primary", { ...snapshot, currentWeek: 4 });
      return { ok: true, saved, slots: store.listSaveSlots() };
    } };
  });
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage });
  try {
    await assert.rejects(transport.request("/save"), /Browser storage is full/);
    assert.equal(storage.getItem("vsfgm:save:primary"), oldBytes);
    assert.equal((await oldStore.loadSessionFromSlot("primary")).currentWeek, 3);
    assert.equal(harness.scope.localStorage.getItem("vsfgm:save:primary"), oldBytes);
  } finally { transport.terminate(); }
});

test("hybrid IDB bytes cannot masquerade as a saved slot when page metadata is rejected", async () => {
  const snapshot = {
    schemaVersion: 2, rngSeed: 7, currentYear: 2026, currentWeek: 3,
    phase: "regular-season", controlledTeamId: "BUF",
    league: { teams: [{ id: "BUF", abbrev: "BUF", name: "Buffalo" }], players: [] }
  };
  const hadIndexedDb = Object.hasOwn(globalThis, "indexedDB");
  const previousIndexedDb = globalThis.indexedDB;
  const records = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx = {};
      const request = (run) => {
        const pending = {};
        queueMicrotask(() => {
          pending.result = run();
          pending.onsuccess?.();
          queueMicrotask(() => tx.oncomplete?.());
        });
        return pending;
      };
      tx.objectStore = () => ({
        put: (record) => request(() => { records.set(record.slot, record); return record.slot; }),
        get: (slot) => request(() => records.get(slot)),
        delete: (slot) => request(() => records.delete(slot))
      });
      return tx;
    }
  };
  globalThis.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
    return request;
  } };
  const storage = memoryStorage();
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.startsWith("vsfgm:meta:")) throw quotaError();
    originalSet(key, value);
  };
  let store;
  const harness = workerHarness(({ storage: mirror }) => {
    store = createHybridBrowserSaveStore({ storage: mirror });
    return { request: async () => {
      const saved = await store.saveSessionToSlot("primary", snapshot);
      return { ok: true, saved, slots: store.listSaveSlots() };
    } };
  });
  const transport = createWorkerTransport({ createWorker: () => harness.worker, storage });
  try {
    await assert.rejects(transport.request("/save"), /Browser storage is full/);
    assert.equal(store.listSaveSlots().length, 0);
    assert.equal(storage.getItem("vsfgm:meta:primary"), null);
    assert.equal(storage.getItem("vsfgm:save:primary"), null);
    assert.equal(harness.scope.localStorage.getItem("vsfgm:meta:primary"), null);
    assert.equal(harness.scope.localStorage.getItem("vsfgm:save:primary"), null);
  } finally {
    transport.terminate();
    if (hadIndexedDb) globalThis.indexedDB = previousIndexedDb;
    else delete globalThis.indexedDB;
  }
});
