/**
 * S108 — the Offseason Development Report card (History tab).
 *
 * Loaded lazily from `tabHistory.js`: the history island sits within 1% of
 * its 15% boot-budget headroom floor, and the fix for a tight island is to put
 * markup behind a dynamic import, never to raise `maxBytes`.
 *
 * Reads `offseasonPipeline.developmentReport`, which the runtime writes at the
 * retirements stage from the engine's own development ledger — so the rows
 * here are exactly the moves the offseason made, not a re-estimate.
 */
import { state } from "./appState.js";
import { renderTable, escapeHtml } from "./appCore.js";

const signed = (value) => `${Number(value) > 0 ? "+" : ""}${Number(value)}`;

export function developmentReportRows(report) {
  const rows = [];
  for (const [verdict, list] of [["Riser", report?.risers || []], ["Faller", report?.fallers || []]]) {
    for (const mover of list) {
      const potential = Number.isFinite(Number(mover.potential)) ? Number(mover.potential) : null;
      rows.push({
        playerId: mover.playerId,
        verdict,
        player: mover.name,
        pos: mover.position,
        age: mover.age,
        move: `${mover.before} → ${mover.after}`,
        change: signed(mover.change),
        pot: potential ?? "-",
        runway: potential == null ? "-" : signed(potential - Number(mover.after)),
        dev: mover.trait || "-"
      });
    }
  }
  return rows;
}

export function developmentReportSummary(report) {
  if (!report || !report.club) return "";
  const club = report.club;
  const league = report.league || {};
  const clubShare = club.progressed ? Math.round((club.improved / club.progressed) * 100) : 0;
  const leagueShare = league.progressed ? Math.round((league.improved / league.progressed) * 100) : 0;
  return `${report.year ?? ""} offseason: ${club.improved} of ${club.progressed} improved (${clubShare}%), ${club.declined} declined, net ${signed(club.netOverall)} OVR across the club. League: ${leagueShare}% improved, mean ${signed(league.meanChange ?? 0)} per player.`;
}

export function renderOffseasonDevelopmentReport() {
  // The league keeps the latest report (`dashboard.developmentReport`) so it
  // survives the season the report describes; the pipeline copy is the same
  // object while the offseason is still open.
  const report =
    state.dashboard?.developmentReport ||
    state.pipeline?.developmentReport ||
    state.dashboard?.offseasonPipeline?.developmentReport ||
    null;
  const summary = document.getElementById("offseasonDevelopmentSummary");
  const table = document.getElementById("offseasonDevelopmentTable");
  if (!summary || !table) return;
  if (!report || !report.club?.progressed) {
    summary.textContent = "Advance the retirements stage of an offseason to see your club's risers and fallers.";
    renderTable("offseasonDevelopmentTable", []);
    return;
  }
  summary.innerHTML = escapeHtml(developmentReportSummary(report));
  renderTable("offseasonDevelopmentTable", developmentReportRows(report));
}
