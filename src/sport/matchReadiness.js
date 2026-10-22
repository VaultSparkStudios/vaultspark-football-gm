// Availability is a pack-owned simulator prerequisite, not a league roster rule.
export class MatchReadinessError extends Error {
  constructor(readiness) {
    super(readiness.error);
    this.name = "MatchReadinessError";
    this.code = readiness.reasonCode;
    this.readiness = readiness;
  }
}

export function assertMatchReadiness(rules, context) {
  const readiness = rules.match.checkReadiness?.(context);
  if (readiness?.ok === false) throw new MatchReadinessError(readiness);
}
