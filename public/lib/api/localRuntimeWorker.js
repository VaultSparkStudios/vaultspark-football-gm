/**
 * S109 — dedicated-worker entry for the client-only runtime.
 *
 * The engine used to run on the page thread (createApiClient.js imported
 * src/app/api/localApiRuntime.js and called it directly), so every
 * simulateWeek blocked input and rendering. This entry hosts the SAME module,
 * loaded through the SAME relative candidates, inside a module Worker; the page
 * talks to it over workerTransport.js.
 *
 * Storage decision: a Worker has no localStorage, so the runtime is given a
 * MIRROR — a Storage-shaped object seeded from the page's snapshot of this
 * app's keys at boot. Save stores await setItemAsync/removeItemAsync: a value
 * becomes committed only after the page acknowledges its real storage write.
 * Legacy synchronous callers retain immediate read-after-write behavior, but
 * each response waits for their writes and rejects on a failed replay.
 *
 * IndexedDB is available in workers. hybridSaveStore opens `fa_saves_v2` per
 * operation and closes it when the transaction settles — it never holds a
 * connection and never bumps the version — and the page constructs no runtime
 * of its own while the worker is active, so there is exactly one writer and
 * no second connection to reconcile. It runs in the worker unchanged.
 */

import { recoverySnapshotBytes, recoverySnapshotIdentity } from "./recoverySnapshotState.js";

const RUNTIME_MODULE_CANDIDATES = [
  "../../src/app/api/localApiRuntime.js",
  "../../../src/app/api/localApiRuntime.js"
];

function describeError(error) {
  return {
    message: String(error?.message || error || "Worker runtime failure."),
    name: error?.name || "Error",
    code: error?.code,
    reasonCode: error?.reasonCode,
    stack: typeof error?.stack === "string" ? error.stack.slice(0, 2000) : null
  };
}

/** Acknowledged storage with a synchronous compatibility view. */
export function createMirrorStorage(entries = [], post = () => {}, {
  acknowledgmentTimeoutMs = 20_000,
  onFatal = null
} = {}) {
  const committed = new Map(entries.map(([key, value]) => [String(key), String(value)]));
  let data = new Map(committed);
  const pending = new Map();
  const syncFailures = [];
  let nextStorageId = 1;
  let closed = null;

  function apply(target, key, value) {
    if (value == null) target.delete(key);
    else target.set(key, value);
  }

  function rebuildView() {
    data = new Map(committed);
    for (const entry of pending.values()) {
      if (entry.optimistic) apply(data, entry.key, entry.value);
    }
  }

  function storageError(detail) {
    const error = new Error(detail?.message || "Browser storage write failed; this change was not saved.");
    if (detail?.name) error.name = detail.name;
    if (detail?.code != null) error.code = detail.code;
    return error;
  }

  function acknowledge(message) {
    if (closed) return;
    const entry = pending.get(message.storageId);
    if (!entry) return;
    pending.delete(message.storageId);
    clearTimeout(entry.timer);
    if (Object.hasOwn(message, "currentValue")) apply(committed, entry.key, message.currentValue);
    else if (message.type === "storage-ack") apply(committed, entry.key, entry.value);
    rebuildView();
    if (message.type === "storage-ack") entry.resolve();
    else {
      const error = storageError(message.error);
      if (entry.optimistic) syncFailures.push(error);
      entry.reject(error);
    }
  }

  function close(error = new Error("Worker storage mirror closed.")) {
    if (closed) return;
    closed = error;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    rebuildView();
  }

  function abort(error) {
    close(error);
    try { onFatal?.(error); } catch { /* pending callers and flush retain the fatal error */ }
  }

  function write(key, value, optimistic) {
    if (closed) throw closed;
    const safeKey = String(key);
    const safeValue = value == null ? null : String(value);
    const storageId = nextStorageId++;
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Synchronous callers cannot observe a Promise; flush reports their errors.
    // Async callers may attach their await on the next tick.
    // observability-allow-silent: failures are surfaced by the caller or flush
    promise.catch(() => {});
    const entry = { key: safeKey, value: safeValue, optimistic, promise, resolve, reject, timer: null };
    pending.set(storageId, entry);
    if (optimistic) apply(data, safeKey, safeValue);
    entry.timer = setTimeout(() => {
      const error = new Error(`Browser storage did not acknowledge its write within ${acknowledgmentTimeoutMs}ms.`);
      abort(error);
    }, acknowledgmentTimeoutMs);
    try {
      post({ type: safeValue == null ? "storage-remove" : "storage-set", storageId, key: safeKey, ...(safeValue == null ? {} : { value: safeValue }) });
    } catch (error) {
      abort(error);
    }
    return promise;
  }

  async function flush() {
    let failure = syncFailures.shift() || null;
    while (pending.size) {
      const entries = [...pending.values()];
      const results = await Promise.allSettled(entries.map((entry) => entry.promise));
      results.forEach((result, index) => {
        if (result.status === "rejected" && entries[index].optimistic) failure ||= result.reason;
      });
    }
    failure ||= syncFailures[0] || closed;
    syncFailures.length = 0;
    if (failure) throw failure;
  }

  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      const safeKey = String(key);
      return data.has(safeKey) ? data.get(safeKey) : null;
    },
    setItem(key, value) {
      write(key, String(value), true);
    },
    removeItem(key) {
      write(key, null, true);
    },
    setItemAsync: (key, value) => write(key, String(value), false),
    removeItemAsync: (key) => write(key, null, false),
    acknowledge,
    flush,
    close,
    pendingCount: () => pending.size,
    clear() {
      for (const key of [...data.keys()]) this.removeItem(key);
    }
  };
}

