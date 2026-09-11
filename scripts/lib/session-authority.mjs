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

// Two heading shapes carry a completed session. `# Session N Closeout` is the
// studio form; `# Latest Handoff — Session N → Session M` is the one this
// project has written at every closeout since at least S96, and matched
// nothing here until S105 — so the brief rendered `handoff=S?` for the
// project's whole recorded history and the divergence check silently ran on
// two sources instead of three. In the second form only N is completed; M is
// the next session's intent and never counts as committed authority.
const HANDOFF_CLOSEOUT_HEADINGS = [
  /^#{1,6}\s+(?:Prior\s+)?Session\s+(\d+)\s+Closeout\b/gim,
  /^#{1,6}\s+Latest\s+Handoff\s+[—–-]+\s+Session\s+(\d+)\s*(?:→|->)/gim
];

export function parseHandoffCloseoutAuthority(markdown = "") {
  const source = String(markdown);
  return maxSession(HANDOFF_CLOSEOUT_HEADINGS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1])));
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
