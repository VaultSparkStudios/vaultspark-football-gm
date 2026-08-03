import { buildTacticalIdentityLedger } from "./tacticalFilmRoom.js";

export const SEASON_CHAPTER_SCHEMA_VERSION = "1.1";
export const SEASON_THESIS_SCHEMA_VERSION = "1.1";

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

function boundedIds(rows = [], limit = 12) {
  return [...new Set(rows.map((entry) => entry?.id || entry?.receiptId).filter(Boolean))].slice(0, limit);
}

function receiptWeek(entry = {}) {
  return Number(entry.week ?? entry.execution?.started?.week ?? 0);
}

function inWeekWindow(entry, start, end) {
  const week = receiptWeek(entry);
  return week >= start && week <= end;
}

const PHASE_ORDER = new Map([
  ["preseason", 0],
  ["regular-season", 10],
  ["postseason", 20],
  ["season-awards", 30],
  ["retirements", 40],
  ["staff", 41],
  ["combine", 42],
  ["pro-days", 43],
  ["free-agency", 44],
  ["draft", 45],
  ["udfa", 46],
  ["roster-cuts", 47],
  ["offseason-complete", 48]
]);

function phaseGateState(phase, phaseGate) {
  if (!phaseGate) return null;
  if (phase === phaseGate) return "at";
  const current = PHASE_ORDER.get(phase);
  const target = PHASE_ORDER.get(phaseGate);
  if (current == null || target == null) return "unknown";
  return current < target ? "before" : "after";
}

function evidenceAlignment(entry = {}) {
  if (typeof entry.aligned === "boolean") return entry.aligned;
  if (typeof entry.outcome?.aligned === "boolean") return entry.outcome.aligned;
  return null;
}

function classifyCheckpointEvidence(rows = []) {
  const evidenceIds = boundedIds(rows, 8);
  const alignedEvidenceIds = boundedIds(rows.filter((entry) => evidenceAlignment(entry) === true), 8);
  const contestedEvidenceIds = boundedIds(rows.filter((entry) => evidenceAlignment(entry) === false), 8);
  return { evidenceIds, alignedEvidenceIds, contestedEvidenceIds };
}

function checkpointStatus({ currentWeek, start, end, evidence, phase, phaseGate = null, kind = "evaluative" }) {
  const gateState = phaseGateState(phase, phaseGate);
  if (phaseGate && (gateState === "before" || gateState === "unknown")) return "upcoming";
  if (!phaseGate && currentWeek < start) return "upcoming";
  if (kind === "declaration") return evidence.evidenceIds.length ? "declared" : "unproven";
  if (evidence.alignedEvidenceIds.length) return "evidenced-aligned";
  if (evidence.contestedEvidenceIds.length) return "evidenced-contested";
  if (evidence.evidenceIds.length) return "evidenced";
  if (phaseGate) return gateState === "at" ? "open" : "unproven";
  if (currentWeek > end) return "unproven";
  return "open";
}