export async function loadLocalRuntimeModule(baseUrl = import.meta.url) {
  let lastError = null;
  for (const candidate of RUNTIME_MODULE_CANDIDATES) {
    try {
      return await import(new URL(candidate, baseUrl));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load local runtime in worker.");
}

async function loadRecoveryModules() {
  let lastError;
  for (const root of ["../../src/adapters/persistence/", "../../../src/adapters/persistence/"]) {
    try {
      const [codec, integrity] = await Promise.all([
        import(new URL(`${root}snapshotCodec.js`, import.meta.url)),
        import(new URL(`${root}saveStoreShared.js`, import.meta.url))
      ]);
      return { ...codec, ...integrity };
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

/**
 * Bind the message protocol to a worker-like scope ({ postMessage,
 * addEventListener }). Exported so Node can drive it through a MessagePort
 * double; the real worker binds `self` at the bottom of this file.
 */
export function attachLocalRuntimeWorker(scope, {
  loadRuntimeModule = loadLocalRuntimeModule, createRuntime = null, loadRecovery = loadRecoveryModules
} = {}) {
  let ready = null;
  let runtime = null;
  let mirror = null;
  let requestTail = Promise.resolve();
  let recoveryModules;
  const post = (message) => scope.postMessage(message);

  function postResponse(id, response) {
    try {
      post({ type: "response", id, response });
    } catch (cloneError) {
      // A payload the structured-clone algorithm rejects still round-trips as
      // JSON, which is exactly what the HTTP runtime would have produced.
      try {
        post({ type: "response", id, response: JSON.parse(JSON.stringify(response)) });
      } catch (error) {
        post({ type: "response-error", id, error: describeError(error || cloneError) });
      }
    }
  }

  function init(message) {
    if (ready) return;
    ready = (async () => {
      mirror = createMirrorStorage(message.storage || [], post, {
        onFatal: (error) => post({ type: "runtime-error", error: describeError(error) })
      });
      // The runtime module also reads the `localStorage` GLOBAL at import time
      // (commissioner lobby, speedrun challenge). A worker has none, so the
      // mirror is installed under that name BEFORE the module is evaluated.
      try {
        scope.localStorage = mirror;
      } catch {
        // A scope that forbids the assignment simply leaves those two features in-memory.
      }
      const module = await loadRuntimeModule();
      const factory = createRuntime || module.createLocalApiRuntime;
      runtime = factory({ storage: mirror });
      await mirror.flush();
      return runtime;
    })();
    ready.then(
      () => post({ type: "ready", id: message.id }),
      (error) => {
        mirror?.close(error);
        post({ type: "init-error", id: message.id, error: describeError(error) });
      }
    );
  }

  async function recoveryRequest(message) {
    recoveryModules ||= loadRecovery();
    let modules;
    try { modules = await recoveryModules; } catch (error) { recoveryModules = null; throw error; }
    const { buildIntegrityStamp, verifyIntegrityStamp, encodeSnapshot, decodeSnapshot } = modules;
    if (message.type === "recovery-capture") {
      const exported = await runtime.request("/api/snapshot/export", { method: "GET" });
      if (!exported?.ok || exported.payload?.ok === false || !exported.payload?.snapshot) throw new Error("The current franchise could not be checkpointed.");
      // Export contains live league references. Freeze before asynchronous
      // compression so background simulation cannot alter an in-flight receipt.
      const snapshot = JSON.parse(JSON.stringify(exported.payload.snapshot));
      const result = { currentIntegrity: buildIntegrityStamp(recoverySnapshotBytes(snapshot)), identity: recoverySnapshotIdentity(snapshot) };
      if (message.encode !== false) {
        result.encoded = await encodeSnapshot(snapshot);
        if (typeof result.encoded !== "string" || !result.encoded) throw new Error("Snapshot encoding did not return bytes.");
        result.encodedIntegrity = buildIntegrityStamp(result.encoded);
      }
      return result;
    }
    let snapshot;
    try {
      if (typeof message.encoded !== "string" || !message.encoded || !message.integrity ||
          !verifyIntegrityStamp(message.encoded, message.integrity)) throw new Error("Recovery bytes failed integrity verification.");
      snapshot = await decodeSnapshot(message.encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Recovery snapshot is not an object.");
    } catch (cause) {
      throw Object.assign(new Error("The recovery checkpoint in this tab is unreadable.", { cause }), {
        code: "RECOVERY_CORRUPT", reasonCode: "RECOVERY_CORRUPT"
      });
    }
    const identity = recoverySnapshotIdentity(snapshot);
    const response = await runtime.request("/api/snapshot/import", { method: "POST", body: { snapshot } });
    const payload = response?.payload || {};
    // Only the restore receipt crosses the port; the full dashboard and parsed
    // snapshot stay in the worker until the caller requests its normal view.
    return { identity, response: { ok: response?.ok, status: response?.status, payload: {
      ok: payload.ok, error: payload.error, reasonCode: payload.reasonCode,
      state: recoverySnapshotIdentity(payload.state)
    } } };
  }

  async function handleRequest(message) {
    try {
      if (!ready) throw new Error("Worker runtime received a request before init.");
      await ready;
      let response;
      let failure = null;
      try {
        response = message.type === "request"
          ? await runtime.request(message.path, { method: message.method || "GET", body: message.body ?? null })
          : await recoveryRequest(message);
      } catch (error) {
        failure = error;
      }
      // Even a runtime exception must drain its own storage failure before
      // the next request can run against the restored mirror.
      try { await mirror.flush(); } catch (error) { failure ||= error; }
      if (failure) throw failure;
      postResponse(message.id, response);
    } catch (error) {
      post({ type: "response-error", id: message.id, error: describeError(error) });
    }
  }

  scope.addEventListener("message", (event) => {
    const message = event?.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "storage-ack" || message.type === "storage-nack") mirror?.acknowledge(message);
    else if (message.type === "init") init(message);
    else if (["request", "recovery-capture", "recovery-restore"].includes(message.type)) {
      // A request owns the mirror barrier until its response is settled.
      // Otherwise a concurrent read can consume a writer's NACK and report
      // the failure against the read while the failed write returns success.
      // ACK/NACK handling above remains independent of this queue.
      requestTail = requestTail.then(() => handleRequest(message)).catch((error) => {
        mirror?.close(error);
        try { post({ type: "runtime-error", error: describeError(error) }); } catch { /* the port is gone */ }
      });
    }
  });
}

if (typeof self !== "undefined" && typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  attachLocalRuntimeWorker(self);
}
