/**
 * Cap Alerts — Proactive Cap Health Warnings
 *
 * Generates prioritised alert objects for the controlled team's cap situation.
 * Alerts surface in the Overview command-deck and the Contracts tab spotlight.
 *
 * Alert shapes:
 *   { type, severity, headline, detail, teamId }
 *
 * Severity: "critical" | "warning" | "info"
 * Types: "cap-pressure" | "dead-cap" | "expiring-key" | "dead-cap-spike" | "cap-room"
 */

const CAP_PRESSURE_THRESHOLD  = 0.95; // 95% of cap used = warning
const CAP_CRITICAL_THRESHOLD  = 0.99; // 99% of cap used = critical
const DEAD_CAP_WARNING_RATIO   = 0.08; // dead cap > 8% of total cap = warning
const DEAD_CAP_CRITICAL_RATIO  = 0.14; // dead cap > 14% of total cap = critical
const KEY_PLAYER_RATING        = 84;   // OVR threshold for "key player"
const EXPIRING_CONTRACT_YEARS  = 1;    // final contract year = expiring

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * @param {object} capSummary  — result of GameSession.getTeamCapSummary(teamId)
 * @param {Array}  roster      — team's active roster
 * @param {number} currentYear
 * @returns {Array<object>}    sorted alerts (critical first)
 */
export function getCapAlerts(capSummary, roster, currentYear) {
  const alerts = [];

  if (!capSummary) return alerts;

  const { salaryCap = 0, usedCap = 0, deadCap = 0, capSpace = 0 } = capSummary;
  const usedRatio  = salaryCap > 0 ? usedCap / salaryCap : 0;
  const deadRatio  = salaryCap > 0 ? deadCap / salaryCap : 0;
  const spaceM     = (capSpace / 1_000_000).toFixed(1);
  const deadCapM   = (deadCap  / 1_000_000).toFixed(1);

  // ── Cap pressure ────────────────────────────────────────────────────────────
  if (usedRatio >= CAP_CRITICAL_THRESHOLD) {
    alerts.push({
      type: "cap-pressure",
      severity: "critical",
      headline: "Hard cap approaching — $" + spaceM + "M remaining",
      detail: "Only $" + spaceM + "M in space. Any injury or signing may push you over the hard cap. Cut or restructure before advancing."
    });
  } else if (usedRatio >= CAP_PRESSURE_THRESHOLD) {
    alerts.push({
      type: "cap-pressure",
      severity: "warning",
      headline: "Cap tight — $" + spaceM + "M remaining",
      detail: "95%+ of the cap is committed. Trades or signings will require corresponding cuts."
    });
  }

  // ── Dead cap burden ──────────────────────────────────────────────────────────
  if (deadRatio >= DEAD_CAP_CRITICAL_RATIO) {
    alerts.push({
      type: "dead-cap",
      severity: "critical",
      headline: "Dead cap burden: $" + deadCapM + "M",
      detail: "Your dead cap is over 14% of the total salary cap. You're paying for players who are no longer on the roster. Limit future guarantees."
    });
  } else if (deadRatio >= DEAD_CAP_WARNING_RATIO) {
    alerts.push({
      type: "dead-cap",
      severity: "warning",
      headline: "Dead cap: $" + deadCapM + "M (" + Math.round(deadRatio * 100) + "% of cap)",
      detail: "Recent releases and restructures have left significant dead money. Avoid further cuts unless necessary."
    });
  }

  // ── Expiring key player contracts ────────────────────────────────────────────
  if (Array.isArray(roster)) {
    const expiring = roster.filter((p) => {
      const years = p.contract?.years ?? p.contract?.length ?? 0;
      const yr    = p.contract?.year  ?? p.contract?.currentYear ?? 0;
      const remaining = years - yr;
      return (p.overall || 0) >= KEY_PLAYER_RATING && remaining <= EXPIRING_CONTRACT_YEARS && remaining >= 0;
    });

    for (const player of expiring.slice(0, 3)) {
      const remaining = (player.contract?.years ?? 0) - (player.contract?.year ?? 0);
      const salaryM = ((player.contract?.salary || player.contract?.capHit || 0) / 1_000_000).toFixed(1);
      alerts.push({
        type: "expiring-key",
        severity: remaining === 0 ? "critical" : "warning",
        headline: `${player.name} (${player.position}, ${player.overall} OVR) — contract ${remaining === 0 ? "expired" : "final year"}`,
        detail: `$${salaryM}M cap hit. ${remaining === 0 ? "Will be a free agent unless extended or tagged." : "Entering final contract year — extension window is open."}`
      });
    }
  }

  // ── Positive room signal ────────────────────────────────────────────────────
  if (capSpace > 25_000_000 && alerts.length === 0) {
    alerts.push({
      type: "cap-room",
      severity: "info",
      headline: "Strong cap position — $" + spaceM + "M available",
      detail: "You have meaningful room to add talent via free agency, trade, or extension. Consider locking up expiring core players."
    });
  }

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  return alerts;
}
