export const POST_COMMIT_HYDRATION_SCHEMA_VERSION = "1.0";

function safeMessage(error, fallback) {
  return String(error?.message || fallback || "Panel refresh failed.")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 240);
}

export async function coordinatePostCommitHydration({
  response,
  applyDashboard,
  loaders = [],
  recordFailure = () => {},
  resolveFailure = () => {}
} = {}) {
  const failures = [];
  let stateApplied = false;
  try {
    applyDashboard(response?.state);
    stateApplied = true;
    resolveFailure({ surface: "post-commit", operation: "dashboard" });
  } catch (error) {
    const message = safeMessage(error, "Committed state could not render.");
    failures.push({ name: "dashboard", message });
    recordFailure({
      surface: "post-commit",
      operation: "dashboard",
      error,
      severity: "degraded",
      retry: () => applyDashboard(response?.state)
    });
  }

  if (stateApplied) {
    const settled = await Promise.allSettled(loaders.map((loader) => loader.load()));
    settled.forEach((result, index) => {
      const loader = loaders[index];
      if (result.status === "fulfilled") {
        resolveFailure({ surface: "post-commit", operation: loader.name });
        return;
      }
      const message = safeMessage(result.reason, loader.name + " failed.");
      failures.push({ name: loader.name, message });
      recordFailure({
        surface: "post-commit",
        operation: loader.name,
        error: result.reason,
        severity: "degraded",
        retry: loader.load
      });
    });
  }

  const degraded = failures.length > 0;
  return {
    schemaVersion: POST_COMMIT_HYDRATION_SCHEMA_VERSION,
    kind: "post-commit-hydration-receipt",
    committed: true,
    degraded,
    actionStatus: degraded ? "committed-degraded" : "committed",
    statusText: degraded
      ? "Week committed · some panels need refresh"
      : "Week committed",
    commandReceipt: response?.commandReceipt || null,
    failedPanels: failures
  };
}
