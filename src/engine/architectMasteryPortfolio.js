import { computeGmLegacyScore, initGmLegacy } from "./gmLegacyScore.js";

function boundedScore(value, max = 25) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function masteryPath({ id, label, score, evidenceCount, evidence, nextMilestone, breakdown = null }) {
  const safeScore = boundedScore(score);
  return {
    id,
    label,
    score: safeScore,
    maxScore: 25,
    evidenceCount,
    status: evidenceCount === 0 ? "awaiting-evidence" : safeScore >= 20 ? "signature-strength" : safeScore >= 12 ? "established" : "emerging",
    evidence,
    nextMilestone,
    breakdown
  };
}

export function buildAdaptiveIdentityEvidence(entries = []) {
  const declared = entries.filter((entry) => entry.intent?.tactic || entry.intent?.gmDecision);
  const tactics = entries
    .filter((entry) => entry.intent?.tactic?.id)
    .slice()
    .reverse();
  const transitions = tactics.slice(1).map((current, index) => {
    const previous = tactics[index];
    const from = previous.intent.tactic.id;
    const to = current.intent.tactic.id;
    const priorMisaligned = previous.outcome?.aligned === false;
    return {
      from,
      to,
      continuous: from === to,
      adaptation: priorMisaligned ? (from === to ? "reinforce" : "counter") : null
    };
  });
  const continuous = transitions.filter((entry) => entry.continuous).length;
  const adaptations = transitions.filter((entry) => entry.adaptation);
  const reinforce = adaptations.filter((entry) => entry.adaptation === "reinforce").length;
  const counter = adaptations.filter((entry) => entry.adaptation === "counter").length;
  const receiptScore = Math.min(10, declared.length * 2);
  const continuityScore = transitions.length ? (continuous / transitions.length) * 8 : 0;
  const adaptationScore = Math.min(7, adaptations.length * 3.5);
  const score = boundedScore(receiptScore + continuityScore + adaptationScore);
  return {
    score,
    declaredReceipts: declared.length,
    tacticReceipts: tactics.length,
    transitions: transitions.length,
    continuous,
    adaptations: adaptations.length,
    reinforce,
    counter,
    components: {
      committedEvidence: boundedScore(receiptScore, 10),
      continuity: boundedScore(continuityScore, 8),
      observedAdaptation: boundedScore(adaptationScore, 7)
    },
    summary: `${continuous}/${transitions.length} tactic transitions reinforced identity; ${adaptations.length} source-observed response${adaptations.length === 1 ? "" : "s"} after misaligned film (${reinforce} reinforce, ${counter} counter).`,
    disclaimer: "Continuity and observed changes describe committed decisions. They do not prove a tactic caused results."
  };
}

