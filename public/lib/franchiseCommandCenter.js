import { tradeWindow } from "./tradeWindow.js";
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
  if (card.action === "choose-gm-decision") return { reasonCode: "gm-decision", reason: card.blocking ? "You have a decision to make before the week can advance." : "You can change your choice until you commit the week." };
  if (card.targetTab === "draftTab") return { reasonCode: "draft-authority", reason: card.blocking ? "You are on the clock; the CPU only picks for you if you hand it the pick." : "The draft board is where your roster changes next." };
  if (card.targetTab === "contractsTab") return { reasonCode: "cap-pressure", reason: "You are over the cap, so contracts come before anything optional." };
  if (card.targetTab === "rosterTab") return { reasonCode: "injury-depth", reason: "Injuries on your roster mean the depth chart needs a look." };
  if (card.targetTab === "transactionsTab") return { reasonCode: "deadline-window", reason: "The trade deadline is approaching." };
  if (card.action === "blocked") return { reasonCode: "advance-blocked", reason: "Something more urgent still has to be handled before you can sim." };
  if (card.action === "advance-week") return { reasonCode: "advance-ready", reason: "Nothing is blocking the week. You are clear to advance." };
  return { reasonCode: "league-pulse", reason: "Nothing more urgent right now; here is the latest around the league." };
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
  const deadline = tradeWindow(dashboard);
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
        effect: option.effect || "",
        boundary: option.boundary || null,
        preview: option.preview || null
      })),
      targetTab: null,
      tone: "danger",
      lane: "Now",
      blocking: !pendingChoice
    });
  }

  if (draftActive) {
    cards.push({
      kicker: controlledPickBlocking ? "Your pick" : "Draft room",
      title: controlledPickBlocking ? "You are on the clock" : "Set your board",
      detail: controlledPickBlocking
        ? "Choose the franchise's player or explicitly delegate with Finish Draft."
        : topNeed === "depth" ? "Review the board before the next pick." : "Protect the " + topNeed + " plan before the next pick.",
      action: "open-tab",
      targetTab: "draftTab",
      targetId: "draftWarRoomPanel",
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
      targetId: "contractsSpotlight",
      tone: "danger",
      lane: "Before advance",
      blocking: false
    });
  }

  if (injuries.length) {
    cards.push({
      kicker: "Trainer report",
      title: "Patch the depth chart",
      detail: injuries.length + " injur" + (injuries.length === 1 ? "y" : "ies") + " on your roster " + (injuries.length === 1 ? "needs" : "need") + " a depth check.",
      action: "open-tab",
      targetTab: "depthTab",
      targetId: "depthTable",
      tone: cards.length ? "warning" : "danger",
      lane: "Before advance",
      blocking: false
    });
  }

  // S101: window was hand-typed 8-10 while other surfaces used 9-11, and it
  // pointed at a target living in the overview tab.
  if (deadline.closing && !cards.some((card) => card.targetTab === "transactionsTab")) {
    cards.push({
      kicker: "Deadline window",
      title: "Price the market",
      detail: topNeed === "depth"
        ? `Check trade options before the deadline closes at the end of Week ${deadline.deadlineWeek}.`
        : `Shop for ${topNeed} help before the deadline closes at the end of Week ${deadline.deadlineWeek}.`,
      action: "open-tab",
      targetTab: "overviewTab",
      targetId: "tradeDeadlinePanel",
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
      targetId: "newsTable",
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
    commands: cards.map((card) => ({
      rank: card.rank,
      lane: card.lane,
      reasonCode: card.reasonCode,
      action: card.action,
      targetTab: card.targetTab || null,
      targetId: card.targetId || null
    }))
  };
}
export function hasBlockingFranchiseCommand(cards = []) {
  return cards.some((card) => card.blocking === true);
}
