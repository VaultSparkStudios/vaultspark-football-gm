function decisionKeys(dashboard = {}) {
  return new Set((dashboard.gmDecisionQueue || []).map((decision) => String(decision.id || decision.type || "decision")));
}

function latestCommitmentReceipt(dashboard = {}) {
  return dashboard.gmCommitments?.latestReceipt || null;
}

function controlledGame(dashboard = {}) {
  const teamId = dashboard.controlledTeamId || dashboard.controlledTeam?.id || null;
  const games = dashboard.latestWeekResults?.games || [];
  if (!teamId) return null;
  return games.find((game) => game.homeTeamId === teamId || game.awayTeamId === teamId) || null;
}

function gameDigest(dashboard = {}) {
  const game = controlledGame(dashboard);
  if (!game) return null;
  const teamId = dashboard.controlledTeamId || dashboard.controlledTeam?.id;
  const home = game.homeTeamId === teamId;
  const opponentId = home ? game.awayTeamId : game.homeTeamId;
  const ownScore = Number(home ? game.homeScore : game.awayScore) || 0;
  const opponentScore = Number(home ? game.awayScore : game.homeScore) || 0;
  const result = ownScore > opponentScore ? "W" : ownScore < opponentScore ? "L" : "T";
  return `${result} ${teamId} ${ownScore}–${opponentScore} ${opponentId}`;
}

function offseasonStage(dashboard = {}) {
  return dashboard.offseasonPipeline?.stage || null;
}

function controlledDraftPickRequired(dashboard = {}) {
  return dashboard.draft?.controlledTeamOnClock === true || dashboard.draft?.userActionRequired === true;
}

export function hasPendingSimulationDecision(dashboard = {}) {
  return Array.isArray(dashboard.gmDecisionQueue) && dashboard.gmDecisionQueue.length > 0;
}

export function classifySimulationCheckpoint({ previous = {}, next = {} } = {}) {
  const reasons = [];
  const userPickNow = controlledDraftPickRequired(next);
  const userPickBefore = controlledDraftPickRequired(previous);
  if (userPickNow && (!userPickBefore || previous.draft?.currentPick !== next.draft?.currentPick)) {
    reasons.push({
      id: "controlled-draft-pick",
      label: `${next.draft?.teamOnClock || next.controlledTeamId || "Your franchise"} is on the clock`,
      blocking: true
    });
  }
  const previousStage = offseasonStage(previous);
  const nextStage = offseasonStage(next);
  if (next.phase === "offseason" && nextStage && previousStage !== nextStage) {
    reasons.push({
      id: "offseason-stage",
      label: `Offseason checkpoint: ${String(nextStage).replace(/-/g, " ")}`,
      blocking: false
    });
  }
  if (previous.currentYear != null && next.currentYear != null && previous.currentYear !== next.currentYear) {
    reasons.push({ id: "season-rollover", label: `Season ${next.currentYear} opened` });
  }
  if (previous.phase && next.phase && previous.phase !== next.phase) {
    const postseason = next.phase === "postseason" || previous.phase === "postseason";
    reasons.push({
      id: postseason ? "playoff-gate" : "phase-change",
      label: postseason ? "Playoff checkpoint reached" : `${previous.phase} → ${next.phase}`
    });
  }

  const beforeDecisions = decisionKeys(previous);
  const newDecisions = [...decisionKeys(next)].filter((key) => !beforeDecisions.has(key));
  if (newDecisions.length) {
    const first = (next.gmDecisionQueue || []).find((decision) => newDecisions.includes(String(decision.id || decision.type || "decision")));
    reasons.push({ id: "gm-decision", label: first?.prompt || "A General Manager decision requires attention" });
  }

  const beforeReceipt = latestCommitmentReceipt(previous);
  const nextReceipt = latestCommitmentReceipt(next);
  if (nextReceipt?.id && nextReceipt.id !== beforeReceipt?.id) {
    reasons.push({
      id: "commitment-resolution",
      label: `${nextReceipt.label || "GM commitment"} ${nextReceipt.status || "resolved"}`
    });
  }

  return {
    shouldPause: reasons.length > 0,
    blocking: reasons.some((reason) => reason.blocking === true),
    primary: reasons[0] || null,
    reasons
  };
}

export function appendSimulationDigest(digest = [], { previous = {}, next = {}, checkpoint = null } = {}) {
  const entry = {
    id: `${next.currentYear ?? "?"}-${next.phase || "unknown"}-${next.currentWeek ?? "?"}-${offseasonStage(next) || "none"}-${next.draft?.currentPick || "none"}`,
    year: next.currentYear ?? null,
    week: next.currentWeek ?? null,
    phase: next.phase || "unknown",
    result: gameDigest(next),
    checkpoint: checkpoint?.primary?.label || null,
    from: previous.currentWeek ?? null
  };
  const withoutDuplicate = digest.filter((existing) => existing.id !== entry.id);
  return [...withoutDuplicate, entry].slice(-12);
}

export function formatSimulationDigest(digest = []) {
  return digest.slice(-5).map((entry) => {
    const location = `Y${entry.year ?? "?"} W${entry.week ?? "?"}`;
    const details = [entry.result, entry.checkpoint].filter(Boolean).join(" · ");
    return `${location} · ${details || entry.phase}`;
  });
}