export function buildArchitectMasteryPortfolio(league = {}, teamId = null) {
  const legacy = initGmLegacy(league);
  const seasons = Number(legacy.seasonsServed || 0);
  const legacyScore = computeGmLegacyScore(legacy);
  const results = masteryPath({
    id: "results",
    label: "Competitive Results",
    score: legacyScore.score * 0.25,
    evidenceCount: seasons,
    evidence: seasons
      ? `${legacy.totalWins}-${legacy.totalLosses} across ${seasons} completed season${seasons === 1 ? "" : "s"}; ${legacy.playoffAppearances} playoff appearance${legacy.playoffAppearances === 1 ? "" : "s"}.`
      : "No completed season has been logged.",
    nextMilestone: seasons ? "Complete the next season and let the record—not a projection—move this path." : "Complete one season to establish a results baseline."
  });

  const avgCap = seasons ? Number(legacy.capGradeTotal || 0) / seasons : 0;
  const avgCulture = seasons ? Number(legacy.cultureGradeTotal || 0) / seasons : 0;
  const stewardship = masteryPath({
    id: "stewardship",
    label: "Franchise Stewardship",
    score: seasons ? avgCap * 0.13 + avgCulture * 0.12 : 0,
    evidenceCount: seasons,
    evidence: seasons
      ? `Career cap grade ${Math.round(avgCap)}; culture grade ${Math.round(avgCulture)}; trade net Approximate Value ${Number(legacy.tradeNetAV || 0)}.`
      : "Cap and culture grades are recorded only at season close.",
    nextMilestone: seasons ? "Raise the lower of cap discipline and culture health at the next season receipt." : "Reach season close with a valid cap and culture receipt."
  });

  const commitments = (league.gmCommitments || []).filter((entry) => !teamId || entry.teamId === teamId);
  const resolvedCommitments = commitments.filter((entry) => ["succeeded", "failed"].includes(entry.status));
  const kept = resolvedCommitments.filter((entry) => entry.status === "succeeded").length;
  const promise = masteryPath({
    id: "promise",
    label: "Promise Keeping",
    score: resolvedCommitments.length
      ? (kept / resolvedCommitments.length) * 20 + Math.min(5, resolvedCommitments.length)
      : 0,
    evidenceCount: resolvedCommitments.length,
    evidence: resolvedCommitments.length
      ? `${kept} of ${resolvedCommitments.length} resolved General Manager promise${resolvedCommitments.length === 1 ? "" : "s"} kept; ${commitments.filter((entry) => entry.status === "active").length} active.`
      : "No General Manager promise has reached a source-verified resolution.",
    nextMilestone: resolvedCommitments.length ? "Resolve the next named commitment before its recorded deadline." : "Make and resolve one explicit General Manager commitment."
  });

  const architectEntries = (league.architectLedger || []).filter((entry) => !teamId || entry.teamId === teamId);
  const declared = architectEntries.filter((entry) => entry.intent?.tactic || entry.intent?.gmDecision);
  const identityEvidence = buildAdaptiveIdentityEvidence(architectEntries);
  const identity = masteryPath({
    id: "identity",
    label: "Architect Identity",
    score: identityEvidence.score,
    evidenceCount: declared.length,
    evidence: declared.length
      ? `${declared.length} declared decision receipt${declared.length === 1 ? "" : "s"}. ${identityEvidence.summary}`
      : "No declared tactic or General Manager decision has a committed Architect receipt.",
    nextMilestone: declared.length ? "Review the latest film receipt and deliberately reinforce or counter it." : "Declare a tactic, advance one week, and review its film receipt.",
    breakdown: identityEvidence
  });

  const paths = [results, stewardship, promise, identity];
  const score = paths.reduce((sum, path) => sum + path.score, 0);
  const focusPath = paths.slice().sort(
    (left, right) => left.score - right.score || left.evidenceCount - right.evidenceCount
  )[0];
  const selectedFocusId = teamId ? league.architectTheses?.[teamId]?.focusPathId : null;
  const selectedFocus = paths.find((path) => path.id === selectedFocusId) || null;
  const activeFocus = selectedFocus || focusPath;
  const signaturePath = paths.filter((path) => path.evidenceCount > 0).sort(
    (left, right) => right.score - left.score || right.evidenceCount - left.evidenceCount
  )[0] || null;
  return {
    schemaVersion: "1.0",
    score,
    maxScore: 100,
    label: score >= 80 ? "Complete Franchise Architect" : score >= 60 ? "Multi-Path Builder" : score >= 35 ? "Emerging Architect" : "Portfolio In Formation",
    evidenceCount: paths.reduce((sum, path) => sum + path.evidenceCount, 0),
    paths,
    focus: {
      pathId: activeFocus.id,
      label: activeFocus.label,
      source: selectedFocus ? "player-authored" : "system-recommendation",
      reason: selectedFocus ? "You selected this path as the current Architect thesis focus." : focusPath.evidenceCount === 0
        ? "This path has no committed evidence yet."
        : `This is the lowest current path at ${focusPath.score}/25.`,
      nextMilestone: activeFocus.nextMilestone
    },
    recommendedFocus: {
      pathId: focusPath.id,
      label: focusPath.label,
      reason: focusPath.evidenceCount === 0 ? "This path has no committed evidence yet." : `This is the lowest current path at ${focusPath.score}/25.`
    },
    thesis: teamId ? league.architectTheses?.[teamId] || null : null,
    signature: signaturePath ? {
      pathId: signaturePath.id,
      label: signaturePath.label,
      score: signaturePath.score,
      maxScore: signaturePath.maxScore,
      evidenceCount: signaturePath.evidenceCount,
      status: signaturePath.status
    } : null,
    disclaimer: "Mastery is a source-derived portfolio, not a causal claim or hidden gameplay bonus. Empty paths remain visibly empty."
  };
}
