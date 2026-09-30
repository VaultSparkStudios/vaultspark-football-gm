import { observeBackgroundTask } from "../clientDiagnostics.js";
import { recoverySnapshotBytes as referenceBytes, recoverySnapshotIdentity } from "./recoverySnapshotState.js";

export const CLIENT_SESSION_RECOVERY_KEY = "vsfgm:client-session:v1";
export const CLIENT_SESSION_PENDING_KEY = "vsfgm:client-session:pending:v1";

export function wrapBrowserClientRuntime(runtime, onStatus) {
  let storage;
  try { storage = window.sessionStorage; }
  catch (error) {
    storage = {
      getItem() { throw error; },
      setItem() { throw error; },
      removeItem() { throw error; }
    };
  }
  const wrapped = createClientSessionRecovery({
    runtime, storage, onStatus: (status) => {
      onStatus(status);
      if (["unsaved", "recovery-required"].includes(status.status) || status.backgroundRunning || status.interruptedJob) {
        observeBackgroundTask(
          () => import("../clientRecoveryUi.js").then(module => module.mountClientRecoveryUi()),
          { surface: "browser-recovery", operation: "load-notice", authorityKey: "client" }
        );
      }
    },
    requireCheckpoint: new URLSearchParams(window.location.search).get("resume") === "tab"
  });
  window.addEventListener("beforeunload", (event) => {
    const status = wrapped.getStatus();
    if (status.dirty || ["pending", "unsaved"].includes(status.status) || status.backgroundRunning) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  return wrapped;
}
const VERSION = 1;
const ACCESSIBLE_READS = new Set(["/api/setup/init", "/api/saves", "/api/backups"]);
const STATEFUL_READS = new Set(["/api/realism/verify"]);
const REPLACEMENTS = new Set(["/api/new-league", "/api/saves/load", "/api/backups/load", "/api/snapshot/import"]);
const UNRESTORABLE_CHECKPOINT_ERRORS = new Set([
  "RECOVERY_CORRUPT", "RECOVERY_REFERENCE_CHANGED", "RECOVERY_REFERENCE_UNAVAILABLE",
  "RECOVERY_RESTORE_FAILED", "RECOVERY_IDENTITY_MISMATCH"
]);
const CHECKPOINT_EXCLUSIONS = new Set([
  "/api/trade/evaluate", "/api/snapshot/inspect", "/api/saves/save", "/api/saves/delete",
  "/api/backups/delete", "/api/rewind/snapshot", "/api/rewind/delete"
]);

export class ClientSessionRecoveryError extends Error {
  constructor(message, reasonCode, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "ClientSessionRecoveryError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
  }
}

const recoveryError = (message, code, cause) => new ClientSessionRecoveryError(message, code, cause);
const successful = response => response?.ok === true && response.payload?.ok !== false;
const pathname = value => new URL(value, "http://local").pathname;
function quotaFailure(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
    if (current.name === "QuotaExceededError" || current.code === 22 || current.code === 1014) return true;
  }
  return false;
}
function validIntegrity(integrity) {
  return Boolean(integrity?.algo === "fnv1a32" && /^[a-f0-9]{8}$/.test(integrity.checksum || "") &&
    Number.isInteger(integrity.length) && integrity.length > 0);
}
function sameIntegrity(actual, expected) {
  return validIntegrity(actual) && validIntegrity(expected) &&
    actual.algo === expected.algo && actual.checksum === expected.checksum && actual.length === expected.length;
}
function validReference(reference) {
  return Boolean(reference && /^[a-z0-9_-]{1,64}$/.test(reference.slot || "") &&
    ["/api/saves/load", "/api/backups/load"].includes(reference.loadRoute) &&
    validIntegrity(reference.integrity) && validIntegrity(reference.sourceIntegrity));
}
let sharedPromise;
async function loadShared() {
  sharedPromise ||= (async () => {
    let lastError;
    for (const candidate of [
      new URL("../../src/adapters/persistence/saveStoreShared.js", import.meta.url),
      new URL("../../../src/adapters/persistence/saveStoreShared.js", import.meta.url)
    ]) {
      try { return await import(candidate); } catch (error) { lastError = error; }
    }
    throw lastError;
  })();
  try { return await sharedPromise; } catch (error) { sharedPromise = null; throw error; }
}

/**
 * Per-tab navigation/reload recovery, not a manual save or a tab-close guarantee.
 * Internal requests deliberately use the unwrapped runtime. One queue owns both
 * the action and its checkpoint, so a later action cannot publish an older state.
 */
export function createClientSessionRecovery({
  runtime,
  storage,
  onStatus = () => {},
  encode,
  decode,
  requireCheckpoint = false,
  now = () => Date.now()
} = {}) {
  if (typeof runtime?.request !== "function") throw new TypeError("Recovery requires a raw runtime.request function.");
  const workerRecovery = typeof runtime.captureRecoverySnapshot === "function" && typeof runtime.restoreRecoverySnapshot === "function";
  let queue = Promise.resolve();
  let codecPromise;
  let restored = false;
  let hasSession = false;
  let hasCheckpoint = false;
  let dirty = false;
  let interruptedJob = false;
  let jobRecords = [];
  let durableReference = null;
  const jobSignatures = new Map();
  let status = { status: "idle", message: "No recovery checkpoint in this tab.", dirty: false, canRestorePrevious: false, backgroundRunning: false, interruptedJob: false };

  function emit(next) {
    status = { ...status, reasonCode: null, ...next, dirty,
      canRestorePrevious: hasCheckpoint && !UNRESTORABLE_CHECKPOINT_ERRORS.has(next.reasonCode),
      backgroundRunning: jobRecords.some(job => job.status === "queued" || job.status === "running"), interruptedJob };
    try { onStatus({ ...status }); } catch { /* A UI observer cannot change whether an action committed. */ }
  }
  function serialize(run) {
    const operation = queue.then(run);
    // The caller owns the rejection; subsequent recovery work must still run.
    queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  function getStorage() {
    try {
      const candidate = storage === undefined ? globalThis.sessionStorage : storage;
      if (!candidate || typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function" || typeof candidate.removeItem !== "function") throw new Error("Storage is unavailable.");
      return candidate;
    } catch (cause) {
      throw recoveryError("This tab cannot access its recovery storage. Your saved franchises are still available from setup.", "RECOVERY_STORAGE_UNAVAILABLE", cause);
    }
  }
  function read(key) {
    try { return getStorage().getItem(key); }
    catch (cause) { throw recoveryError("This tab could not read its recovery checkpoint.", "RECOVERY_STORAGE_UNAVAILABLE", cause); }
  }
  function writeVerified(key, value) {
    const target = getStorage();
    let previous;
    try { previous = target.getItem(key); }
    catch (cause) { throw recoveryError("This tab could not read its recovery storage before saving.", "RECOVERY_STORAGE_UNAVAILABLE", cause); }
    try {
      if (value === null) target.removeItem(key);
      else target.setItem(key, value);
      if (target.getItem(key) !== value) throw new Error("Recovery storage readback did not match.");
    } catch (cause) {
      // Native Storage writes are atomic. Restore the previous bytes as well
      // when a faulty adapter or failed readback makes that outcome uncertain.
      try {
        if (previous === null) target.removeItem(key);
        else target.setItem(key, previous);
      } catch { /* Keep the pending marker; a fresh page must refuse silent rollback. */ }
      throw recoveryError("This tab could not verify its recovery checkpoint. Keep the page open and retry saving.", "RECOVERY_WRITE_FAILED", cause);
    }
  }
  async function codecs() {
    if (encode && decode) return { encodeSnapshot: encode, decodeSnapshot: decode };
    codecPromise ||= (async () => {
      let lastError;
      for (const candidate of [
        new URL("../../src/adapters/persistence/snapshotCodec.js", import.meta.url),
        new URL("../../../src/adapters/persistence/snapshotCodec.js", import.meta.url)
      ]) {
        try { return await import(candidate); } catch (error) { lastError = error; }
      }
      throw lastError;
    })();
    let module;
    try { module = await codecPromise; } catch (error) { codecPromise = null; throw error; }
    return { encodeSnapshot: encode || module.encodeSnapshot, decodeSnapshot: decode || module.decodeSnapshot };
  }
  function markPending(operation) {
    const marker = JSON.stringify({ version: VERSION, startedAt: now(), operation });
    writeVerified(CLIENT_SESSION_PENDING_KEY, marker);
    return marker;
  }
  async function captureSnapshot(includeEncoded) {
    if (workerRecovery) {
      const captured = await runtime.captureRecoverySnapshot({ encode: includeEncoded });
      if (!validIntegrity(captured?.currentIntegrity) || !captured?.identity) throw recoveryError("The current franchise could not be checkpointed.", "RECOVERY_EXPORT_FAILED");
      return captured;
    }
    const { buildIntegrityStamp } = await loadShared();
    const exported = await runtime.request("/api/snapshot/export", { method: "GET" });
    if (!successful(exported) || !exported.payload?.snapshot) throw recoveryError("The current franchise could not be checkpointed.", "RECOVERY_EXPORT_FAILED");
    // The fallback exports live references. Freeze before any codec await.
    const snapshot = typeof structuredClone === "function"
      ? structuredClone(exported.payload.snapshot) : JSON.parse(JSON.stringify(exported.payload.snapshot));
    const captured = { currentIntegrity: buildIntegrityStamp(referenceBytes(snapshot)), identity: recoverySnapshotIdentity(snapshot) };
    if (includeEncoded) {
      const { encodeSnapshot } = await codecs();
      captured.encoded = await encodeSnapshot(snapshot);
      captured.encodedIntegrity = buildIntegrityStamp(captured.encoded);
    }
    return captured;
  }
  async function readEnvelope() {
    const raw = read(CLIENT_SESSION_RECOVERY_KEY);
    if (raw === null) { hasCheckpoint = false; return null; }
    try {
      const envelope = JSON.parse(raw);
      if (envelope.version !== VERSION) throw new Error("Unsupported recovery envelope version.");
      if (envelope.reference != null && !validReference(envelope.reference)) throw new Error("Invalid saved-franchise reference.");
      if (envelope.kind === "save-reference") {
        const reference = envelope.reference;
        if (!validReference(reference)) throw new Error("Invalid saved-franchise reference.");
        hasCheckpoint = true;
        return { envelope, reference };
      }
      if (envelope.kind != null && envelope.kind !== "snapshot") throw new Error("Unsupported recovery envelope kind.");
      const { verifyIntegrityStamp } = await loadShared();
      if (typeof envelope.snapshot !== "string" || !envelope.snapshot ||
          !envelope.integrity || !verifyIntegrityStamp(envelope.snapshot, envelope.integrity)) throw new Error("Recovery envelope failed integrity verification.");
      if (workerRecovery) {
        hasCheckpoint = true;
        return { envelope, encoded: envelope.snapshot };
      }
      const { decodeSnapshot } = await codecs();
      const snapshot = await decodeSnapshot(envelope.snapshot);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Recovery snapshot is not an object.");
      hasCheckpoint = true;
      return { envelope, snapshot };
    } catch (cause) {
      hasCheckpoint = false;
      throw recoveryError("The recovery checkpoint in this tab is unreadable. Choose a saved franchise or start a new one from setup.", "RECOVERY_CORRUPT", cause);
    }
  }
  async function importCheckpoint(saved) {
    let response;
    let identity;
    if (saved.reference) {
      response = await runtime.request(saved.reference.loadRoute, { method: "POST", body: {
        slot: saved.reference.slot, expectedSavedSnapshotIntegrity: saved.reference.sourceIntegrity
      } });
      if (!successful(response)) {
        const changed = response?.payload?.reasonCode === "RECOVERY_REFERENCE_CHANGED";
        throw recoveryError(changed ? "The selected saved checkpoint has changed. Choose a saved franchise explicitly from setup." :
          "The selected saved checkpoint is unavailable. Choose a saved franchise explicitly from setup.",
        changed ? "RECOVERY_REFERENCE_CHANGED" : "RECOVERY_REFERENCE_UNAVAILABLE");
      }
      // The runtime verifies the decoded durable snapshot before constructing
      // a session. Restore can legitimately refresh derived weekly plans, so
      // its re-export is not the authority for which saved bytes were selected.
      if (!sameIntegrity(response.payload?.savedSnapshotIntegrity, saved.reference.sourceIntegrity)) {
        throw recoveryError("The selected saved checkpoint could not be verified. Choose a saved franchise explicitly from setup.", "RECOVERY_REFERENCE_CHANGED");
      }
      const captured = await captureSnapshot(false);
      identity = captured.identity;
      durableReference = { ...saved.reference, sourceIntegrity: { ...saved.reference.sourceIntegrity },
        integrity: captured.currentIntegrity };
    } else {
      if (workerRecovery) {
        const restoredSnapshot = await runtime.restoreRecoverySnapshot(saved.encoded, saved.envelope.integrity);
        response = restoredSnapshot?.response;
        identity = restoredSnapshot?.identity;
      } else {
        response = await runtime.request("/api/snapshot/import", { method: "POST", body: { snapshot: saved.snapshot } });
        identity = recoverySnapshotIdentity(saved.snapshot);
      }
      if (!successful(response)) throw recoveryError(response?.payload?.error || "The recovery checkpoint could not be restored.", "RECOVERY_RESTORE_FAILED");
      durableReference = saved.envelope.reference || null;
    }
    // The runtime validates/migrates snapshots; also refuse a successful response
    // which visibly substituted a different franchise or point in its season.
    for (const field of ["controlledTeamId", "startYear", "currentYear", "currentWeek", "phase", "mode"]) {
      if (identity?.[field] != null && response.payload?.state?.[field] != null && identity[field] !== response.payload.state[field]) {
        throw recoveryError("The restored franchise does not match this tab's checkpoint.", "RECOVERY_IDENTITY_MISMATCH");
      }
    }
    if (!identity) throw recoveryError("The restored franchise identity could not be verified.", "RECOVERY_IDENTITY_MISMATCH");
    const expectedFranchise = identity.franchiseId;
    const actualFranchise = response.payload?.state?.franchiseId || response.payload?.state?.franchiseKey;
    if (expectedFranchise && actualFranchise && expectedFranchise !== actualFranchise) {
      throw recoveryError("The restored franchise seed does not match this tab's checkpoint.", "RECOVERY_IDENTITY_MISMATCH");
    }
    hasSession = true;
    interruptedJob = Boolean(saved.envelope.backgroundSimulation?.inProgress || saved.envelope.backgroundSimulation?.interrupted);
    return response;
  }
  async function ensureRestored() {
    if (restored) return;
    try {
      const pending = read(CLIENT_SESSION_PENDING_KEY);
      const saved = await readEnvelope();
      if (requireCheckpoint && !saved) throw recoveryError("The expected recovery checkpoint is missing from this tab. Choose a saved franchise or start a new one.", "RECOVERY_MISSING");
      if (pending !== null) throw recoveryError(
        saved ? "An action was interrupted before its recovery checkpoint was confirmed. Restore the previous checkpoint explicitly or choose a saved franchise." : "An action was interrupted and this tab has no confirmed recovery checkpoint. Choose a saved franchise or start a new one.",
        saved ? "RECOVERY_PENDING" : "RECOVERY_MISSING"
      );
      if (saved) await importCheckpoint(saved);
      restored = true;
      emit({ status: saved ? "ready" : "idle", message: saved ? (interruptedJob ? "Restored the last observed checkpoint. The interrupted background simulation was not resumed." : "Restored this tab's recovery checkpoint.") : "No recovery checkpoint in this tab." });
    } catch (error) {
      emit({ status: "recovery-required", message: error.message, reasonCode: error.reasonCode || "RECOVERY_RESTORE_FAILED" });
      throw error;
    }
  }
  function observeJobs(response) {
    const payload = response?.payload || {};
    const rows = Array.isArray(payload.jobs) ? payload.jobs : payload.job ? [payload.job] : [];
    const records = rows.slice(0, 30).filter(job => job && typeof job.id === "string").map(job => ({
      id: job.id, status: String(job.status || "unknown"), completedSeasons: Number(job.completedSeasons) || 0,
      totalSeasons: Number(job.totalSeasons) || 0
    }));
    const changed = records.some(job => jobSignatures.get(job.id) !== JSON.stringify(job)) ||
      (Array.isArray(payload.jobs) && records.length === 0 && jobRecords.length > 0);
    if (records.length || Array.isArray(payload.jobs)) jobRecords = records;
    return { changed, records };
  }
  function confirmJobs(records) {
    for (const job of records) jobSignatures.set(job.id, JSON.stringify(job));
    while (jobSignatures.size > 30) jobSignatures.delete(jobSignatures.keys().next().value);
  }
  async function checkpoint(operation, { pendingWritten = false, referenceCandidate = null } = {}) {
    try {
      if (!pendingWritten) markPending(operation);
      dirty = true;
      emit({ status: "pending", message: "Updating this tab's recovery checkpoint." });
      const { verifyIntegrityStamp, safeSlotName } = await loadShared();
      const captured = await captureSnapshot(true);
      const inProgress = jobRecords.some(job => job.status === "queued" || job.status === "running");
      if (referenceCandidate && !inProgress && validIntegrity(referenceCandidate.sourceIntegrity)) {
        const slot = safeSlotName(referenceCandidate.slot);
        if (slot) durableReference = { slot, loadRoute: referenceCandidate.loadRoute,
          sourceIntegrity: { ...referenceCandidate.sourceIntegrity }, integrity: captured.currentIntegrity };
      }
      const matchingReference = !inProgress && durableReference && sameIntegrity(captured.currentIntegrity, durableReference.integrity) ? durableReference : null;
      const encoded = captured.encoded;
      if (typeof encoded !== "string" || !encoded || !validIntegrity(captured.encodedIntegrity) ||
          !verifyIntegrityStamp(encoded, captured.encodedIntegrity)) throw new Error("Snapshot encoding did not return verified bytes.");
      const common = { version: VERSION, savedAt: now(), backgroundSimulation: { inProgress, interrupted: interruptedJob, jobs: jobRecords } };
      const envelope = JSON.stringify({ ...common, kind: "snapshot", snapshot: encoded,
        integrity: captured.encodedIntegrity, ...(matchingReference ? { reference: matchingReference } : {}) });
      let referenceUsed = false;
      try { writeVerified(CLIENT_SESSION_RECOVERY_KEY, envelope); }
      catch (error) {
        if (!quotaFailure(error) || !matchingReference) throw error;
        // An existing explicit save is the only fallback authority. No hidden
        // slot is created, overwritten, pruned, or shared as an active pointer.
        writeVerified(CLIENT_SESSION_RECOVERY_KEY, JSON.stringify({ ...common, kind: "save-reference", reference: matchingReference }));
        referenceUsed = true;
      }
      hasCheckpoint = true;
      writeVerified(CLIENT_SESSION_PENDING_KEY, null);
      dirty = false;
      confirmJobs(jobRecords);
      const message = referenceUsed ? `This tab will reopen the exact saved checkpoint in "${matchingReference.slot}". Save later changes before leaving.` :
        inProgress ? "Saved the latest observed simulation checkpoint; an interrupted job will not resume automatically." : "Updated this tab's recovery checkpoint. Use a save slot to keep the franchise after closing the tab.";
      emit({ status: "ready", message: `${message}${interruptedJob ? " An earlier background simulation was interrupted and was not resumed." : ""}` });
    } catch (error) {
      dirty = true;
      emit({ status: "unsaved", message: "Your action is applied in this page, but its recovery checkpoint could not be saved. Keep the page open and retry saving before leaving or reloading.", reasonCode: error.reasonCode || "RECOVERY_WRITE_FAILED" });
      throw error;
    }
  }
  async function request(path, options = {}) {
    return serialize(async () => {
      const route = pathname(path);
      const method = String(options.method || "GET").toUpperCase();
      if (method === "GET" && ACCESSIBLE_READS.has(route)) {
        try { await ensureRestored(); } catch { /* Setup and save selection remain usable when recovery is blocked. */ }
        return runtime.request(path, options);
      }
      const replacement = method !== "GET" && REPLACEMENTS.has(route);
      const backgroundWasRunning = jobRecords.some(job => job.status === "queued" || job.status === "running");
      if (replacement && backgroundWasRunning) throw recoveryError("Wait for the background simulation to finish before switching franchises.", "RECOVERY_SIMULATION_ACTIVE");
      if (!replacement) await ensureRestored();
      const mutation = method === "GET" ? STATEFUL_READS.has(route) : !CHECKPOINT_EXCLUSIONS.has(route);
      const deletesReference = method !== "GET" && ["/api/saves/delete", "/api/backups/delete"].includes(route) &&
        durableReference && (await loadShared()).safeSlotName(options.body?.slot) === durableReference.slot;
      const needsCheckpoint = mutation || (!hasSession && !hasCheckpoint);
      let previousPending = null;
      const previousDirty = dirty;
      const previousStatus = { ...status };
      if (needsCheckpoint) {
        try {
          previousPending = read(CLIENT_SESSION_PENDING_KEY);
          markPending({ method, path: route });
          dirty = true;
          emit({ status: "pending", message: "Applying the action and updating this tab's recovery checkpoint." });
        } catch (error) { emit({ status: "recovery-required", message: error.message, reasonCode: error.reasonCode }); throw error; }
      }
      let response;
      try { response = await runtime.request(path, options); }
      catch (error) {
        if (needsCheckpoint) {
          dirty = true;
          emit({ status: "unsaved", message: "The action's result is uncertain. Keep this page open; do not repeat it without checking the current franchise.", reasonCode: "RECOVERY_ACTION_UNCERTAIN" });
        }
        throw error;
      }
      if (!successful(response)) {
        if (needsCheckpoint) {
          try {
            writeVerified(CLIENT_SESSION_PENDING_KEY, previousPending);
            dirty = previousDirty;
            emit(previousStatus);
          } catch (error) { emit({ status: "recovery-required", message: error.message, reasonCode: error.reasonCode }); }
        }
        return response;
      }
      hasSession = true;
      restored = true;
      if (mutation || deletesReference) durableReference = null;
      if (replacement) { dirty = false; interruptedJob = false; jobRecords = []; jobSignatures.clear(); }
      const jobs = route === "/api/jobs/simulate" ? observeJobs(response) : { changed: false, records: [] };
      const explicitReference = method === "POST" && ["/api/saves/load", "/api/backups/load", "/api/saves/save"].includes(route);
      const referenceCandidate = explicitReference && !backgroundWasRunning ? {
        slot: response.payload?.saved?.slot || options.body?.slot,
        loadRoute: route === "/api/backups/load" ? "/api/backups/load" : "/api/saves/load",
        sourceIntegrity: response.payload?.savedSnapshotIntegrity
      } : null;
      if (needsCheckpoint || jobs.changed || explicitReference || deletesReference) {
        try { await checkpoint({ method, path: route }, { pendingWritten: needsCheckpoint, referenceCandidate }); }
        catch { /* Applied action/read remains successful; onStatus owns the unsaved warning. */ }
      }
      return response;
    });
  }
  function flush() {
    return serialize(async () => {
      await ensureRestored();
      if (!hasSession) throw recoveryError("No active franchise is available to checkpoint.", "RECOVERY_NO_ACTIVE_SESSION");
      await checkpoint({ method: "checkpoint-only", path: null });
      return { ...status };
    });
  }
  function restorePreviousCheckpoint() {
    return serialize(async () => {
      try {
        const saved = await readEnvelope();
        if (!saved) throw recoveryError("No previous checkpoint exists in this tab. Choose a saved franchise or start a new one.", "RECOVERY_MISSING");
        const response = await importCheckpoint(saved);
        writeVerified(CLIENT_SESSION_PENDING_KEY, null);
        restored = true;
        dirty = false;
        jobRecords = [];
        jobSignatures.clear();
        emit({ status: "ready", message: interruptedJob ? "Restored the previous checkpoint. The interrupted background simulation was not resumed." : "Restored the previous checkpoint by your request." });
        return response;
      } catch (error) {
        emit({ status: "recovery-required", message: error.message, reasonCode: error.reasonCode || "RECOVERY_RESTORE_FAILED" });
        throw error;
      }
    });
  }
  return { request, flush, restorePreviousCheckpoint, getStatus: () => ({ ...status }) };
}
