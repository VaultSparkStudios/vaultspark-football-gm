import { getCapAlerts } from "./capAlerts.js";

export const GM_DECISION_CATALOG = Object.freeze({
  "trade-deadline": Object.freeze({
    type: "TRADE_DEADLINE",
    priority: 80,
    choices: Object.freeze({
      buy: Object.freeze({ label: "Buy — acquire veterans now", headline: "GM mandate: buy at the trade deadline", effect: "add a roster upgrade before the deadline", transactionType: "gm-decision-buy", momentum: 2, risk: 2, targetTab: "contractsTab", mode: "commitment", deadlineWeek: 12 }),
      sell: Object.freeze({ label: "Sell — stock picks for the future", headline: "GM mandate: sell at the trade deadline", effect: "complete a future-focused trade before the deadline", transactionType: "gm-decision-sell", momentum: -1, risk: -1, targetTab: "draftTab", mode: "commitment", deadlineWeek: 12 }),
      hold: Object.freeze({ label: "Hold — stay the course", headline: "GM mandate: hold the roster course", effect: "make no trade through the deadline", transactionType: "gm-decision-hold", momentum: 0, risk: 0, targetTab: "overviewTab", mode: "commitment", deadlineWeek: 12 })
    })
  }),
  "qb-injury": Object.freeze({
    type: "INJURY_CRISIS",
    priority: 100,
    choices: Object.freeze({
      "fa-qb": Object.freeze({ label: "Sign a veteran QB from free agency", headline: "GM mandate: stabilize the quarterback room", effect: "sign the best viable veteran quarterback", transactionType: "gm-decision-qb-fa", momentum: 1, risk: 1, targetTab: "rosterTab", mode: "immediate-or-commitment", deadlineOffset: 2 }),
      "start-backup": Object.freeze({ label: "Start backup — develop for the future", headline: "GM mandate: develop the backup quarterback", effect: "promote an available backup to QB1", transactionType: "gm-decision-qb-backup", momentum: -1, risk: 0, targetTab: "rosterTab", mode: "immediate" }),
      "trade-qb": Object.freeze({ label: "Trade for a QB upgrade", headline: "GM mandate: explore quarterback trades", effect: "acquire a quarterback by trade", transactionType: "gm-decision-qb-trade", momentum: 2, risk: 3, targetTab: "contractsTab", mode: "commitment", deadlineOffset: 2 })
    })
  }),
  "cap-crisis": Object.freeze({
    type: "CAP_CRISIS",
    priority: 90,
    choices: Object.freeze({
      restructure: Object.freeze({ label: "Restructure key contracts immediately", headline: "GM mandate: restructure key contracts", effect: "restructure the largest eligible cap hit", transactionType: "gm-decision-cap-restructure", momentum: 1, risk: 2, targetTab: "contractsTab", mode: "immediate-or-commitment", deadlineOffset: 2 }),
      release: Object.freeze({ label: "Release a high-salary player", headline: "GM mandate: cut salary now", effect: "release a player through the contract desk", transactionType: "gm-decision-cap-release", momentum: -2, risk: -1, targetTab: "contractsTab", mode: "commitment", deadlineOffset: 2 }),
      wait: Object.freeze({ label: "Let it play out — monitor closely", headline: "GM mandate: monitor the cap crisis", effect: "restore non-negative cap space without an immediate cut", transactionType: "gm-decision-cap-wait", momentum: 0, risk: 3, targetTab: "settingsTab", mode: "commitment", deadlineOffset: 2 })
    })
  }),
  // ── S62 expansion: live narrative events become answerable decisions ──────
  "star-trade-request": Object.freeze({
    type: "STAR_TRADE_REQUEST",
    priority: 85,
    choices: Object.freeze({
      shop: Object.freeze({ label: "Shop him — get value while demand is hot", headline: "GM mandate: trade the disgruntled star", effect: "complete a trade sending the requesting player out", transactionType: "gm-decision-shop-star", momentum: 1, risk: 2, targetTab: "contractsTab", mode: "commitment", deadlineOffset: 3 }),
      extend: Object.freeze({ label: "Negotiate — repair it with a new deal", headline: "GM mandate: re-sign the disgruntled star", effect: "complete a re-sign or restructure for the requesting player", transactionType: "gm-decision-extend-star", momentum: 1, risk: 1, targetTab: "contractsTab", mode: "commitment", deadlineOffset: 3 }),
      deny: Object.freeze({ label: "Deny the request — he plays for us", headline: "GM mandate: hold the line on the trade request", effect: "publicly deny the trade request and absorb the morale cost", transactionType: "gm-decision-deny-star", momentum: -1, risk: 2, targetTab: "rosterTab", mode: "immediate" })
    })
  }),
  "culture-crisis": Object.freeze({
    type: "CULTURE_CRISIS",
    priority: 70,
    choices: Object.freeze({
      "address-room": Object.freeze({ label: "Address the room — players-only meeting", headline: "GM mandate: confront the locker-room collapse", effect: "hold a team meeting to steady the lowest-morale players", transactionType: "gm-decision-culture-address", momentum: 1, risk: 1, targetTab: "overviewTab", mode: "immediate" }),
      "back-staff": Object.freeze({ label: "Back the coaching staff publicly", headline: "GM mandate: stand behind the staff", effect: "publicly back the staff and accept the standings pressure", transactionType: "gm-decision-culture-back-staff", momentum: 0, risk: 2, targetTab: "settingsTab", mode: "immediate" }),
      "shake-up": Object.freeze({ label: "Shake up the roster — someone goes", headline: "GM mandate: roster shake-up", effect: "complete a trade or release inside two weeks", transactionType: "gm-decision-culture-shake-up", momentum: -1, risk: 3, targetTab: "contractsTab", mode: "commitment", deadlineOffset: 2 })
    })
  }),
  "legend-farewell": Object.freeze({
    type: "LEGEND_FAREWELL",
    priority: 60,
    choices: Object.freeze({
      ceremony: Object.freeze({ label: "Plan a farewell ceremony season", headline: "GM mandate: honor the departing legend", effect: "announce a farewell celebration for the retiring veteran", transactionType: "gm-decision-legend-ceremony", momentum: 1, risk: 0, targetTab: "historyTab", mode: "immediate" }),
      "feature-role": Object.freeze({ label: "Feature him — one last ride", headline: "GM mandate: feature the legend", effect: "publicly commit a featured role for the final season", transactionType: "gm-decision-legend-feature", momentum: 1, risk: 1, targetTab: "rosterTab", mode: "immediate" }),
      "quiet-exit": Object.freeze({ label: "Keep it quiet — business as usual", headline: "GM mandate: no farewell tour", effect: "decline a public farewell and keep focus on the season", transactionType: "gm-decision-legend-quiet", momentum: -1, risk: 1, targetTab: "overviewTab", mode: "immediate" })
    })
  })
});

