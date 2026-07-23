function safeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function nowLane(commands = [], latestLedger = null) {
  const card = commands.find((entry) => entry.action !== "blocked") || commands[0] || null;
  if (!card) {
    return {
      id: "now",
      label: "Now",
      authority: "Franchise Command",
      title: "Load the live franchise state",
      detail: "No ranked controlled action is available yet.",
      milestone: "Establish a playable league authority.",
      targetTab: "overviewTab",
      targetId: "franchiseCommandCenter",
      tone: "muted"
    };
  }
  return {
    id: "now",
    label: "Now",
    authority: safeText(card.reasonCode, "franchise-command"),
    title: safeText(card.title, "Review the next command"),
    detail: safeText(card.detail, card.reason),
    milestone: card.blocking ? "Resolve this controlled choice before advance." : safeText(latestLedger?.nextAdaptation, card.reason || "Commit the next source-derived action."),
    targetTab: card.targetTab || "overviewTab",
    targetId: card.action === "advance-week" ? "advanceWeekBtn" : "franchiseCommandCenter",
    tone: card.tone || "accent"
  };
}

function seasonLane(dashboard = {}) {
  const progress = dashboard.openingContractProgress || null;
  const expectation = dashboard.controlledTeam?.owner?.expectation || null;
  const nextStep = progress?.steps?.find((step) => !step.complete) || null;
  if (progress) {
    return {
      id: "season",
      label: "Season",
      authority: "Opening Contract",
      title: progress.status === "completed" ? "Opening promise observed" : safeText(nextStep?.label, "Advance the opening contract"),
      detail: safeText(progress.nextAction, nextStep?.detail || "The season contract is current."),
      milestone: nextStep ? `${nextStep.label}: ${safeText(nextStep.detail, "pending")}` : safeText(progress.result?.verdict, "Carry the contract into the season review."),
      targetTab: "overviewTab",
      targetId: "openingContractCard",
      tone: progress.status === "completed" ? "positive" : "warning"
    };
  }
  if (expectation?.mandate) {
    return {
      id: "season",
      label: "Season",
      authority: "Owner Expectation",
      title: expectation.mandate,
      detail: `${safeText(expectation.trend, "watch")} · heat ${expectation.heat ?? "—"}`,
      milestone: safeText(expectation.reasons?.[0], "Reach the next owner evaluation with evidence."),
      targetTab: "overviewTab",
      targetId: "ownerUltimatumBanner",
      tone: Number(expectation.heat || 0) >= 70 ? "danger" : "warning"
    };
  }
  return {
    id: "season",
    label: "Season",
    authority: "Season State",
    title: "No season contract loaded",
    detail: "Create a league and complete the opening contract to establish a season horizon.",
    milestone: "Choose a franchise identity and owner promise.",
    targetTab: "overviewTab",
    targetId: "openingContractCard",
    tone: "muted"
  };
}

function legacyLane(gmLegacy = null) {
  const persona = gmLegacy?.persona || null;
  const current = persona?.current || null;
  const next = persona?.next || null;
  if (!gmLegacy) {
    return {
      id: "legacy",
      label: "Legacy",
      authority: "General Manager Legacy",
      title: "Legacy authority loading",
      detail: "Career evidence appears after the live legacy receipt loads.",
      milestone: "Complete a season to establish a career record.",
      targetTab: "overviewTab",
      targetId: "gmLegacyCard",
      tone: "muted"
    };
  }
  return {
    id: "legacy",
    label: "Legacy",
    authority: `GM score ${gmLegacy.score ?? "—"} · ${safeText(gmLegacy.grade, "ungraded")}`,
    title: safeText(current?.name, gmLegacy.label || "Franchise architect"),
    detail: safeText(current?.description, "Career results and promises shape this standing."),
    milestone: next ? `${next.name}: ${Math.max(0, Number(next.gapToNext || 0))} points remain.` : "Peak recorded tier reached; defend it through future seasons.",
    targetTab: "overviewTab",
    targetId: "gmLegacyCard",
    tone: next ? "accent" : "positive"
  };
}

export function buildThreeHorizonBlueprint({ dashboard = {}, commands = [], gmLegacy = null, architectLedger = [] } = {}) {
  return [nowLane(commands, architectLedger[0] || null), seasonLane(dashboard), legacyLane(gmLegacy)];
}

export function architectLedgerRows(entries = [], limit = 6) {
  return entries.slice(0, Math.max(1, Number(limit) || 6)).map((entry) => ({
    id: entry.id,
    authority: `${entry.execution?.started?.year ?? "?"} W${entry.execution?.started?.week ?? "?"} → ${entry.execution?.completed?.year ?? "?"} W${entry.execution?.completed?.week ?? "?"}`,
    intent: [entry.intent?.gmDecision?.label, entry.intent?.tactic?.label].filter(Boolean).join(" + ") || "Advance with no explicit override",
    outcome: [entry.outcome?.result, entry.outcome?.score, entry.outcome?.observed].filter(Boolean).join(" · "),
    adaptation: safeText(entry.nextAdaptation, "Review the new state before the next command."),
    aligned: entry.outcome?.aligned ?? null,
    disclaimer: entry.disclaimer
  }));
}

export function buildArchitectureSignal(entries = [], limit = 8) {
  const sample = entries.slice(0, Math.max(1, Number(limit) || 8));
  const declared = sample.filter((entry) => entry.intent?.tactic?.id);
  if (!declared.length) {
    return {
      ready: false,
      sampleSize: sample.length,
      title: "Identity signal awaiting declared tactics",
      detail: "The ledger needs at least one committed tactic before it can describe decision consistency.",
      disclaimer: "No performance inference is made from an empty or undeclared sample."
    };
  }
  const counts = new Map();
  for (const entry of declared) {
    const key = entry.intent.tactic.id;
    counts.set(key, { label: entry.intent.tactic.label || key, count: (counts.get(key)?.count || 0) + 1 });
  }
  const dominant = [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))[0];
  const observedAlignment = declared.filter((entry) => typeof entry.outcome?.aligned === "boolean");
  const aligned = observedAlignment.filter((entry) => entry.outcome.aligned).length;
  const consistencyPct = Math.round((dominant.count / declared.length) * 100);
  const alignmentText = observedAlignment.length
    ? `${aligned}/${observedAlignment.length} film receipts aligned with declared intent`
    : "No alignment receipts are available yet";
  return {
    ready: true,
    sampleSize: sample.length,
    declaredCount: declared.length,
    title: `${dominant.label} is the leading declared identity`,
    detail: `${dominant.count}/${declared.length} declared tactics (${consistencyPct}% consistency) · ${alignmentText}.`,
    disclaimer: "This is a descriptive decision-memory signal, not evidence that a tactic caused wins or losses."
  };
}
