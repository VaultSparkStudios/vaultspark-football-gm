function sessionNumber(value) {
  const source = String(value ?? "").trim().replace(/^S/i, "");
  if (!source) return null;
  const parsed = Number(source);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function maxSession(values = []) {
  const safe = values.map(sessionNumber).filter((value) => value != null);
  return safe.length ? Math.max(...safe) : null;
}

export function parseSilSessionAuthority(markdown = "") {
  return maxSession([...String(markdown).matchAll(/^##[^\n]*?\bSession\s+(\d+)\b/gim)].map((match) => match[1]));
}

export function parseHandoffCloseoutAuthority(markdown = "") {
  return maxSession([...String(markdown).matchAll(/^#{1,6}\s+(?:Prior\s+)?Session\s+(\d+)\s+Closeout\b/gim)].map((match) => match[1]));
}

export function resolveSessionAuthority({ sil = "", status = {}, handoff = "", fallbackCompletedSession = null } = {}) {
  const silSession = parseSilSessionAuthority(sil);
  const statusSession = sessionNumber(status?.currentSession);
  const handoffSession = parseHandoffCloseoutAuthority(handoff);
  const fallbackSession = sessionNumber(fallbackCompletedSession);
  const committedSession = maxSession([silSession, statusSession, handoffSession, fallbackSession]);
  const observed = [silSession, statusSession, handoffSession].filter((value) => value != null);
  const divergence = new Set(observed).size > 1;
  return Object.freeze({
    committedSession,
    nextSession: committedSession == null ? null : committedSession + 1,
    silSession,
    statusSession,
    handoffSession,
    divergence,
    repairStatusSession: committedSession != null && (statusSession == null || statusSession < committedSession)
      ? committedSession
      : null,
    detail: `committed=S${committedSession ?? "?"} · SIL=S${silSession ?? "?"} · status=S${statusSession ?? "?"} · handoff=S${handoffSession ?? "?"}`
  });
}
