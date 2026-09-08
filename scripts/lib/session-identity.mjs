// One monotonic session identity for active locks and durable closeout traces.
import fs from "node:fs";
import path from "node:path";

export function sessionIdFromLock(text) {
  const match = String(text || "").match(/^session[-_]?id:\s*([0-9]+)\s*$/mi);
  return match ? Number(match[1]) : null;
}

export function closedSessionFromStatus(status = {}) {
  const values = [status.currentSession, status.lastSession, status.silLastSession]
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function closedSessionFromSil(text) {
  const values = [];
  for (const match of String(text || "").matchAll(/^## .*?\bSession\s+([0-9]+)\b/gmi)) values.push(Number(match[1]));
  return values.length ? Math.max(...values) : null;
}

export function resolveActiveSessionId(root, { lockText = null } = {}) {
  let activeText = lockText;
  if (activeText == null) {
    try { activeText = fs.readFileSync(path.join(root, "context", ".session-lock"), "utf8"); } catch { activeText = ""; }
  }
  const active = sessionIdFromLock(activeText);
  if (Number.isFinite(active)) return active;

  let status = {};
  let sil = "";
  try { status = JSON.parse(fs.readFileSync(path.join(root, "context", "PROJECT_STATUS.json"), "utf8")); } catch {}
  try { sil = fs.readFileSync(path.join(root, "context", "SELF_IMPROVEMENT_LOOP.md"), "utf8"); } catch {}
  const closed = [closedSessionFromStatus(status), closedSessionFromSil(sil)].filter(Number.isFinite);
  return closed.length ? Math.max(...closed) + 1 : null;
}

export function resolveRunSession(root, { lockText = null } = {}) {
  let activeText = lockText;
  if (activeText == null) {
    try { activeText = fs.readFileSync(path.join(root, "context", ".session-lock"), "utf8"); } catch { activeText = ""; }
  }
  const fromLock = sessionIdFromLock(activeText);
  if (Number.isFinite(fromLock)) return { session: fromLock, source: "lock", outOfBand: false };
  const derived = resolveActiveSessionId(root, { lockText: "" });
  return { session: Number.isFinite(derived) ? derived : null, source: "derived", outOfBand: true };
}

export default { sessionIdFromLock, closedSessionFromStatus, closedSessionFromSil, resolveActiveSessionId, resolveRunSession };
