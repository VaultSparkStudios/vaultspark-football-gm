const DECISION_CATALOG = {
  "trade-deadline": {
    buy: {
      label: "Buy",
      headline: "GM mandate: buy at the trade deadline",
      effect: "front office is hunting veteran upgrades",
      transactionType: "gm-decision-buy",
      momentum: 2,
      risk: 2,
      targetTab: "contractsTab"
    },
    sell: {
      label: "Sell",
      headline: "GM mandate: sell at the trade deadline",
      effect: "front office is stockpiling draft capital",
      transactionType: "gm-decision-sell",
      momentum: -1,
      risk: -1,
      targetTab: "draftTab"
    },
    hold: {
      label: "Hold",
      headline: "GM mandate: hold the roster course",
      effect: "front office is preserving flexibility",
      transactionType: "gm-decision-hold",
      momentum: 0,
      risk: 0,
      targetTab: "overviewTab"
    }
  },
  "qb-injury": {
    "fa-qb": {
      label: "Sign Veteran QB",
      headline: "GM mandate: stabilize the quarterback room",
      effect: "pro scouting is prioritizing veteran quarterbacks",
      transactionType: "gm-decision-qb-fa",
      momentum: 1,
      risk: 1,
      targetTab: "rosterTab"
    },
    "start-backup": {
      label: "Start Backup",
      headline: "GM mandate: develop the backup quarterback",
      effect: "coaches are protecting the young quarterback plan",
      transactionType: "gm-decision-qb-backup",
      momentum: -1,
      risk: 0,
      targetTab: "rosterTab"
    },
    "trade-qb": {
      label: "Trade for QB",
      headline: "GM mandate: explore quarterback trades",
      effect: "trade desk is pricing quarterback upgrades",
      transactionType: "gm-decision-qb-trade",
      momentum: 2,
      risk: 3,
      targetTab: "contractsTab"
    }
  },
  "cap-crisis": {
    restructure: {
      label: "Restructure",
      headline: "GM mandate: restructure key contracts",
      effect: "cap desk is opening immediate flexibility",
      transactionType: "gm-decision-cap-restructure",
      momentum: 1,
      risk: 2,
      targetTab: "contractsTab"
    },
    release: {
      label: "Release",
      headline: "GM mandate: cut salary now",
      effect: "roster desk is identifying painful releases",
      transactionType: "gm-decision-cap-release",
      momentum: -2,
      risk: -1,
      targetTab: "contractsTab"
    },
    wait: {
      label: "Wait",
      headline: "GM mandate: monitor the cap crisis",
      effect: "front office is accepting short-term cap pressure",
      transactionType: "gm-decision-cap-wait",
      momentum: 0,
      risk: 3,
      targetTab: "settingsTab"
    }
  }
};

function normalizePayload(payload = {}) {
  const decisionId = String(payload.decisionId || payload.id || "").trim().toLowerCase();
  const choiceId = String(payload.choiceId || payload.choice || "").trim().toLowerCase();
  if (!decisionId || !choiceId) return null;
  return {
    decisionId,
    choiceId,
    type: payload.type ? String(payload.type).trim() : null,
    week: Number.isFinite(Number(payload.week)) ? Number(payload.week) : null
  };
}

export function resolveGmDecisionConsequence(payload = {}) {
  const normalized = normalizePayload(payload);
  if (!normalized) return null;
  const definition = DECISION_CATALOG[normalized.decisionId]?.[normalized.choiceId];
  if (!definition) return null;
  return {
    ...normalized,
    ...definition,
    appliedAt: Date.now()
  };
}

export function applyGmDecisionConsequence(session, payload = {}) {
  const consequence = resolveGmDecisionConsequence(payload);
  if (!consequence || !session?.league) {
    return { ok: false, applied: false, error: "Unknown GM decision choice." };
  }

  const teamId = session.controlledTeamId || null;
  if (!Array.isArray(session.league.gmDecisionLedger)) session.league.gmDecisionLedger = [];
  const entry = {
    id: `GMD-${session.currentYear}-${session.currentWeek}-${session.league.gmDecisionLedger.length + 1}`,
    year: session.currentYear,
    week: session.currentWeek,
    phase: session.phase,
    teamId,
    decisionId: consequence.decisionId,
    choiceId: consequence.choiceId,
    type: consequence.type,
    label: consequence.label,
    effect: consequence.effect,
    momentum: consequence.momentum,
    risk: consequence.risk,
    targetTab: consequence.targetTab,
    appliedAt: consequence.appliedAt
  };
  session.league.gmDecisionLedger.push(entry);
  if (session.league.gmDecisionLedger.length > 120) {
    session.league.gmDecisionLedger = session.league.gmDecisionLedger.slice(-120);
  }

  if (typeof session.logTransaction === "function") {
    session.logTransaction({
      type: consequence.transactionType,
      teamId,
      details: {
        decisionId: consequence.decisionId,
        choiceId: consequence.choiceId,
        label: consequence.label,
        effect: consequence.effect,
        momentum: consequence.momentum,
        risk: consequence.risk
      }
    });
  }
  if (typeof session.logNews === "function") {
    session.logNews(`${consequence.headline}: ${consequence.effect}.`, {
      type: "gm-decision",
      teamId,
      decisionId: consequence.decisionId,
      choiceId: consequence.choiceId,
      targetTab: consequence.targetTab
    });
  }
  if (typeof session.appendEvent === "function") {
    session.appendEvent("gm-decision", entry);
  }

  return { ok: true, applied: true, decision: entry };
}

export function latestGmDecision(league = {}) {
  const ledger = Array.isArray(league.gmDecisionLedger) ? league.gmDecisionLedger : [];
  return ledger.length ? ledger[ledger.length - 1] : null;
}