function normalizedTeamId(state = {}) {
  return String(state.controlledTeamId || state.controlledTeam?.id || state.controlledTeam?.abbrev || "none").toUpperCase();
}

function normalizedFranchiseId(state = {}) {
  return String(state.franchiseId || state.leagueId || `fa-${state.startYear || "unknown"}-${normalizedTeamId(state)}`);
}

function decisionOptions(decisionId) {
  const choices = GM_DECISION_CATALOG[decisionId]?.choices || {};
  return Object.entries(choices).map(([id, choice]) => ({
    id,
    label: choice.label,
    effect: choice.effect
  }));
}

export function buildGmDecisionOccurrenceKey(state = {}, decisionId, contextKey = "default") {
  return [
    normalizedFranchiseId(state),
    state.currentYear || state.startYear || "unknown",
    normalizedTeamId(state),
    decisionId,
    contextKey
  ].map((part) => encodeURIComponent(String(part))).join(":");
}

function decisionRecord(state, decisionId, prompt, contextKey = "default") {
  const definition = GM_DECISION_CATALOG[decisionId];
  return {
    id: decisionId,
    type: definition.type,
    priority: definition.priority,
    year: Number(state.currentYear || state.startYear || 0),
    week: Number(state.currentWeek || 0),
    teamId: normalizedTeamId(state),
    occurrenceKey: buildGmDecisionOccurrenceKey(state, decisionId, contextKey),
    prompt,
    options: decisionOptions(decisionId)
  };
}

function activeInjuryRows(state = {}) {
  const rows = Array.isArray(state.activeInjuries)
    ? state.activeInjuries
    : Array.isArray(state.injuryReport)
      ? state.injuryReport
      : [];
  const teamId = normalizedTeamId(state);
  return rows
    .filter((row) => !row.teamId || String(row.teamId).toUpperCase() === teamId)
    .map((row) => ({
      ...row,
      playerId: row.playerId || row.id || row.player,
      name: row.name || row.player || "Quarterback",
      pos: row.pos || row.position,
      weeksRemaining: Number(row.weeksRemaining ?? row.injury?.weeksRemaining ?? 0),
      severity: String(row.severity || row.injury?.severity || "minor").toLowerCase()
    }));
}

function capAlertRows(state = {}) {
  if (Array.isArray(state.capAlerts)) return state.capAlerts;
  return getCapAlerts(state.cap || null, [], Number(state.currentYear || state.startYear || 0));
}