export function buildSeasonThesisLedger(dashboard = {}) {
  const year = Number(dashboard.currentYear) || null;
  const currentWeek = Math.max(0, Number(dashboard.currentWeek) || 0);
  const phase = text(dashboard.phase, "unknown");
  const opening = dashboard.startScenarioReceipt || null;
  const identity = opening?.effects?.identity || null;
  const openingReceiptId = opening?.receiptId || null;
  const thesisId = openingReceiptId && year ? `${openingReceiptId}:season:${year}` : null;
  const film = (dashboard.tacticalFilmLedger || []).filter((entry) =>
    Number(entry?.year) === year || (!entry?.year && currentWeek <= 1)
  );
  const architect = (dashboard.architectLedger || []).filter((entry) => Number(entry?.year) === year);
  const activeCommitments = (dashboard.gmCommitments?.active || []).filter((entry) =>
    !entry?.createdYear || Number(entry.createdYear) === year
  );
  const latestCommitment = Number(dashboard.gmCommitments?.latestReceipt?.year) === year
    ? dashboard.gmCommitments.latestReceipt
    : null;
  const checkpointRows = [
    { id: "opening-contract", start: 0, end: 1, kind: "declaration", rows: openingReceiptId ? [{ id: openingReceiptId }] : [] },
    { id: "foundation", start: 1, end: 4, rows: [...film, ...architect].filter((entry) => inWeekWindow(entry, 1, 4)) },
    { id: "identity-test", start: 5, end: 8, rows: [...film, ...architect].filter((entry) => inWeekWindow(entry, 5, 8)) },
    { id: "deadline-pressure", start: 9, end: 11, kind: "observational", rows: [...activeCommitments, ...(latestCommitment ? [latestCommitment] : [])] },
    { id: "separation", start: 12, end: 14, rows: [...film, ...architect].filter((entry) => inWeekWindow(entry, 12, 14)) },
    { id: "playoff-push", start: 15, end: 18, rows: [...film, ...architect].filter((entry) => inWeekWindow(entry, 15, 18)) },
    { id: "postseason", phaseGate: "postseason", rows: [...film, ...architect].filter((entry) => receiptWeek(entry) >= 19) },
    { id: "season-reckoning", phaseGate: "season-awards", rows: [...film, ...architect, ...(latestCommitment ? [latestCommitment] : [])] }
  ];
  const checkpoints = checkpointRows.map((entry) => {
    const evidence = classifyCheckpointEvidence(entry.rows);
    return {
      id: entry.id,
      status: checkpointStatus({
        currentWeek,
        start: entry.start ?? 0,
        end: entry.end ?? Number.MAX_SAFE_INTEGER,
        evidence,
        phase,
        phaseGate: entry.phaseGate || null,
        kind: entry.kind || "evaluative"
      }),
      ...evidence
    };
  });
  const identityLedger = buildTacticalIdentityLedger(film);
  const evaluatedRows = [...film, ...architect];
  const aligned = evaluatedRows.filter((entry) => evidenceAlignment(entry) === true).length;
  const contested = evaluatedRows.filter((entry) => evidenceAlignment(entry) === false).length;
  const alignedCheckpoints = checkpoints.filter((entry) => entry.status === "evidenced-aligned").length;
  const evidencedCheckpoints = checkpoints.filter((entry) => entry.status.startsWith("evidenced-") || entry.status === "evidenced").length;
  const sourceIds = boundedIds([
    ...(openingReceiptId ? [{ id: openingReceiptId }] : []),
    ...film,
    ...architect,
    ...activeCommitments,
    ...(latestCommitment ? [latestCommitment] : [])
  ]);
  const status = !thesisId
    ? "unproven"
    : aligned >= 3 && alignedCheckpoints >= 2
      ? "established"
      : evidencedCheckpoints > 0
        ? "installing"
        : "declared";
  return {
    schemaVersion: SEASON_THESIS_SCHEMA_VERSION,
    kind: "season-thesis-ledger",
    thesisId,
    available: Boolean(thesisId),
    year,
    openingReceiptId,
    identity: {
      id: identity?.id || opening?.selections?.identity || null,
      label: text(identity?.label, "Opening Contract identity not available")
    },
    status,
    checkpoints,
    receipts: {
      sourceIds,
      tacticalFilm: film.length,
      alignedTargets: aligned,
      contestedTargets: contested,
      architectReviews: architect.length,
      activeCommitments: activeCommitments.length,
      latestCommitmentStatus: latestCommitment?.status || null
    },
    reckoning: {
      status,
      summary: thesisId
        ? `${film.length} executed tactical call${film.length === 1 ? "" : "s"} · ${aligned} aligned source receipt${aligned === 1 ? "" : "s"} · ${contested} contested source receipt${contested === 1 ? "" : "s"} · ${architect.length} Architect review${architect.length === 1 ? "" : "s"}${identityLedger ? ` · ${identityLedger.summary}` : ""}`
        : "No exact Opening Contract receipt is available; the season thesis remains unproven.",
      disclaimer: "The reckoning summarizes bounded source receipts. It does not claim the thesis caused results, predict an outcome, or grant a hidden bonus."
    }
  };
}

