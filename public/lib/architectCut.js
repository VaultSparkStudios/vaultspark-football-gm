function text(value, fallback = "Not recorded") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function assetNames(entries = []) {
  return entries.map((entry) => entry.player || entry.playerId || (entry.round ? `${entry.year} R${entry.round}` : entry.id)).filter(Boolean);
}

function weeklyCandidate(entry, seasonYear) {
  const gm = entry.intent?.gmDecision || null;
  const tactic = entry.intent?.tactic || null;
  const observed = [entry.outcome?.result, entry.outcome?.score, entry.outcome?.observed].filter(Boolean);
  const intents = [gm?.label || gm?.summary, tactic?.label || tactic?.intent].filter(Boolean);
  const complete = intents.length > 0 && observed.length > 0;
  return {
    id: entry.id || `weekly-${seasonYear}-${entry.week || 0}`,
    source: "weekly-command",
    sourceLabel: gm && tactic ? "GM choice + weekly plan" : gm ? "GM choice" : "Weekly plan",
    year: Number(entry.year || seasonYear),
    week: Number(entry.week || entry.execution?.completed?.week || 0),
    title: intents.join(" + ") || "Undeclared weekly command",
    declaredIntent: intents.join(" · ") || "No explicit intent was stored.",
    observedEvidence: observed.join(" · ") || "No outcome receipt was stored.",
    nextAdaptation: text(entry.nextAdaptation, "No next adaptation was stored."),
    evidenceState: complete ? "joined" : "incomplete",
    causalStatus: "non-causal",
    limitations: text(entry.disclaimer, "The receipt records sequence and observed evidence; it does not prove the choice caused the result."),
    gmChoice: Boolean(gm),
    weeklyPlan: Boolean(tactic),
    editorialScore: 60 + (gm ? 14 : 0) + (tactic ? 8 : 0) + (typeof entry.outcome?.aligned === "boolean" ? 8 : 0) + (observed.length ? 6 : 0)
  };
}

function tradeCandidate(entry, seasonYear, teamId) {
  const details = entry.details || {};
  const outgoing = entry.teamA === teamId
    ? [...(details.fromA || []), ...(details.picksFromA || [])]
    : [...(details.fromB || []), ...(details.picksFromB || [])];
  const incoming = entry.teamA === teamId
    ? [...(details.fromB || []), ...(details.picksFromB || [])]
    : [...(details.fromA || []), ...(details.picksFromA || [])];
  const rival = entry.teamA === teamId ? entry.teamB : entry.teamA;
  return {
    id: entry.id || `trade-${seasonYear}-${entry.seq || 0}`,
    source: "trade",
    sourceLabel: "Trade desk",
    year: Number(entry.year || seasonYear),
    week: Number(entry.week || 0),
    title: `Exchange with ${text(rival, "another club")}`,
    declaredIntent: "The completed package is authoritative; no pre-trade intent receipt was stored.",
    observedEvidence: `Sent ${assetNames(outgoing).join(", ") || "no named assets"}; received ${assetNames(incoming).join(", ") || "no named assets"}.`,
    nextAdaptation: "Evaluate the acquired assets over future receipts; this season-end cut does not grade the trade from one snapshot.",
    evidenceState: "incomplete",
    causalStatus: "non-causal",
    limitations: "Execution is proven, but intent and downstream player value are incomplete.",
    gmChoice: false,
    weeklyPlan: false,
    editorialScore: 54 + Math.min(12, (outgoing.length + incoming.length) * 2)
  };
}

function draftCandidate(selection, seasonYear) {
  const rating = Number.isFinite(Number(selection.overall)) ? ` · ${selection.overall} OVR` : "";
  const potential = Number.isFinite(Number(selection.potential)) ? ` / ${selection.potential} POT` : "";
  const complete = Boolean(selection.player) && Number.isFinite(Number(selection.pick));
  return {
    id: `draft-${seasonYear}-${selection.pick}-${selection.playerId || selection.player}`,
    source: "draft",
    sourceLabel: "Draft room",
    year: seasonYear,
    week: 0,
    title: `Pick ${selection.pick}: ${text(selection.player, "Unnamed prospect")}`,
    declaredIntent: `Selected ${text(selection.pos, "unknown position")} in round ${selection.round || "?"}${selection.userSelected ? " by direct GM call" : " through the configured draft authority"}.`,
    observedEvidence: `Selection receipt${rating}${potential}; career impact is not graded at draft time.`,
    nextAdaptation: "Track role, development, and retained value in later seasons before judging the pick.",
    evidenceState: complete ? "joined" : "incomplete",
    causalStatus: "non-causal",
    limitations: "Draft-day ratings describe the selection, not a future-career verdict.",
    gmChoice: selection.userSelected === true,
    weeklyPlan: false,
    editorialScore: 50 + Math.max(0, 8 - Number(selection.round || 8)) * 3 + (selection.userSelected ? 5 : 0)
  };
}

export function buildArchitectCut({ seasonYear, teamId, architectLedger = [], transactions = [], draftHistory = [] } = {}) {
  const year = Number(seasonYear);
  const weekly = architectLedger.filter((entry) => Number(entry?.year) === year).map((entry) => weeklyCandidate(entry, year));
  const trades = transactions
    .filter((entry) => entry?.type === "trade" && Number(entry.year) === year && (!teamId || entry.teamA === teamId || entry.teamB === teamId))
    .map((entry) => tradeCandidate(entry, year, teamId));
  const draft = (draftHistory.find((entry) => Number(entry?.year) === year)?.selections || [])
    .filter((selection) => !teamId || selection.teamId === teamId)
    .map((selection) => draftCandidate(selection, year));
  const candidates = [...weekly, ...trades, ...draft]
    .sort((left, right) => right.editorialScore - left.editorialScore || right.week - left.week || left.id.localeCompare(right.id));
  const sources = {
    weeklyPlans: weekly.filter((entry) => entry.weeklyPlan).length,
    gmChoices: weekly.filter((entry) => entry.gmChoice).length + draft.filter((entry) => entry.gmChoice).length,
    trades: trades.length,
    draftCalls: draft.length
  };
  const missingSources = Object.entries(sources).filter(([, count]) => count === 0).map(([source]) => source);
  return {
    schemaVersion: "1.0",
    kind: "architect-cut",
    seasonYear: year,
    status: candidates.length >= 3 && missingSources.length === 0 ? "complete" : candidates.length ? "partial" : "incomplete",
    candidatesObserved: candidates.length,
    sources,
    missingSources,
    turningPoints: candidates.slice(0, 3).map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      whyRanked: "Ranked by decision scope and receipt density, not claimed causal impact."
    })),
    disclaimer: "Architect's Cut joins declared intent to stored outcomes in sequence. It is an editorial evidence review, not a causal model. Missing receipts stay missing."
  };
}
