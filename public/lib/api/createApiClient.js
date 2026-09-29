import { assertApiContract, assertApiContractResponse } from "../apiContract.js";
import { observeBackgroundTask, recordClientDiagnostic } from "../clientDiagnostics.js";

let localRuntimePromise = null;
let localRuntimeKind = null;
let runtimeModeCache = null;
let fallbackAttempted = false;
let fallbackPromise = null;
let serverSessionEstablished = false;
let communityTelemetryPromise = null;

function observeCommunityReceipt(details) {
  if (String(details.method || "GET").toUpperCase() === "GET") return;
  if (!communityTelemetryPromise) {
    communityTelemetryPromise = import("../communityTelemetry.js").then((module) => {
      module.initCommunityTelemetry();
      return module;
    });
  }
  observeBackgroundTask(
    () => communityTelemetryPromise.then((module) => module.observeCommunityApiReceipt(details)),
    {
      surface: "community-telemetry",
      operation: "observe-api-receipt",
      authorityKey: "community-participation",
      severity: "degraded"
    }
  );
}

function readStoredRuntimeMode() {
  try {
    return window.localStorage.getItem("vsfgm:runtime-mode");
  } catch {
    return null;
  }
}

function persistRuntimeMode(mode) {
  try {
    window.localStorage.setItem("vsfgm:runtime-mode", mode);
  } catch {
    // Ignore storage failures.
  }
}

function readDefaultRuntimeMode() {
  const meta = document.querySelector('meta[name="vsfgm-runtime-default"]')?.content;
  return meta === "client" ? "client" : "server";
}

function readServerAvailability() {
  const meta = document.querySelector('meta[name="vsfgm-server-available"]')?.content;
  if (meta === "false") return false;
  if (meta === "true") return true;
  return true;
}

function readServerBaseUrl() {
  const value = document.querySelector('meta[name="vsfgm-server-base-url"]')?.content?.trim();
  return value || "";
}

export function isServerRuntimeAvailable() {
  return readServerAvailability();
}

export function getServerRuntimeBaseUrl() {
  return readServerBaseUrl();
}

function normalizeRuntimeMode(mode) {
  if (mode === "server" && !isServerRuntimeAvailable()) {
    persistRuntimeMode("client");
    runtimeModeCache = "client";
    return runtimeModeCache;
  }
  runtimeModeCache = mode === "client" ? "client" : "server";
  return runtimeModeCache;
}

export function getRuntimeMode() {
  if (runtimeModeCache) return runtimeModeCache;
  const query = new URLSearchParams(window.location.search).get("runtime");
  if (query === "client" || query === "server") {
    const mode = normalizeRuntimeMode(query);
    persistRuntimeMode(mode);
    return mode;
  }
  const stored = readStoredRuntimeMode();
  return normalizeRuntimeMode(stored === "client" ? "client" : readDefaultRuntimeMode());
}

export function setRuntimeMode(mode) {
  const nextMode = normalizeRuntimeMode(mode === "client" ? "client" : "server");
  persistRuntimeMode(nextMode);
  fallbackAttempted = false;
  fallbackPromise = null;
  serverSessionEstablished = false;
  return nextMode;
}

function resolveHttpUrl(path) {
  const baseUrl = getServerRuntimeBaseUrl();
  if (!baseUrl) return path;
  return new URL(path, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function describeNonJsonResponse(path, text, status) {
  if (!isServerRuntimeAvailable()) {
    return "Server-backed mode is unavailable on this deployment. Switch to client-only mode.";
  }
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("<")) {
    return `Server-backed request for ${path} returned HTML instead of JSON (status ${status}).`;
  }
  return `Server-backed request for ${path} returned invalid JSON (status ${status}).`;
}

function buildApiError(message, payload = null, status = null) {
  const error = new Error(message);
  if (payload && typeof payload === "object") {
    error.payload = payload;
    if (payload.reasonCode) error.reasonCode = payload.reasonCode;
  }
  if (status != null) error.status = status;
  return error;
}

async function requestHttp(path, options = {}) {
  if (!isServerRuntimeAvailable()) {
    throw new Error("Server-backed mode is unavailable on this deployment. Switch to client-only mode.");
  }
  // Multi-year server mutations can serialize a full dashboard before replying.
  // Keep reads responsive while allowing those writes to finish without a
  // client-side abort after the server has already committed the action.
  const timeoutMs = options.timeoutMs ?? ((options.method || "GET").toUpperCase() === "GET" ? 15_000 : 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(resolveHttpUrl(path), {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`Server request timed out after ${timeoutMs / 1000}s — is the server running?`);
    }
    throw new Error(`Cannot reach the server — is it running? (${err.message})`);
  }
  clearTimeout(timer);
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(describeNonJsonResponse(path, raw, response.status));
  }
  if (!response.ok || payload.ok === false) {
    throw buildApiError(payload.error || `Request failed: ${response.status}`, payload, response.status);
  }
  serverSessionEstablished = true;
  return payload;
}

