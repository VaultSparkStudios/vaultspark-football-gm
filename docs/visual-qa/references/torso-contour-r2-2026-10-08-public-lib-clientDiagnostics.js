const DEFAULT_LIMIT = 40;

function sanitizeText(value) {
  return String(value || "Unknown client failure.")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]")
    .replace(/\b(token|secret|api[_-]?key|authorization)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1?[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}

function normalizeLabel(value, fallback) {
  return String(value || fallback).replace(/[^a-z0-9:._-]/gi, "-").slice(0, 80);
}

function isOptionalCapabilityAbsence(error) {
  const status = Number(error?.status || error?.payload?.status || 0);
  const reasonCode = String(error?.reasonCode || error?.payload?.reasonCode || "").toLowerCase();
  return status === 404
    || status === 501
    || reasonCode === "capability-unavailable"
    || reasonCode === "not-implemented";
}

export function createClientDiagnosticsLedger({ limit = DEFAULT_LIMIT, now = () => Date.now() } = {}) {
  const entries = [];
  const listeners = new Set();
  const retryHandlers = new Map();

  const emit = () => {
    const snapshot = api.snapshot();
    for (const listener of listeners) listener(snapshot);
  };

  const api = {
    record({ surface = "client", operation = "unknown", error = null, authorityKey = "", severity = "degraded", retry = null } = {}) {
      const message = sanitizeText(error?.message || error);
      const safeSurface = normalizeLabel(surface, "client");
      const safeOperation = normalizeLabel(operation, "unknown");
      const signature = `${safeSurface}:${safeOperation}:${message}`;
      const timestamp = now();
      const existing = entries.find((entry) => entry.signature === signature);
      if (existing) {
        existing.count += 1;
        existing.lastAt = timestamp;
        existing.authorityKey = sanitizeText(authorityKey);
        existing.severity = normalizeLabel(severity, "degraded");
      } else {
        entries.unshift({
          signature,
          surface: safeSurface,
          operation: safeOperation,
          message,
          authorityKey: sanitizeText(authorityKey),
          severity: normalizeLabel(severity, "degraded"),
          count: 1,
          firstAt: timestamp,
          lastAt: timestamp,
          retryable: typeof retry === "function"
        });
      }
      if (typeof retry === "function") retryHandlers.set(signature, retry);
      entries.splice(Math.max(1, Number(limit) || DEFAULT_LIMIT));
      emit();
      return signature;
    },
    resolve({ surface, operation } = {}) {
      const safeSurface = surface ? normalizeLabel(surface, "client") : null;
      const safeOperation = operation ? normalizeLabel(operation, "unknown") : null;
      let changed = false;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if ((!safeSurface || entry.surface === safeSurface) && (!safeOperation || entry.operation === safeOperation)) {
          retryHandlers.delete(entry.signature);
          entries.splice(index, 1);
          changed = true;
        }
      }
      if (changed) emit();
      return changed;
    },
    clear() {
      entries.splice(0);
      retryHandlers.clear();
      emit();
    },
    async retryAll() {
      const attempts = [...retryHandlers.entries()];
      const results = await Promise.allSettled(attempts.map(([, retry]) => retry()));
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const [signature] = attempts[index];
        const entry = entries.find((row) => row.signature === signature);
        if (entry) api.resolve({ surface: entry.surface, operation: entry.operation });
      });
      return {
        attempted: results.length,
        recovered: results.filter((result) => result.status === "fulfilled").length,
        remaining: entries.length
      };
    },
    snapshot() {
      return {
        status: entries.length ? "degraded" : "healthy",
        unresolved: entries.length,
        retryable: entries.filter((entry) => retryHandlers.has(entry.signature)).length,
        entries: entries.map((entry) => ({ ...entry, retryable: retryHandlers.has(entry.signature) }))
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return api;
}

export const clientDiagnostics = createClientDiagnosticsLedger();
export const recordClientDiagnostic = (entry) => clientDiagnostics.record(entry);
export const resolveClientDiagnostic = (query) => clientDiagnostics.resolve(query);
export const clearClientDiagnostics = () => clientDiagnostics.clear();
export const retryClientDiagnostics = () => clientDiagnostics.retryAll();
export const getClientDiagnosticsSnapshot = () => clientDiagnostics.snapshot();
export const subscribeClientDiagnostics = (listener) => clientDiagnostics.subscribe(listener);

export async function observeBackgroundTask(taskOrFactory, {
  surface = "background",
  operation = "unknown",
  authorityKey = "",
  severity = "degraded",
  retry = null,
  optional = false,
  onError = null,
  onSuccess = null,
  ledger = clientDiagnostics
} = {}) {
  const execute = typeof taskOrFactory === "function"
    ? taskOrFactory
    : () => taskOrFactory;
  const retryHandler = typeof retry === "function"
    ? retry
    : (typeof taskOrFactory === "function" ? execute : null);
  try {
    const value = await execute();
    ledger.resolve({ surface, operation });
    if (typeof onSuccess === "function") onSuccess(value);
    return value;
  } catch (error) {
    if (optional && isOptionalCapabilityAbsence(error)) {
      ledger.resolve({ surface, operation });
      return undefined;
    }
    ledger.record({
      surface,
      operation,
      error,
      authorityKey,
      severity,
      retry: retryHandler
    });
    if (typeof onError === "function") onError(error);
    return undefined;
  }
}
