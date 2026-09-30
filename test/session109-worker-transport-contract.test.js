import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MessageChannel } from "node:worker_threads";

import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { attachLocalRuntimeWorker, createMirrorStorage } from "../public/lib/api/localRuntimeWorker.js";
import {
  createWorkerTransport,
  snapshotRuntimeStorage,
  RUNTIME_STORAGE_KEY_PREFIXES
} from "../public/lib/api/workerTransport.js";
import { clearClientDiagnostics, getClientDiagnosticsSnapshot } from "../public/lib/clientDiagnostics.js";

/**
 * S109 — the engine moved off the page thread into a module Worker. These are
 * the contract tests for the transport that carries it there: the same fixture
 * through the in-page runtime and through the worker protocol must produce
 * byte-equal JSON, the worker's storage mirror must replay into the page
 * exactly, and a dying worker must reject cleanly and fall back.
 *
 * The runtime shard runs every file in one process, so every global this file
 * touches (Date.now, window, document, Worker) is restored when it is done.
 */

const FIXTURE_SEED = 20260306;
const CLOCK_BASE = 1_757_800_000_000;
const REAL_DATE_NOW = Date.now;

after(() => {
  Date.now = REAL_DATE_NOW;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.Worker;
  clearClientDiagnostics();
});

function installDeterministicClock() {
  let tick = 0;
  Date.now = () => CLOCK_BASE + tick++;
  return () => { Date.now = REAL_DATE_NOW; };
}

