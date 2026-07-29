export function recommendContext({
  pctUsed,
  isSonnetExecTier = false,
  sonnetBreachPct = 0,
  compactImminent = false,
  turnsToCompact = null,
  warnAt = 0.75,
  continueCostPerTurn = 0,
  breakEvenTurns = null,
  remaining = 0
} = {}) {
  if (pctUsed >= 0.95) {
    return {
      recommendation: "CLOSEOUT",
      reason: "context effectively exhausted — continuation risks truncation"
    };
  }
  if (isSonnetExecTier && sonnetBreachPct >= 0.80) {
    return {
      recommendation: "CONSIDER_CLOSEOUT",
      reason: `Sonnet 200K guardrail — ${(sonnetBreachPct * 100).toFixed(0)}% of execute-tier limit · switch to opus or /closeout`
    };
  }
  if (compactImminent) {
    return {
      recommendation: "WARN_COMPACT_SOON",
      reason: `compaction predicted in ~${turnsToCompact} turn(s) at current burn rate — proactive autosave recommended`
    };
  }
  if (pctUsed >= warnAt) {
    return {
      recommendation: "CONSIDER_CLOSEOUT",
      reason: `context ${(pctUsed * 100).toFixed(0)}% used — fresh session saves ~${continueCostPerTurn} tokens/turn after ${breakEvenTurns} turns`
    };
  }
  if (pctUsed >= 0.50 && breakEvenTurns <= 3) {
    return {
      recommendation: "CONTINUE",
      reason: `fresh would pay off after ${breakEvenTurns} turns but you're only at ${(pctUsed * 100).toFixed(0)}% — keep going`
    };
  }
  return {
    recommendation: "CONTINUE",
    reason: `${(pctUsed * 100).toFixed(0)}% used · ${remaining.toLocaleString()} tokens remaining`
  };
}
