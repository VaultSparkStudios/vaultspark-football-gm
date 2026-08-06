import { buildArchitectCut } from "./architectCut.js";

function numericYears(values = []) {
  return values.map(Number).filter(Number.isFinite);
}

export function buildDecisionAnthology({
  teamId,
  throughYear,
  architectLedger = [],
  transactions = [],
  draftHistory = [],
  limit = 5
} = {}) {
  const years = new Set([
    ...numericYears(architectLedger.map((entry) => entry?.year)),
    ...numericYears(transactions.map((entry) => entry?.year)),
    ...numericYears(draftHistory.map((entry) => entry?.year))
  ]);
  const ceiling = Number(throughYear);
  const ordered = [...years]
    .filter((year) => !Number.isFinite(ceiling) || year <= ceiling)
    .sort((left, right) => right - left)
    .slice(0, Math.max(1, Math.min(12, Number(limit) || 5)));
  const volumes = ordered.map((seasonYear) => {
    const cut = buildArchitectCut({ seasonYear, teamId, architectLedger, transactions, draftHistory });
    return {
      seasonYear,
      status: cut.status,
      turningPointCount: cut.turningPoints.length,
      headline: cut.turningPoints[0]?.title || "No receipted turning point",
      sourceCoverage: Object.values(cut.sources).filter((count) => count > 0).length,
      missingSources: cut.missingSources,
      turningPoints: cut.turningPoints
    };
  });
  return {
    schemaVersion: "1.0",
    kind: "decision-anthology",
    status: volumes.length ? (volumes.some((volume) => volume.status === "complete") ? "evidence-rich" : "partial") : "incomplete",
    seasonsObserved: volumes.length,
    volumes,
    disclaimer: "Volumes preserve the receipt coverage available in each season. Sparse years remain sparse, and editorial rank is not causal proof."
  };
}
