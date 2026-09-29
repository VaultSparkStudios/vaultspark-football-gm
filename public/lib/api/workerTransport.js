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
    rejectReady(error);
    for (const [, entry] of pending) entry.reject(error);
    pending.clear();
  }

  function onMessage(event) {
    const message = event?.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "storage-set" || message.type === "storage-remove") {
      try {
        if (storage) applyStorageMessage(storage, message);
      } catch (error) {
        // Quota or a blocked storage: the worker's mirror still holds the
        // value, so play continues; the loss is recorded rather than swallowed.
        if (typeof onStorageError === "function") onStorageError(error, message);
      }
      return;
    }
    if (message.type === "ready") {
      resolveReady();
      return;
    }
    if (message.type === "init-error") {
      fail(transportError(message.error, "Worker runtime failed to initialise."));
      return;
    }
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
    const timer = setTimeout(() => {
      fail(new Error(`Worker runtime did not become ready within ${initTimeoutMs}ms.`));
    }, initTimeoutMs);
    ready.then(() => clearTimeout(timer), () => clearTimeout(timer));
  }

  async function request(path, { method = "GET", body = null } = {}) {
    if (dead) throw dead;
    await ready;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ type: "request", id, path: String(path), method, body });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function terminate() {
    try { worker?.terminate?.(); } catch { /* already gone */ }
    fail(new Error("Worker runtime transport terminated."));
  }

  return {
    kind: "worker",
    ready,
    request,
    terminate,
    isAlive: () => !dead,
    pendingCount: () => pending.size
  };
}
