import { createSessionFromSnapshot } from "../../runtime/bootstrap.js";
import { deleteSaveSlot, listBackupSlots, listSaveSlots, loadSessionFromSlot, saveSessionToSlot } from "../../runtime/saveStore.js";
import { buildIntegrityStamp, verifyIntegrityStamp } from "../../adapters/persistence/saveStoreShared.js";
import { inspectSnapshotCompatibility, snapshotErrorPayload } from "../../runtime/snapshotMigration.js";
import { readRequestBody } from "../httpHardening.js";

// Save slots, snapshots, rolling backups and rewind.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleSavesRoutes(req, res, url, ctx) {
  const { parseJsonBody, sendJson, serverRewindStates, takeServerRewindSnapshot, writeAutoBackup } = ctx;

  if (req.method === "GET" && url.pathname === "/api/saves") {
    sendJson(res, 200, { ok: true, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/snapshot/export") {
    sendJson(res, 200, {
      ok: true,
      snapshot: ctx.session.toSnapshot(),
      fileName: `vsfgm-${ctx.session.currentYear}-w${ctx.session.currentWeek}-${ctx.session.controlledTeamId}.json`
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/snapshot/import") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.snapshot || typeof body.snapshot !== "object") {
      sendJson(res, 400, { ok: false, error: "snapshot object is required." });
      return true;
    }
    let replacement;
    try { replacement = createSessionFromSnapshot(body.snapshot); }
    catch (error) { sendJson(res, error.status || 400, snapshotErrorPayload(error)); return true; }
    ctx.session = replacement;
    writeAutoBackup("snapshot-import");
    sendJson(res, 200, { ok: true, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/snapshot/inspect") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.snapshot || typeof body.snapshot !== "object") {
      sendJson(res, 400, { ok: false, error: "snapshot object is required." });
      return true;
    }
    const compatibility = inspectSnapshotCompatibility(body.snapshot);
    sendJson(res, compatibility.ok ? 200 : compatibility.status || 400, {
      ...compatibility,
      activeLeaguePreserved: true
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/backups") {
    sendJson(res, 200, { ok: true, slots: listBackupSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/save") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const serialized = JSON.stringify(ctx.session.toSnapshot());
    const savedSnapshotIntegrity = buildIntegrityStamp(serialized);
    const saved = saveSessionToSlot(String(body.slot), JSON.parse(serialized));
    sendJson(res, 200, { ok: true, saved, savedSnapshotIntegrity, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/load") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    let snapshot;
    try { snapshot = loadSessionFromSlot(String(body.slot)); }
    catch (error) { sendJson(res, error.status || 409, snapshotErrorPayload(error)); return true; }
    if (!snapshot) {
      sendJson(res, 404, { ok: false, error: "Save slot not found." });
      return true;
    }
    const serialized = JSON.stringify(snapshot);
    if (Object.hasOwn(body, "expectedSavedSnapshotIntegrity") &&
        (!body.expectedSavedSnapshotIntegrity || !verifyIntegrityStamp(serialized, body.expectedSavedSnapshotIntegrity))) {
      sendJson(res, 409, { ok: false, reasonCode: "RECOVERY_REFERENCE_CHANGED", error: "The selected saved checkpoint has changed. Choose the saved franchise explicitly from setup." });
      return true;
    }
    const savedSnapshotIntegrity = buildIntegrityStamp(serialized);
    let replacement;
    try { replacement = createSessionFromSnapshot(snapshot); }
    catch (error) { sendJson(res, error.status || 400, snapshotErrorPayload(error)); return true; }
    ctx.session = replacement;
    sendJson(res, 200, { ok: true, savedSnapshotIntegrity, state: ctx.session.getDashboardState(), slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/backups/load") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    let snapshot;
    try { snapshot = loadSessionFromSlot(String(body.slot)); }
    catch (error) { sendJson(res, error.status || 409, snapshotErrorPayload(error)); return true; }
    if (!snapshot) {
      sendJson(res, 404, { ok: false, error: "Backup slot not found." });
      return true;
    }
    const serialized = JSON.stringify(snapshot);
    if (Object.hasOwn(body, "expectedSavedSnapshotIntegrity") &&
        (!body.expectedSavedSnapshotIntegrity || !verifyIntegrityStamp(serialized, body.expectedSavedSnapshotIntegrity))) {
      sendJson(res, 409, { ok: false, reasonCode: "RECOVERY_REFERENCE_CHANGED", error: "The selected saved checkpoint has changed. Choose the saved franchise explicitly from setup." });
      return true;
    }
    const savedSnapshotIntegrity = buildIntegrityStamp(serialized);
    let replacement;
    try { replacement = createSessionFromSnapshot(snapshot); }
    catch (error) { sendJson(res, error.status || 400, snapshotErrorPayload(error)); return true; }
    ctx.session = replacement;
    sendJson(res, 200, { ok: true, savedSnapshotIntegrity, state: ctx.session.getDashboardState(), slots: listBackupSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/delete") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const deleted = deleteSaveSlot(String(body.slot));
    sendJson(res, 200, { ok: true, deleted, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/backups/delete") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const deleted = deleteSaveSlot(String(body.slot));
    sendJson(res, 200, { ok: true, deleted, slots: listBackupSlots() });
    return true;
  }

  // ── Rewind authority (server-memory adapter; GameSession remains canonical) ─
  if (req.method === "GET" && url.pathname === "/api/rewind") {
    sendJson(res, 200, { ok: true, snapshots: ctx.serverRewindSnapshots.map((entry) => ({ ...entry })) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/rewind/snapshot") {
    const body = parseJsonBody(await readRequestBody(req));
    const entry = takeServerRewindSnapshot("manual", body?.label ? String(body.label) : "Manual snapshot");
    sendJson(res, 200, { ok: true, entry, snapshots: ctx.serverRewindSnapshots.map((item) => ({ ...item })) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/rewind/restore") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body?.id) {
      sendJson(res, 400, { ok: false, error: "id is required." });
      return true;
    }
    const stored = serverRewindStates.get(String(body.id));
    if (!stored) {
      sendJson(res, 404, { ok: false, error: "Snapshot not found." });
      return true;
    }
    takeServerRewindSnapshot("pre-restore", "Before restore to " + String(body.id));
    try {
      ctx.session = createSessionFromSnapshot(structuredClone(stored));
      sendJson(res, 200, { ok: true, state: ctx.session.getDashboardState() });
    } catch (error) {
      sendJson(res, error.status || 500, snapshotErrorPayload(error));
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/rewind/delete") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body?.id) {
      sendJson(res, 400, { ok: false, error: "id is required." });
      return true;
    }
    const id = String(body.id);
    serverRewindStates.delete(id);
    ctx.serverRewindSnapshots = ctx.serverRewindSnapshots.filter((entry) => entry.id !== id);
    sendJson(res, 200, { ok: true, snapshots: ctx.serverRewindSnapshots.map((entry) => ({ ...entry })) });
    return true;
  }

  return false;
}