export function generateGmDecisions(state = {}, { ledger = [] } = {}) {
  const week = Number(state.currentWeek || 0);
  const phase = String(state.phase || "");
  const candidates = [];
  const injuries = activeInjuryRows(state);
  const qbInjury = injuries.find((row) =>
    String(row.pos || "").toUpperCase() === "QB" &&
    row.weeksRemaining > 0 &&
    (row.severity === "severe" || row.weeksRemaining >= 4)
  );
  if (qbInjury) {
    const contextKey = qbInjury.playerId || qbInjury.name;
    candidates.push(decisionRecord(
      state,
      "qb-injury",
      `${qbInjury.name} is out ${qbInjury.weeksRemaining}+ weeks. How do you respond?`,
      contextKey
    ));
  }

  const criticalCap = capAlertRows(state).find((alert) => alert.severity === "critical");
  if (criticalCap) {
    candidates.push(decisionRecord(
      state,
      "cap-crisis",
      `Cap emergency: ${criticalCap.headline}. Time is running out to find relief.`,
      criticalCap.type || criticalCap.headline
    ));
  }

  if (phase === "regular-season" && week >= 9 && week <= 11) {
    const standings = state.latestStandings || [];
    const team = state.controlledTeam || {};
    const myRow = standings.find((row) => row.team === (team.abbrev || team.id || normalizedTeamId(state))) || {};
    candidates.push(decisionRecord(
      state,
      "trade-deadline",
      `Trade deadline closes end of Week 11 (current: Week ${week}). Record: ${myRow.wins || 0}-${myRow.losses || 0}. What's your priority?`,
      `deadline-${state.currentYear || state.startYear || "unknown"}`
    ));
  }

  // Live narrative events for the controlled team become answerable decisions
  // (S62). Each event fires at most one decision per player/team per season via
  // the occurrence ledger; the contextKey carries the subject playerId so the
  // consequence layer can act on the exact player.
  const teamId = normalizedTeamId(state);
  const year = Number(state.currentYear || state.startYear || 0);
  const narrativeRows = (Array.isArray(state.narrativeLog) ? state.narrativeLog : [])
    .filter((event) => event?.year === year && (event.teamIds || []).map((id) => String(id).toUpperCase()).includes(teamId));
  const tradeRequest = narrativeRows.find((event) => event.type === "TRADE_REQUEST");
  if (tradeRequest) {
    const playerId = (tradeRequest.playerIds || [])[0] || "unknown";
    candidates.push(decisionRecord(
      state,
      "star-trade-request",
      `${tradeRequest.headline}. ${tradeRequest.impact || ""}`.trim(),
      playerId
    ));
  }
  const cultureCrisis = narrativeRows.find((event) => event.type === "CULTURE_CRISIS");
  if (cultureCrisis) {
    candidates.push(decisionRecord(
      state,
      "culture-crisis",
      `${cultureCrisis.headline}. ${cultureCrisis.impact || ""}`.trim(),
      `culture-${year}-week-${cultureCrisis.week || week}`
    ));
  }
  const legendFarewell = narrativeRows.find((event) => event.type === "LEGEND_FAREWELL");
  if (legendFarewell) {
    const playerId = (legendFarewell.playerIds || [])[0] || "unknown";
    candidates.push(decisionRecord(
      state,
      "legend-farewell",
      `${legendFarewell.headline}. ${legendFarewell.impact || ""}`.trim(),
      playerId
    ));
  }

  const resolvedOccurrences = new Set(
    (Array.isArray(ledger) ? ledger : [])
      .map((entry) => entry?.occurrenceKey)
      .filter(Boolean)
  );
  return candidates
    .filter((decision) => !resolvedOccurrences.has(decision.occurrenceKey))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

export function validatePendingGmDecision(pending, choice = null) {
  if (!pending) {
    return choice
      ? { ok: false, status: 409, reasonCode: "ADVANCE_WEEK_GM_DECISION_NOT_PENDING", error: "That General Manager decision is no longer pending." }
      : { ok: true, choice: null };
  }
  if (!choice) {
    return {
      ok: false,
      status: 409,
      reasonCode: "ADVANCE_WEEK_GM_DECISION_REQUIRED",
      error: "Resolve or explicitly defer the pending General Manager decision before advancing.",
      pendingDecision: pending
    };
  }
  if (choice.decisionId !== pending.id || choice.occurrenceKey !== pending.occurrenceKey) {
    return {
      ok: false,
      status: 409,
      reasonCode: "ADVANCE_WEEK_GM_DECISION_STALE",
      error: "That General Manager decision belongs to another franchise moment. Reopen the current decision.",
      pendingDecision: pending
    };
  }
  if (!(pending.options || []).some((option) => option.id === choice.choiceId)) {
    return {
      ok: false,
      status: 400,
      reasonCode: "ADVANCE_WEEK_UNKNOWN_GM_DECISION",
      error: "Unknown choice for the pending General Manager decision.",
      pendingDecision: pending
    };
  }
  return { ok: true, choice };
}
