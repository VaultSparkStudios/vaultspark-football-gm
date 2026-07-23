function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const absolute = Math.abs(amount);
  const prefix = amount < 0 ? "-" : "";
  if (absolute >= 1_000_000) return prefix + "$" + (absolute / 1_000_000).toFixed(1) + "M";
  if (absolute >= 1_000) return prefix + "$" + (absolute / 1_000).toFixed(0) + "K";
  return prefix + "$" + absolute;
}

function explainCommand(card) {
  if (card.action === "choose-gm-decision") return { reasonCode: "gm-decision", reason: card.blocking ? "An unresolved controlled decision must be staged before advance." : "The staged choice remains editable until the weekly command commits." };
  if (card.targetTab === "draftTab") return { reasonCode: "draft-authority", reason: card.blocking ? "The controlled franchise is on the clock; CPU resolution requires explicit delegation." : "The live draft board is the next roster authority." };
  if (card.targetTab === "contractsTab") return { reasonCode: "cap-pressure", reason: "Negative live cap space elevates contract review before optional work." };
  if (card.targetTab === "rosterTab") return { reasonCode: "injury-depth", reason: "Controlled-team injuries elevate active depth-chart review." };
  if (card.targetTab === "transactionsTab") return { reasonCode: "deadline-window", reason: "The current week is inside the bounded trade-deadline window." };
  if (card.action === "blocked") return { reasonCode: "advance-blocked", reason: "At least one higher-ranked controlled action is still blocking simulation." };
  if (card.action === "advance-week") return { reasonCode: "advance-ready", reason: "No source-derived controlled action currently blocks the shared weekly command." };
  return { reasonCode: "league-pulse", reason: "No higher-priority action displaced the latest league context." };
}
export function buildFranchiseCommandStack({
  dashboard = {},
  newsRows = [],
  pendingDecision = null,
  pendingChoice = null
} = {}) {
  const controlledTeamId = dashboard.controlledTeamId;
  const phase = String(dashboard.phase || "").toLowerCase();
  const capSpace = dashboard.cap?.capSpace ?? 0;
  const injuries = (dashboard.injuryReport || []).filter((entry) => entry.teamId === controlledTeamId);
  const rosterNeeds = (dashboard.rosterNeeds || []).map((need) => need.pos || need.position || need).filter(Boolean);
  const topNeed = rosterNeeds[0] || "depth";
  const draft = dashboard.draft || dashboard.draftState || {};
  const draftActive = phase.includes("draft") || Boolean(draft.available?.length);
  const controlledPickBlocking = draft.controlledTeamOnClock === true || draft.userActionRequired === true;
  const week = Number(dashboard.currentWeek || 0);
  const newsHead = newsRows[0]?.headline || "";
  const cards = [];

  if (pendingDecision?.id) {
    const optionCount = Array.isArray(pendingDecision.options) ? pendingDecision.options.length : 0;
    const stagedOption = (pendingDecision.options || []).find((option) => option.id === pendingChoice?.choiceId) || null;
    cards.push({
      kicker: pendingChoice ? "Weekly plan staged" : "GM decision",
      title: pendingDecision.label || pendingDecision.type || "Decision required",
      detail: stagedOption
        ? (stagedOption.label || stagedOption.id) + " selected. Choose a tactic, then Commit Plan & Advance."
        : pendingDecision.prompt || (optionCount || "Multiple") + " options waiting before you advance.",
      action: "choose-gm-decision",
      selectedChoiceId: pendingChoice?.choiceId || null,
      decisionId: pendingDecision.id,
      type: pendingDecision.type,
      year: pendingDecision.year,
      week: pendingDecision.week,
      occurrenceKey: pendingDecision.occurrenceKey,
      choices: (pendingDecision.options || []).slice(0, 4).map((option) => ({
        id: option.id,
        label: option.label || option.id,
        effect: option.effect || ""
      })),
      targetTab: null,
      tone: "danger",
      lane: "Now",
      blocking: !pendingChoice
    });
  }

  if (draftActive) {
    cards.push({
      kicker: controlledPickBlocking ? "Controlled pick required" : "Draft room",
      title: controlledPickBlocking ? "You are on the clock" : "Set your board",
      detail: controlledPickBlocking
        ? "Choose the franchise's player or explicitly delegate with Finish Draft."
        : topNeed === "depth" ? "Review the board before the next pick." : "Protect the " + topNeed + " plan before the next pick.",
      action: "open-tab",
      targetTab: "draftTab",
      tone: controlledPickBlocking ? "danger" : "warning",
      lane: controlledPickBlocking ? "Now" : "Before advance",
      blocking: controlledPickBlocking
    });
  }

  if (capSpace < 0) {
    cards.push({
      kicker: "Cap alert",
      title: "Clear cap pressure",
      detail: money(capSpace) + " space. Open contracts before advancing too far.",
      action: "open-tab",
      targetTab: "contractsTab",
      tone: "danger",
      lane: "Before advance",
      blocking: false
    });
  }

  if (injuries.length) {
    cards.push({
      kicker: "Trainer report",
      title: "Patch the depth chart",
      detail: injuries.length + " controlled-team injur" + (injuries.length === 1 ? "y" : "ies") + " need a roster check.",
      action: "open-tab",
      targetTab: "rosterTab",
      tone: cards.length ? "warning" : "danger",
      lane: "Before advance",
      blocking: false
    });
  }

  if (week >= 8 && week <= 10 && !cards.some((card) => card.targetTab === "transactionsTab")) {
    cards.push({
      kicker: "Deadline window",
      title: "Price the market",
      detail: topNeed === "depth" ? "Check trade options before the deadline closes." : "Shop for " + topNeed + " help before the deadline closes.",
      action: "open-tab",
      targetTab: "transactionsTab",
      tone: "warning",
      lane: "Optional",
      blocking: false
    });
  }

  if (newsHead && cards.length < 2) {
    cards.push({
      kicker: "League pulse",
      title: "Read the room",
      detail: newsHead,
      action: "open-tab",
      targetTab: "overviewTab",
      tone: "neutral",
      lane: "Optional",
      blocking: false
    });
  }

  const hasBlockingAction = cards.some((card) => card.blocking);
  cards.push({
    kicker: hasBlockingAction ? "Advance locked" : "Next snap",
    title: hasBlockingAction ? "Resolve the decision first" : "Advance the week",
    detail: hasBlockingAction ? "The franchise will not advance through a controlled blocking choice." : "Sim the next slate when your plan is set.",
    action: hasBlockingAction ? "blocked" : "advance-week",
    targetTab: null,
    tone: hasBlockingAction ? "muted" : cards.length ? "neutral" : "primary",
    lane: hasBlockingAction ? "Now" : "Optional",
    blocking: false,
    disabled: hasBlockingAction
  });

  const laneOrder = new Map([["Now", 0], ["Before advance", 1], ["Optional", 2]]);
  const terminalCard = cards.at(-1);
  const rankedCommands = cards
    .slice(0, -1)
    .sort((left, right) => (laneOrder.get(left.lane) ?? 9) - (laneOrder.get(right.lane) ?? 9))
    .slice(0, 3);
  return [...rankedCommands, terminalCard].map((card, index) => ({ ...card, rank: index + 1, ...explainCommand(card) }));
}

export function buildFranchiseCommandReceipt(input = {}) {
  const dashboard = input.dashboard || {};
  const cards = buildFranchiseCommandStack(input);
  return {
    schemaVersion: "1.0",
    authority: [dashboard.controlledTeamId || "unknown", dashboard.currentYear || "?", dashboard.currentWeek || "?", dashboard.phase || "unknown"].join(":"),
    blocking: cards.some((card) => card.blocking === true),
    commands: cards.map((card) => ({ rank: card.rank, lane: card.lane, reasonCode: card.reasonCode, action: card.action, targetTab: card.targetTab || null }))
  };
}
export function hasBlockingFranchiseCommand(cards = []) {
  return cards.some((card) => card.blocking === true);
}
