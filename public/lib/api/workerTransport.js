/**
 * S109 — page-side transport for the client-only runtime hosted in
 * localRuntimeWorker.js. Exposes the SAME `request(path, { method, body })`
 * surface createApiClient.js calls on the in-page runtime, resolving to the
 * same `{ status, ok, payload }` envelope, and replays the worker's storage
 * mirror writes into real localStorage.
 */

/**
 * Keys the runtime reads or writes through its storage handle or the
 * `localStorage` global: save slots and meta (hybrid/browser save stores),
 * rewind index and payloads, commissioner lobby, speedrun challenge and
 * leaderboard. `vsfgm:runtime-mode` and the UI's own keys stay on the page.
 */
export const RUNTIME_STORAGE_KEY_PREFIXES = Object.freeze([
  "vsfgm:save:",
  "vsfgm:meta:",
  "vsfgm-rw-index",
  "vsfgm:rw-state:",
  "vsfgm-commissioner-lobby-v1",
  "vsfgm-speedrun-challenge-v1",
  "speedrunLeaderboard"
]);

export function isRuntimeStorageKey(key) {
  const safeKey = String(key);
  return RUNTIME_STORAGE_KEY_PREFIXES.some((prefix) => safeKey.startsWith(prefix));
}

/** [key, value] pairs of this app's runtime keys, for the worker's mirror. */
export function snapshotRuntimeStorage(storage) {
  const entries = [];
  try {
    for (let index = 0; index < Number(storage.length || 0); index += 1) {
      const key = storage.key(index);
      if (key != null && isRuntimeStorageKey(key)) entries.push([key, storage.getItem(key)]);
    }
  } catch {
    // An unreadable storage yields an empty mirror; the runtime then starts clean.
  }
  return entries;
}

export function applyStorageMessage(storage, message) {
  if (message.type === "storage-set") storage.setItem(message.key, message.value);
  else if (message.type === "storage-remove") storage.removeItem(message.key);
}

function defaultCreateWorker() {
  return new Worker(new URL("./localRuntimeWorker.js", import.meta.url), { type: "module" });
}

function transportError(detail, fallbackMessage) {
  const error = new Error(detail?.message || fallbackMessage);
  if (detail?.name) error.workerErrorName = detail.name;
  if (detail?.code != null) error.code = detail.code;
  if (detail?.reasonCode) error.reasonCode = detail.reasonCode;
  return error;
}

export function createWorkerTransport({
  createWorker = defaultCreateWorker,
  storage = globalThis.window?.localStorage,
  initTimeoutMs = 20_000,
  onStorageError = null
} = {}) {
  const pending = new Map();
  let nextId = 1;
  let dead = null;
  let worker = null;
  let initTimer = null;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // The rejection is always observed — by createApiClient awaiting `ready` and
  // by every request — but possibly on a later tick than it fires.
  // observability-allow-silent: surfaced via `ready` and every request
  ready.catch(() => {});

  function fail(error) {
    if (dead) return;
    dead = error;
    clearTimeout(initTimer);
    worker?.removeEventListener?.("message", onMessage);
    worker?.removeEventListener?.("error", onError);
    worker?.removeEventListener?.("messageerror", onError);
    try { worker?.terminate?.(); } catch { /* already gone */ }
    rejectReady(error);
    for (const [, entry] of pending) entry.reject(error);
    pending.clear();
  }

  function onMessage(event) {
    if (dead) return;
    const message = event?.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "storage-set" || message.type === "storage-remove") {
      let failure = null;
      try {
        if (!isRuntimeStorageKey(message.key)) throw new Error("Worker storage key is outside the runtime namespace.");
        if (!storage) throw new Error("Browser storage is unavailable; this change was not saved.");
        applyStorageMessage(storage, message);
      } catch (error) {
        failure = error;
        // Diagnostics cannot prevent the negative acknowledgment reaching the
        // save store, which owns quota recovery and restoration of old bytes.
        try { onStorageError?.(error, message); } catch { /* the NACK carries the failure */ }
      }
      const reply = { type: failure ? "storage-nack" : "storage-ack", storageId: message.storageId };
      if (failure) reply.error = { name: failure.name, message: failure.message, code: failure.code };
      try {
        // Successful writes already have exact bytes in the worker; do not
        // structured-clone a multi-megabyte save back just to acknowledge it.
        if (failure && storage && isRuntimeStorageKey(message.key)) reply.currentValue = storage.getItem(message.key);
      } catch { /* retain the last acknowledged value when reads are also blocked */ }
      try {
        worker.postMessage(reply);
      } catch (error) {
        fail(error);
      }
      return;
    }
    if (message.type === "ready") {
      clearTimeout(initTimer);
      resolveReady();
      return;
    }
    if (message.type === "init-error" || message.type === "runtime-error") {
      fail(transportError(message.error, "Worker runtime failed to initialise."));
      return;
    }
    if (message.type !== "response" && message.type !== "response-error") return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.type === "response") entry.resolve(message.response);
    else if (message.type === "response-error") entry.reject(transportError(message.error, "Worker runtime request failed."));
  }

  function onError(event) {
    const detail = event?.error || event?.message || event;
    fail(transportError(
      typeof detail === "object" ? detail : { message: String(detail || "") },
      "Background runtime worker crashed. Reload the page to continue from the last automatic backup."
    ));
    try { event?.preventDefault?.(); } catch { /* not cancelable */ }
  }

  try {
    worker = createWorker();
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onError);
    worker.postMessage({ type: "init", id: 0, storage: snapshotRuntimeStorage(storage || { length: 0 }) });
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
  }

  if (!dead && initTimeoutMs > 0) {
    initTimer = setTimeout(() => {
      fail(new Error(`Worker runtime did not become ready within ${initTimeoutMs}ms.`));
    }, initTimeoutMs);
    ready.then(() => clearTimeout(initTimer), () => clearTimeout(initTimer));
  }

  async function send(message) {
    if (dead) throw dead;
    await ready;
    if (dead) throw dead;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ ...message, id });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function request(path, { method = "GET", body = null } = {}) {
    return send({ type: "request", path: String(path), method, body });
  }

  function terminate() {
    fail(new Error("Worker runtime transport terminated."));
  }

  return {
    kind: "worker",
    ready,
    request,
    captureRecoverySnapshot: ({ encode = true } = {}) => send({ type: "recovery-capture", encode }),
    restoreRecoverySnapshot: (encoded, integrity) => send({ type: "recovery-restore", encoded, integrity }),
    terminate,
    isAlive: () => !dead,
    pendingCount: () => pending.size
  };
}
