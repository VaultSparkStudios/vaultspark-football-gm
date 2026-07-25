import { computeGmLegacyScore, initGmLegacy } from "./gmLegacyScore.js";

function boundedScore(value, max = 25) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function masteryPath({ id, label, score, evidenceCount, evidence, nextMilestone }) {
  const safeScore = boundedScore(score);
  return {
    id,
    label,
    score: safeScore,
    maxScore: 25,
    evidenceCount,
    status: evidenceCount === 0 ? "awaiting-evidence" : safeScore >= 20 ? "signature-strength" : safeScore >= 12 ? "established" : "emerging",
    evidence,
    nextMilestone
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
  const observed = declared.filter((entry) => entry.outcome?.aligned != null);
  const aligned = observed.filter((entry) => entry.outcome.aligned === true).length;
  const tacticIds = new Set(declared.map((entry) => entry.intent?.tactic?.id).filter(Boolean));
  const identity = masteryPath({
    id: "identity",
    label: "Architect Identity",
    score: declared.length
      ? Math.min(10, declared.length * 2) +
        (observed.length ? (aligned / observed.length) * 10 : 0) +
        Math.min(5, tacticIds.size * 1.25)
      : 0,
    evidenceCount: declared.length,
    evidence: declared.length
      ? `${declared.length} declared decision receipt${declared.length === 1 ? "" : "s"}; ${observed.length} tactic${observed.length === 1 ? "" : "s"} observed; ${aligned} aligned; ${tacticIds.size} distinct tactical identit${tacticIds.size === 1 ? "y" : "ies"}.`
      : "No declared tactic or General Manager decision has a committed Architect receipt.",
    nextMilestone: declared.length ? "Review the latest film receipt and deliberately reinforce or counter it." : "Declare a tactic, advance one week, and review its film receipt."
  });

  const paths = [results, stewardship, promise, identity];
  const score = paths.reduce((sum, path) => sum + path.score, 0);
  const focusPath = paths.slice().sort(
    (left, right) => left.score - right.score || left.evidenceCount - right.evidenceCount
  )[0];
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
      pathId: focusPath.id,
      label: focusPath.label,
      reason: focusPath.evidenceCount === 0
        ? "This path has no committed evidence yet."
        : `This is the lowest current path at ${focusPath.score}/25.`,
      nextMilestone: focusPath.nextMilestone
    },
    signature: signaturePath ? {
      pathId: signaturePath.id,
      label: signaturePath.label,
      score: signaturePath.score
    } : null,
    disclaimer: "Mastery is a source-derived portfolio, not a causal claim or hidden gameplay bonus. Empty paths remain visibly empty."
  };
}