async function createInPageRuntime() {
  const moduleCandidates = [
    new URL("../../src/app/api/localApiRuntime.js", import.meta.url),
    new URL("../../../src/app/api/localApiRuntime.js", import.meta.url)
  ];
  let lastError = null;
  for (const candidate of moduleCandidates) {
    try {
      const { createLocalApiRuntime } = await import(candidate);
      return createLocalApiRuntime({ storage: window.localStorage });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load local runtime.");
}

// S109 — the engine runs in a module Worker so simulation never blocks input
// or rendering (localRuntimeWorker.js hosts the same module through the same
// candidates). The transport is lazy: it is only fetched when the worker is
// actually going to be used, so the boot graph does not grow.
async function createWorkerRuntime() {
  const { createWorkerTransport } = await import("./workerTransport.js");
  const transport = createWorkerTransport({
    onStorageError: (error, message) => recordClientDiagnostic({
      surface: "local-runtime",
      operation: "storage-replay",
      error: new Error(`${error?.message || "Storage write failed"} (${message?.key || "?"})`),
      authorityKey: "client",
      severity: "degraded"
    })
  });
  await transport.ready;
  return transport;
}

// Opt out with <meta name="vsfgm-runtime-worker" content="off"> or
// localStorage "vsfgm:runtime-worker" = "off". Module-worker support itself is
// proven by construction: an unsupported `{ type: "module" }` throws or fires
// `error`, and either path falls back to the in-page runtime.
function shouldPreferWorkerRuntime() {
  if (typeof Worker === "undefined") return false;
  try {
    if (document.querySelector('meta[name="vsfgm-runtime-worker"]')?.content === "off") return false;
  } catch {
    // No document: keep going on the storage flag.
  }
  try {
    if (window.localStorage.getItem("vsfgm:runtime-worker") === "off") return false;
  } catch {
    // Storage unavailable: the worker path is still fine.
  }
  return true;
}

const defaultRuntimeFactories = Object.freeze({
  worker: createWorkerRuntime,
  inPage: createInPageRuntime,
  preferWorker: shouldPreferWorkerRuntime
});
let runtimeFactories = defaultRuntimeFactories;

/** Test seam: override how local runtimes are built. Returns a restore function. */
export function configureLocalRuntimeFactories(overrides = {}) {
  const previous = runtimeFactories;
  runtimeFactories = { ...runtimeFactories, ...overrides };
  localRuntimePromise = null;
  localRuntimeKind = null;
  return () => {
    runtimeFactories = previous;
    localRuntimePromise = null;
    localRuntimeKind = null;
  };
}

/** "worker" | "in-page" | null (not yet built). */
export function getLocalRuntimeKind() {
  return localRuntimeKind;
}

async function getLocalRuntime() {
  if (!localRuntimePromise) {
    localRuntimePromise = (async () => {
      if (runtimeFactories.preferWorker()) {
        try {
          const transport = await runtimeFactories.worker();
          localRuntimeKind = "worker";
          return transport;
        } catch (error) {
          recordClientDiagnostic({
            surface: "local-runtime",
            operation: "worker-transport",
            error,
            authorityKey: "client",
            severity: "degraded"
          });
        }
      }
      const runtime = await runtimeFactories.inPage();
      localRuntimeKind = "in-page";
      return runtime;
    })()
      .catch((error) => {
        localRuntimePromise = null;
        localRuntimeKind = null;
        throw error;
      });
  }
  return localRuntimePromise;
}

export function warmLocalRuntime() {
  return getLocalRuntime().then(() => undefined);
}

async function requestLocal(path, options = {}) {
  const runtime = await getLocalRuntime();
  const response = await runtime.request(path, options);
  if (!response.ok || response.payload?.ok === false) {
    throw buildApiError(response.payload?.error || `Request failed: ${response.status}`, response.payload, response.status);
  }
  return response.payload;
}

function canAutoFallbackToClient(error) {
  // Automatic fallback is a bootstrap convenience, not a runtime failover
  // mechanism. Once the server has answered successfully, silently switching
  // authorities would fork the active league into unrelated browser state.
  if (fallbackAttempted || serverSessionEstablished || getRuntimeMode() !== "server") return false;
  if (typeof window === "undefined") return false;
  const protocol = window.location?.protocol || "";
  if (protocol === "file:") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("cannot reach the server") ||
    message.includes("server-backed mode is unavailable")
  );
}

async function retryInClientMode(path, options, error) {
  if (!fallbackPromise) {
    fallbackAttempted = true;
    fallbackPromise = (async () => {
      const mode = setRuntimeMode("client");
      try {
        window.dispatchEvent(new CustomEvent("vsfgm:runtime-fallback", {
          detail: {
            from: "server",
            to: mode,
            reason: error?.message || "Server-backed runtime unavailable."
          }
        }));
      } catch {
        // Ignore event dispatch failures.
      }
      await getLocalRuntime();
    })();
  }
  await fallbackPromise;
  return requestLocal(path, options);
}

export function createApiClient() {
  return async function api(path, options = {}) {
    const method = options.method || "GET";
    assertApiContract(method, path);
    const finalize = (payload) => {
      const validated = assertApiContractResponse(method, path, payload);
      observeCommunityReceipt({
        method,
        path,
        body: options.body || {},
        response: validated,
        runtime: getRuntimeMode()
      });
      return validated;
    };
    if (getRuntimeMode() === "client") return finalize(await requestLocal(path, options));
    try {
      return finalize(await requestHttp(path, options));
    } catch (error) {
      if (canAutoFallbackToClient(error) || fallbackPromise) return finalize(await retryInClientMode(path, options, error));
      throw error;
    }
  };
}