function createMemoryStorage(backing = new Map()) {
  const storage = {
    backing,
    version: 0, // bumps on every write, so a test can wait for a backup to land
    get length() { return backing.size; },
    key(index) { return [...backing.keys()][index] ?? null; },
    getItem(key) { return backing.has(String(key)) ? backing.get(String(key)) : null; },
    setItem(key, value) { backing.set(String(key), String(value)); storage.version += 1; },
    removeItem(key) { backing.delete(String(key)); storage.version += 1; }
  };
  return storage;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the fire-and-forget auto-backup of a step to land: at least one
 * write since `since` when one is expected (gzip can take longer than any
 * fixed quiet window before its first write), then a quiet period. The base
 * store is byte-bounded, so key COUNT is not a usable signal.
 */
async function settleWrites(read, since, { expectWrite, quietMs = 150, timeoutMs = 20_000 } = {}) {
  const started = REAL_DATE_NOW();
  if (expectWrite) {
    while (read() === since) {
      await sleep(15);
      if (REAL_DATE_NOW() - started > timeoutMs) throw new Error("auto-backup never wrote");
    }
  }
  let last = read();
  let quietSince = REAL_DATE_NOW();
  while (REAL_DATE_NOW() - quietSince < quietMs) {
    await sleep(15);
    const next = read();
    if (next !== last) { last = next; quietSince = REAL_DATE_NOW(); }
    if (REAL_DATE_NOW() - started > timeoutMs) throw new Error("storage never settled");
  }
}

/**
 * A Worker double: the page-facing object exposes the `Worker` surface the
 * transport uses; the worker-facing scope is what localRuntimeWorker.js binds.
 * Both ends are Node MessagePorts, so messages are structured-cloned exactly as
 * a browser would clone them.
 */
function createFakeWorker({ createRuntime = null, loadRuntimeModule } = {}) {
  const channel = new MessageChannel();
  const pageSide = channel.port1;
  const workerSide = channel.port2;
  const listeners = { message: [], error: [], messageerror: [] };
  pageSide.on("message", (data) => { for (const listener of listeners.message) listener({ data }); });
  const worker = {
    postMessage: (message) => pageSide.postMessage(message),
    addEventListener: (type, listener) => { listeners[type]?.push(listener); },
    terminate: () => { pageSide.close(); workerSide.close(); },
    emitError: (error) => { for (const listener of listeners.error) listener({ error, message: error.message }); }
  };
  const scope = {
    postMessage: (message) => workerSide.postMessage(message),
    addEventListener: (type, listener) => {
      if (type === "message") workerSide.on("message", (data) => listener({ data }));
    }
  };
  attachLocalRuntimeWorker(scope, {
    createRuntime,
    loadRuntimeModule: loadRuntimeModule || (async () => ({ createLocalApiRuntime }))
  });
  return { worker, scope, close: worker.terminate };
}

/**
 * Runs the fixture and returns each response AS JSON, serialised the moment it
 * arrives. The in-page runtime hands back live references (the dashboard's
 * `observability` block IS the league's counter object, so a response mutates
 * when the next request bumps `api-request`); the worker structured-clones at
 * post time, exactly as the HTTP server serialises. Parity is a property of
 * the response at receipt.
 */
async function runFixture(request, readWriteVersion) {
  const responses = [];
  const step = async (routePath, options, { expectWrite }) => {
    const since = readWriteVersion();
    responses.push(JSON.stringify(await request(routePath, options)));
    // Each step's automatic backup must finish before the next step's clock
    // reads, or the two paths would interleave `now()` calls differently.
    await settleWrites(readWriteVersion, since, { expectWrite });
  };
  await step("/api/new-league", {
    method: "POST",
    body: { seed: FIXTURE_SEED, startYear: 2026, controlledTeamId: "BUF", mode: "drive" }
  }, { expectWrite: true });
  await step("/api/advance-week", { method: "POST", body: { count: 1 } }, { expectWrite: true });
  await step("/api/advance-week", { method: "POST", body: { count: 1 } }, { expectWrite: true });
  await step("/api/state", undefined, { expectWrite: false });
  return responses;
}

test("session109: worker transport yields byte-equal JSON and an exact storage replay", async () => {
  // ── in-page runtime ──────────────────────────────────────────────────────
  let restoreClock = installDeterministicClock();
  const inPageStorage = createMemoryStorage();
  let inPageResponses;
  try {
    const runtime = createLocalApiRuntime({ storage: inPageStorage, scheduler: (fn) => fn() });
    inPageResponses = await runFixture((p, o) => runtime.request(p, o), () => inPageStorage.version);
  } finally {
    restoreClock();
  }

  // ── worker transport (double) ────────────────────────────────────────────
  restoreClock = installDeterministicClock();
  const replayStorage = createMemoryStorage();
  const storageOps = [];
  const fake = createFakeWorker();
  let workerResponses;
  try {
    fake.worker.addEventListener("message", ({ data }) => {
      if (data?.type === "storage-set" || data?.type === "storage-remove") storageOps.push(data);
    });
    const transport = createWorkerTransport({ createWorker: () => fake.worker, storage: replayStorage });
    await transport.ready;
    workerResponses = await runFixture((p, o) => transport.request(p, o), () => replayStorage.version);
    transport.terminate();
  } finally {
    restoreClock();
    fake.close();
  }

  // (1) same responses, byte for byte.
  assert.equal(inPageResponses.length, workerResponses.length);
  inPageResponses.forEach((json, index) => {
    const parsed = JSON.parse(json);
    assert.equal(parsed.status, 200, `step ${index} in-page status`);
    assert.ok(json.length > 100_000, `step ${index} carries a real payload`);
    assert.equal(workerResponses[index] === json, true, `step ${index} JSON parity (${json.length} bytes)`);
  });
  assert.equal(JSON.parse(inPageResponses[3]).payload.currentWeek, 3);

  // (2) the mirror's writes replayed into the page exactly as the in-page
  //     runtime wrote them: same keys, same values, same order.
  assert.ok(storageOps.length > 0, "the worker must have posted storage writes");
  assert.ok(storageOps.every((op) => RUNTIME_STORAGE_KEY_PREFIXES.some((prefix) => op.key.startsWith(prefix))));
  assert.deepEqual([...replayStorage.backing.entries()], [...inPageStorage.backing.entries()]);
  assert.ok(inPageStorage.backing.size >= 2, "auto-backups must have landed in both stores");
});

test("session109: the mirror seeds from the page snapshot and only this app's keys travel", () => {
  const page = createMemoryStorage(new Map([
    ["vsfgm:meta:auto-1", "{}"],
    ["vsfgm:save:auto-1", "abc"],
    ["vsfgm-rw-index", "[]"],
    ["speedrunLeaderboard", "[]"],
    ["vsfgm:runtime-mode", "client"],
    ["vsfgm:tutorial-seen:v2", "1"],
    ["unrelated", "x"]
  ]));
  const entries = snapshotRuntimeStorage(page);
  assert.deepEqual(entries.map(([key]) => key).sort(), ["speedrunLeaderboard", "vsfgm-rw-index", "vsfgm:meta:auto-1", "vsfgm:save:auto-1"]);
  const posted = [];
  const mirror = createMirrorStorage(entries, (message) => posted.push(message));
  assert.equal(mirror.length, 4);
  assert.equal(mirror.getItem("vsfgm:save:auto-1"), "abc");
  mirror.setItem("vsfgm-rw-index", "[1]");
  mirror.removeItem("vsfgm:save:auto-1");
  assert.deepEqual(posted, [
    { type: "storage-set", storageId: 1, key: "vsfgm-rw-index", value: "[1]" },
    { type: "storage-remove", storageId: 2, key: "vsfgm:save:auto-1" }
  ]);
  for (const message of posted) mirror.acknowledge({ type: "storage-ack", storageId: message.storageId });
  assert.equal(mirror.getItem("vsfgm:save:auto-1"), null);
});

test("session109: a worker error rejects pending and future requests", async () => {
  const fake = createFakeWorker({ createRuntime: () => ({ request: () => new Promise(() => {}) }) });
  try {
    const transport = createWorkerTransport({ createWorker: () => fake.worker, storage: createMemoryStorage() });
    await transport.ready;
    const pending = transport.request("/api/state");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(transport.pendingCount(), 1);
    fake.worker.emitError(new Error("worker exploded"));
    await assert.rejects(pending, /worker exploded/);
    assert.equal(transport.pendingCount(), 0);
    assert.equal(transport.isAlive(), false);
    await assert.rejects(() => transport.request("/api/state"), /worker exploded/);
  } finally {
    fake.close();
  }
});

test("session109: init failure and init timeout reject `ready` instead of hanging", async () => {
  const failing = createFakeWorker({ loadRuntimeModule: async () => { throw new Error("no engine here"); } });
  try {
    const transport = createWorkerTransport({ createWorker: () => failing.worker, storage: createMemoryStorage() });
    await assert.rejects(transport.ready, /no engine here/);
    await assert.rejects(() => transport.request("/api/state"), /no engine here/);
  } finally {
    failing.close();
  }

  const silent = createWorkerTransport({
    createWorker: () => ({ postMessage() {}, addEventListener() {}, terminate() {} }),
    storage: createMemoryStorage(),
    initTimeoutMs: 30
  });
  await assert.rejects(silent.ready, /did not become ready/);

  const throwing = createWorkerTransport({
    createWorker: () => { throw new Error("module workers unsupported"); },
    storage: createMemoryStorage()
  });
  await assert.rejects(throwing.ready, /module workers unsupported/);
});

function createMetaDocument(metaMap) {
  return {
    querySelector(selector) {
      const match = selector.match(/meta\[name="([^"]+)"\]/);
      if (!match) return null;
      const content = metaMap[match[1]];
      return content == null ? null : { content };
    }
  };
}

async function importClientModule() {
  const modulePath = pathToFileURL(path.resolve("public/lib/api/createApiClient.js")).toString();
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

function installClientMode(storage) {
  globalThis.window = { localStorage: storage, location: { protocol: "http:", search: "" }, dispatchEvent() { return true; } };
  globalThis.document = createMetaDocument({
    "vsfgm-runtime-default": "client",
    "vsfgm-server-available": "false",
    "vsfgm-server-base-url": ""
  });
}

test("session109: createApiClient falls back to the in-page runtime when the worker factory fails, and records it", async () => {
  const storage = createMemoryStorage();
  installClientMode(storage);
  globalThis.Worker = function FakeWorkerCtor() {};
  clearClientDiagnostics();
  try {
    const { createApiClient, configureLocalRuntimeFactories, getLocalRuntimeKind } = await importClientModule();
    const restore = configureLocalRuntimeFactories({
      worker: async () => { throw new Error("module workers unsupported here"); }
    });
    try {
      const api = createApiClient();
      const payload = await api("/api/setup/init");
      assert.equal(payload.ok, true);
      assert.equal(payload.diagnostics?.setup?.runtime, "browser");
      assert.equal(getLocalRuntimeKind(), "in-page");
      const ledger = getClientDiagnosticsSnapshot();
      const entry = ledger.entries.find((row) => row.surface === "local-runtime" && row.operation === "worker-transport");
      assert.ok(entry, "the fallback must be recorded in clientDiagnostics");
      assert.match(entry.message, /module workers unsupported here/);
    } finally {
      restore();
    }
  } finally {
    delete globalThis.Worker;
    delete globalThis.window;
    delete globalThis.document;
    clearClientDiagnostics();
  }
});

test("session109: createApiClient prefers the worker when eligible and honours the opt-out flag", async () => {
  const storage = createMemoryStorage();
  installClientMode(storage);
  globalThis.Worker = function FakeWorkerCtor() {};
  const fake = createFakeWorker();
  try {
    const { createApiClient, configureLocalRuntimeFactories, getLocalRuntimeKind } = await importClientModule();
    const restore = configureLocalRuntimeFactories({
      worker: async () => {
        const transport = createWorkerTransport({ createWorker: () => fake.worker, storage });
        await transport.ready;
        return transport;
      }
    });
    try {
      const api = createApiClient();
      const payload = await api("/api/setup/init");
      assert.equal(payload.ok, true);
      assert.equal(getLocalRuntimeKind(), "worker");
    } finally {
      restore();
    }

    // Opt-out flag: the same eligible environment must build the in-page runtime.
    storage.setItem("vsfgm:runtime-worker", "off");
    const restoreOptOut = configureLocalRuntimeFactories({
      worker: async () => { throw new Error("worker factory must not run when opted out"); }
    });
    try {
      const api = createApiClient();
      const payload = await api("/api/setup/init");
      assert.equal(payload.ok, true);
      assert.equal(getLocalRuntimeKind(), "in-page");
      assert.ok(!getClientDiagnosticsSnapshot().entries.some((row) => row.operation === "worker-transport"));
    } finally {
      restoreOptOut();
    }
  } finally {
    fake.close();
    delete globalThis.Worker;
    delete globalThis.window;
    delete globalThis.document;
    clearClientDiagnostics();
  }
});

test("session109: without a Worker global the default behaviour is the in-page runtime", async () => {
  const storage = createMemoryStorage();
  installClientMode(storage);
  assert.equal(typeof globalThis.Worker, "undefined");
  try {
    const { createApiClient, getLocalRuntimeKind } = await importClientModule();
    const api = createApiClient();
    const payload = await api("/api/setup/init");
    assert.equal(payload.ok, true);
    assert.equal(getLocalRuntimeKind(), "in-page");
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
