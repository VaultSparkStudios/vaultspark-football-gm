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
 * app's keys at boot. Every write is applied to the mirror and posted back
 * (`storage-set` / `storage-remove`) so the page replays it into the real
 * localStorage. Messages are FIFO on one port, so a write always lands on the
 * page BEFORE the response of the request that caused it — page-side readers
 * of vsfgm-rw-index (engagementFeatures.checkAndPruneRewindStorage) never see
 * a response ahead of its own writes.
 *
 * IndexedDB is available in workers. hybridSaveStore opens `fa_saves_v2` per
 * operation and closes it when the transaction settles — it never holds a
 * connection and never bumps the version — and the page constructs no runtime
 * of its own while the worker is active, so there is exactly one writer and
 * no second connection to reconcile. It runs in the worker unchanged.
 */

const RUNTIME_MODULE_CANDIDATES = [
  "../../src/app/api/localApiRuntime.js",
  "../../../src/app/api/localApiRuntime.js"
];

function describeError(error) {
  return {
    message: String(error?.message || error || "Worker runtime failure."),
    name: error?.name || "Error",
    stack: typeof error?.stack === "string" ? error.stack.slice(0, 2000) : null
  };
}

/** Storage-shaped in-memory mirror; every write is echoed to `post`. */
export function createMirrorStorage(entries = [], post = () => {}) {
  const data = new Map();
  for (const [key, value] of entries) data.set(String(key), String(value));
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
      const safeKey = String(key);
      const safeValue = String(value);
      data.set(safeKey, safeValue);
      post({ type: "storage-set", key: safeKey, value: safeValue });
    },
    removeItem(key) {
      const safeKey = String(key);
      data.delete(safeKey);
      post({ type: "storage-remove", key: safeKey });
    },
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

/**
 * Bind the message protocol to a worker-like scope ({ postMessage,
 * addEventListener }). Exported so Node can drive it through a MessagePort
 * double; the real worker binds `self` at the bottom of this file.
 */
export function attachLocalRuntimeWorker(scope, { loadRuntimeModule = loadLocalRuntimeModule, createRuntime = null } = {}) {
  let ready = null;
  let runtime = null;
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
    ready = (async () => {
      const mirror = createMirrorStorage(message.storage || [], post);
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
      return runtime;
    })();
    ready.then(
      () => post({ type: "ready", id: message.id }),
      (error) => post({ type: "init-error", id: message.id, error: describeError(error) })
    );
  }

  async function handleRequest(message) {
    try {
      if (!ready) throw new Error("Worker runtime received a request before init.");
      await ready;
      const response = await runtime.request(message.path, { method: message.method || "GET", body: message.body ?? null });
      postResponse(message.id, response);
    } catch (error) {
      post({ type: "response-error", id: message.id, error: describeError(error) });
    }
  }

  scope.addEventListener("message", (event) => {
    const message = event?.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "init") init(message);
    else if (message.type === "request") handleRequest(message);
  });
}

if (typeof self !== "undefined" && typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  attachLocalRuntimeWorker(self);
}
