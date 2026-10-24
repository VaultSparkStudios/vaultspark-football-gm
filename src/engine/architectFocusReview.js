export const ARCHITECT_FOCUS_REVIEW_SCHEMA_VERSION = "1.0";

const ACTIONS = Object.freeze({
  results: {
    targetTab: "overviewTab",
    targetId: "advanceWeekBtn",
    label: "Prepare your next week"
  },
  stewardship: {
    targetTab: "contractsTab",
    targetId: "contractsSpotlight",
    label: "Review contracts and cap pressure"
  },
  promise: {
    targetTab: "overviewTab",
    targetId: "franchiseCommandCenter",
    label: "Review your next General Manager call"
  },
  identity: {
    targetTab: "overviewTab",
    targetId: "advanceWeekBtn",
    label: "Prepare your next weekly plan"
  }
});

function sourcePath(portfolio, pathId) {
  return (portfolio?.paths || []).find((path) => path.id === pathId) || null;
}

export function captureArchitectFocusBaseline(portfolio, focusPathId, declaredAt = {}) {
  if (!focusPathId) return null;
  const path = sourcePath(portfolio, focusPathId);
  if (!path) return null;
  return {
    schemaVersion: ARCHITECT_FOCUS_REVIEW_SCHEMA_VERSION,
    pathId: path.id,
    label: path.label,
    score: Number(path.score || 0),
    evidenceCount: Number(path.evidenceCount || 0),
    evidence: path.evidence,
    declaredAt: {
      year: declaredAt.year ?? null,
      week: declaredAt.week ?? null,
      phase: declaredAt.phase || null
    },
    authority: "architect-mastery-portfolio"
  };
}

export function buildArchitectFocusReview({
  thesis = {},
  portfolio = {},
  year = null,
  week = null,
  phase = null
} = {}) {
  const pathId = thesis.focusPathId || null;
  const baseline = thesis.focusBaseline || null;
  const current = sourcePath(portfolio, pathId);
  if (!pathId || !baseline || !current) {
    return {
      schemaVersion: ARCHITECT_FOCUS_REVIEW_SCHEMA_VERSION,
      status: "awaiting-declaration",
      checkpoint: { year, week, phase },
      baseline: baseline || null,
      current: current || null,
      delta: null,
      newReceipt: false,
      nextAction: pathId ? ACTIONS[pathId] || null : null,
      summary: "Choose and save a mastery focus to establish a source-bound declaration baseline.",
      disclaimer: "This review compares recorded evidence; it does not infer that a decision caused an outcome."
    };
  }
  const scoreDelta = Number((Number(current.score || 0) - Number(baseline.score || 0)).toFixed(2));
  const evidenceDelta = Number(current.evidenceCount || 0) - Number(baseline.evidenceCount || 0);
  const newReceipt = evidenceDelta > 0;
  const status = newReceipt
    ? "new-source-receipt"
    : scoreDelta !== 0
      ? "source-recalculated"
      : "no-new-receipt";
  return {
    schemaVersion: ARCHITECT_FOCUS_REVIEW_SCHEMA_VERSION,
    status,
    checkpoint: { year, week, phase },
    baseline,
    current: {
      pathId: current.id,
      label: current.label,
      score: Number(current.score || 0),
      evidenceCount: Number(current.evidenceCount || 0),
      evidence: current.evidence,
      nextMilestone: current.nextMilestone
    },
    delta: { score: scoreDelta, evidenceCount: evidenceDelta },
    newReceipt,
    nextAction: ACTIONS[pathId] || null,
    summary: newReceipt
      ? `${evidenceDelta} new source receipt${evidenceDelta === 1 ? "" : "s"} moved this review beyond its declaration baseline.`
      : "No new source receipt has changed this focus since declaration.",
    disclaimer: "This review compares recorded evidence; it does not infer that a decision caused an outcome."
  };
}
