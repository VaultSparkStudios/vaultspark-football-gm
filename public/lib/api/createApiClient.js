let localRuntimePromise = null;
let runtimeModeCache = null;

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
  const response = await fetch(resolveHttpUrl(path), {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
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
  return payload;
}

async function getLocalRuntime() {
  if (!localRuntimePromise) {
    localRuntimePromise = import(new URL("../../src/app/api/localApiRuntime.js", import.meta.url))
      .then(({ createLocalApiRuntime }) => createLocalApiRuntime({ storage: window.localStorage }))
      .catch((error) => {
        localRuntimePromise = null;
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

export function createApiClient() {
  return async function api(path, options = {}) {
    if (getRuntimeMode() === "client") {
      return requestLocal(path, options);
    }
    return requestHttp(path, options);
  };
}
