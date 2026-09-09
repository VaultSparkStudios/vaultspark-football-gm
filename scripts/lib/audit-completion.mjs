const COMPLETED_STATUSES = new Set(["done", "shipped", "implemented", "complete", "completed"]);

// Only an explicit completion status closes an audit item; prose is not evidence.
export function isAuditComplete(status) {
  return typeof status === "string" && COMPLETED_STATUSES.has(status.trim().toLowerCase());
}
