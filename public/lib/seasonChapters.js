export const SEASON_CHAPTER_SCHEMA_VERSION = "1.0";

function text(value, fallback) {
  const rendered = String(value ?? "").trim();
  return rendered || fallback;
}

function chapter({ id, label, title, detail, nextCall, targetTab = "overviewTab", targetId = "franchiseCommandCenter", tone = "accent", evidence = [] }) {
  return {
    schemaVersion: SEASON_CHAPTER_SCHEMA_VERSION,
    id,
    label,
    title,
    detail,
    nextCall,
    targetTab,
    targetId,
    tone,
    evidence,
    disclaimer: "Season chapters organize source-derived league milestones. They do not predict results or create a hidden bonus."
  };
}

export function buildSeasonChapter(dashboard = {}) {
  const phase = text(dashboard.phase, "unknown");
  const week = Math.max(0, Number(dashboard.currentWeek) || 0);
  const year = Number(dashboard.currentYear) || null;
  const opening = dashboard.openingContractProgress || null;
  const activePromise = dashboard.gmCommitments?.active?.[0] || null;
  const owner = dashboard.controlledTeam?.owner?.expectation || null;
  const evidence = [`phase:${phase}`, `week:${week || "unknown"}`, `year:${year || "unknown"}`];

  if (opening && opening.status !== "completed") {
    const nextStep = opening.steps?.find((entry) => !entry.complete) || null;
    return chapter({
      id: "opening-contract",
      label: "Opening Contract",
      title: text(nextStep?.label, "Establish the opening promise"),
      detail: text(opening.nextAction, nextStep?.detail || "Complete the source-named opening step."),
      nextCall: text(opening.nextAction, "Advance the opening week with a declared plan."),
      targetId: "openingContractCard",
      tone: "warning",
      evidence: [...evidence, `opening:${opening.status}`]
    });
  }

  if (phase === "regular-season") {
    if (week <= 4) return chapter({
      id: "foundation",
      label: "Foundation",
      title: "Prove the opening identity",
      detail: "The first month establishes whether the declared football identity survives live personnel and opponent pressure.",
      nextCall: "Reach the Week 5 checkpoint with a committed tactic and film receipt.",
      evidence
    });
    if (week <= 8) return chapter({
      id: "identity-test",
      label: "Identity Test",
      title: "Reinforce or counter the first film pattern",
      detail: "The opening sample now supports a deliberate continuity or adaptation call; it does not support a causal tactic claim.",
      nextCall: "Carry one explicit identity response into the trade-deadline window.",
      evidence
    });
    if (week <= 11) return chapter({
      id: "deadline-pressure",
      label: "Deadline Pressure",
      title: activePromise ? text(activePromise.label, "Honor the active General Manager promise") : "Choose what this roster is becoming",
      detail: activePromise
        ? `A source-recorded promise is active through Week ${activePromise.deadlineWeek ?? "?"}.`
        : "Buy, sell, or hold only through an explicit roster decision; silence is not a strategy receipt.",
      nextCall: activePromise
        ? `Resolve ${text(activePromise.label, "the active promise")} by Week ${activePromise.deadlineWeek ?? "?"}.`
        : "Review the deadline room and commit one roster direction.",
      targetTab: "transactionsTab",
      targetId: "tradeDeadlineFrenzy",
      tone: "warning",
      evidence: [...evidence, `promise:${activePromise?.id || "none"}`]
    });
    if (week <= 14) return chapter({
      id: "separation",
      label: "Separation",
      title: text(owner?.mandate, "Turn the roster decision into a finish"),
      detail: owner ? `${text(owner.trend, "watch")} owner trend · heat ${owner.heat ?? "?"}.` : "The deadline has passed; the next evidence is the team's late-season response.",
      nextCall: "Reach the final-month checkpoint with the active promise resolved.",
      evidence
    });
    return chapter({
      id: "playoff-push",
      label: "Playoff Push",
      title: text(owner?.mandate, "Close the regular season"),
      detail: owner ? `${text(owner.trend, "watch")} owner trend · heat ${owner.heat ?? "?"}.` : "Every remaining week now changes the source standings and postseason gate.",
      nextCall: "Commit the next weekly plan and reach the postseason gate without inferring the result.",
      tone: "danger",
      evidence
    });
  }

  if (phase === "postseason") return chapter({
    id: "postseason",
    label: "Postseason",
    title: "The season promise is under elimination pressure",
    detail: "The bracket and controlled-team game receipt are now the authority; regular-season projections no longer apply.",
    nextCall: "Review the matchup, declare the plan, and advance the next playoff gate.",
    tone: "danger",
    evidence
  });

  if (phase === "season-awards") return chapter({
    id: "season-reckoning",
    label: "Season Reckoning",
    title: "Turn the completed season into an architectural lesson",
    detail: "Awards, owner response, promises, film, and the epilogue now form the source record for this year.",
    nextCall: "Review the season receipt before authorizing the offseason transition.",
    targetTab: "historyTab",
    targetId: "seasonAwardsSpotlight",
    tone: "positive",
    evidence
  });

  if (phase === "offseason") {
    const stage = text(dashboard.offseasonPipeline?.stage, "offseason reset");
    return chapter({
      id: "offseason-blueprint",
      label: "Offseason Blueprint",
      title: `Build through ${stage.replace(/-/g, " ")}`,
      detail: "Roster, cap, staff, and draft authorities move only through their named offseason stage.",
      nextCall: text(dashboard.offseasonPipeline?.nextAction, `Complete ${stage.replace(/-/g, " ")} and inspect its receipt.`),
      targetTab: "contractsTab",
      targetId: "contractsSpotlight",
      tone: "info",
      evidence: [...evidence, `stage:${stage}`]
    });
  }

  return chapter({
    id: "league-state",
    label: "League State",
    title: "Load the next authoritative season milestone",
    detail: "No recognized chapter is active yet; the current phase remains visible rather than guessed.",
    nextCall: "Refresh the live franchise state before making a controlled decision.",
    tone: "muted",
    evidence
  });
}
