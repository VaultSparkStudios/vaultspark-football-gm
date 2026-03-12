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

export function getRuntimeMode() {
  if (runtimeModeCache) return runtimeModeCache;
  const query = new URLSearchParams(window.location.search).get("runtime");
  if (query === "client" || query === "server") {
    persistRuntimeMode(query);
    runtimeModeCache = query;
    return runtimeModeCache;
  }
  runtimeModeCache = readStoredRuntimeMode() === "client" ? "client" : readDefaultRuntimeMode();
  return runtimeModeCache;
}

export function setRuntimeMode(mode) {
  const nextMode = mode === "client" ? "client" : "server";
  persistRuntimeMode(nextMode);
  runtimeModeCache = nextMode;
  return runtimeModeCache;
}

async function requestHttp(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
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
    throw new Error(response.payload?.error || `Request failed: ${response.status}`);
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