function bindChapterToThesis(base, thesis, checkpointId) {
  const checkpoint = thesis.checkpoints.find((entry) => entry.id === checkpointId)
    || { id: checkpointId, status: "unproven", evidenceIds: [] };
  const thesisLine = thesis.available
    ? `Season thesis: ${thesis.identity.label} · checkpoint ${checkpoint.status}.`
    : "Season thesis: unproven — no exact Opening Contract receipt is available.";
  return {
    ...base,
    detail: `${base.detail} ${thesisLine}`,
    evidence: [...new Set([
      ...(base.evidence || []),
      ...(thesis.thesisId ? [`thesis:${thesis.thesisId}`] : []),
      ...checkpoint.evidenceIds.map((id) => `receipt:${id}`)
    ])],
    seasonThesis: {
      schemaVersion: thesis.schemaVersion,
      thesisId: thesis.thesisId,
      identity: thesis.identity,
      checkpointId,
      checkpointStatus: checkpoint.status,
      evidenceIds: checkpoint.evidenceIds,
      alignedEvidenceIds: checkpoint.alignedEvidenceIds || [],
      contestedEvidenceIds: checkpoint.contestedEvidenceIds || [],
      reckoning: checkpointId === "season-reckoning" ? thesis.reckoning : null
    }
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
  const thesis = buildSeasonThesisLedger(dashboard);

  if (opening && opening.status !== "completed") {
    const nextStep = opening.steps?.find((entry) => !entry.complete) || null;
    return bindChapterToThesis(chapter({
      id: "opening-contract",
      label: "Opening Contract",
      title: text(nextStep?.label, "Establish the opening promise"),
      detail: text(opening.nextAction, nextStep?.detail || "Complete the source-named opening step."),
      nextCall: text(opening.nextAction, "Advance the opening week with a declared plan."),
      targetId: "openingContractCard",
      tone: "warning",
      evidence: [...evidence, `opening:${opening.status}`]
    }), thesis, "opening-contract");
  }

  if (phase === "regular-season") {
    if (week <= 4) return bindChapterToThesis(chapter({
      id: "foundation",
      label: "Foundation",
      title: "Prove the opening identity",
      detail: "The first month establishes whether the declared football identity survives live personnel and opponent pressure.",
      nextCall: "Reach the Week 5 checkpoint with a committed tactic and film receipt.",
      evidence
    }), thesis, "foundation");
    if (week <= 8) return bindChapterToThesis(chapter({
      id: "identity-test",
      label: "Identity Test",
      title: "Reinforce or counter the first film pattern",
      detail: "The opening sample now supports a deliberate continuity or adaptation call; it does not support a causal tactic claim.",
      nextCall: "Carry one explicit identity response into the trade-deadline window.",
      evidence
    }), thesis, "identity-test");
    if (week <= 11) return bindChapterToThesis(chapter({
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
    }), thesis, "deadline-pressure");
    if (week <= 14) return bindChapterToThesis(chapter({
      id: "separation",
      label: "Separation",
      title: text(owner?.mandate, "Turn the roster decision into a finish"),
      detail: owner ? `${text(owner.trend, "watch")} owner trend · heat ${owner.heat ?? "?"}.` : "The deadline has passed; the next evidence is the team's late-season response.",
      nextCall: "Reach the final-month checkpoint with the active promise resolved.",
      evidence
    }), thesis, "separation");
    return bindChapterToThesis(chapter({
      id: "playoff-push",
      label: "Playoff Push",
      title: text(owner?.mandate, "Close the regular season"),
      detail: owner ? `${text(owner.trend, "watch")} owner trend · heat ${owner.heat ?? "?"}.` : "Every remaining week now changes the source standings and postseason gate.",
      nextCall: "Commit the next weekly plan and reach the postseason gate without inferring the result.",
      tone: "danger",
      evidence
    }), thesis, "playoff-push");
  }

  if (phase === "postseason") return bindChapterToThesis(chapter({
    id: "postseason",
    label: "Postseason",
    title: "The season promise is under elimination pressure",
    detail: "The bracket and controlled-team game receipt are now the authority; regular-season projections no longer apply.",
    nextCall: "Review the matchup, declare the plan, and advance the next playoff gate.",
    tone: "danger",
    evidence
  }), thesis, "postseason");

  if (phase === "season-awards") return bindChapterToThesis(chapter({
    id: "season-reckoning",
    label: "Season Reckoning",
    title: "Turn the completed season into an architectural lesson",
    detail: "Awards, owner response, promises, film, and the epilogue now form the source record for this year.",
    nextCall: "Review the season receipt before authorizing the offseason transition.",
    targetTab: "historyTab",
    targetId: "seasonAwardsSpotlight",
    tone: "positive",
    evidence
  }), thesis, "season-reckoning");

  if (phase === "offseason") {
    // The free-agency window is the one offseason stage that holds for the GM,
    // so it gets its own call rather than the generic build-through-a-stage
    // copy. Every number is read from the window itself — no projection.
    const window = dashboard.freeAgencyWindow || null;
    if (window?.open) {
      const wave = Math.max(1, Number(window.wave) || 1);
      const total = Math.max(wave, Number(window.totalWaves) || wave);
      const premium = Math.max(0, Number(window.premiumAvailable) || 0);
      return chapter({
        id: "free-agency-window",
        label: "Free Agency",
        title: `Wave ${wave} of ${total} — ${premium} premium free agent${premium === 1 ? "" : "s"} on the board`,
        detail:
          "Rival front offices are bidding on the same names. A premium free agent signs through the market, not on demand, so an offer that wins is the only offer that counts.",
        nextCall:
          premium > 0
            ? "Open Free Agency, submit offers, then advance to resolve the wave."
            : "The premium board is clear — advance to close the window.",
        targetTab: "faTab",
        targetId: "faTable",
        tone: "warning",
        evidence: [
          ...evidence,
          `stage:free-agency`,
          `wave:${wave}/${total}`,
          `premium:${premium}`,
          `signed:${Math.max(0, Number(window.signed) || 0)}`
        ]
      });
    }

    const shortfall = dashboard.rosterShortfall || null;
    if (shortfall?.positions?.length) {
      const summary = shortfall.positions.map((row) => `${row.missing}× ${row.position}`).join(", ");
      return chapter({
        id: "roster-shortfall",
        label: "Roster Shortfall",
        title: `Your roster is short: ${summary}`,
        detail:
          "The league's depth backstop fills rival rosters but never yours — those are your decisions. Sign, claim, or draft to reach a legal roster.",
        nextCall: "Fill the named holes from free agency, waivers, or the draft before camp breaks.",
        targetTab: "faTab",
        targetId: "faTable",
        tone: "warning",
        evidence: [...evidence, `shortfall:${shortfall.positions.length}`]
      });
    }

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
