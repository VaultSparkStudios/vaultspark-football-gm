// Shared by the page fallback and worker without importing runtime or UI code.
export function recoverySnapshotBytes(snapshot) {
  // Diagnostic request counters/timings change without a gameplay mutation.
  // The full encoded snapshot and durable-source stamp still retain them.
  if (!snapshot.league || typeof snapshot.league !== "object") return JSON.stringify(snapshot);
  const { observability, ...league } = snapshot.league;
  return JSON.stringify({ ...snapshot, league });
}

export function recoverySnapshotIdentity(snapshot = {}) {
  const identity = {};
  for (const field of ["controlledTeamId", "startYear", "currentYear", "currentWeek", "phase", "mode"]) {
    if (snapshot[field] != null) identity[field] = snapshot[field];
  }
  const seed = snapshot.rngStreams?.baseSeed ?? snapshot.rngSeed;
  const franchiseId = snapshot.franchiseId || snapshot.franchiseKey ||
    (seed != null && snapshot.controlledTeamId ? `fa-${seed}-${snapshot.controlledTeamId}` : null);
  if (franchiseId) identity.franchiseId = franchiseId;
  return identity;
}
