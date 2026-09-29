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
import { state, TEAM_THEME_MAP } from "./appState.js";
import { recordClientDiagnostic } from "./clientDiagnostics.js";
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
  mountDevelopmentReportShareControl(report);
}

// S109 — the report card's shareable headline is the club's biggest riser,
// the one number on this card a player actually wants to brag about. Loaded
// lazily so a player who never shares never pays for momentCard.js.
function biggestRiser(report) {
  const risers = Array.isArray(report?.risers) ? report.risers : [];
  return risers.reduce((best, mover) => {
    const change = Number(mover?.change) || 0;
    return !best || change > (Number(best.change) || 0) ? mover : best;
  }, null);
}

function mountDevelopmentReportShareControl(report) {
  const host = document.getElementById("offseasonDevelopmentSummary")?.parentElement
    || document.getElementById("offseasonDevelopmentSummary");
  if (!host) return;
  const existing = host.querySelector(".moment-card-share-mount");
  if (existing) existing.remove();
  const riser = biggestRiser(report);
  if (!riser) return;
  const mount = document.createElement("div");
  mount.className = "moment-card-share-mount";
  host.appendChild(mount);
  import("./momentCard.js").then((momentCard) => {
    momentCard.mountShareControl(mount, () => {
      const d = state.dashboard || {};
      const teamAbbrev = d.controlledTeam?.abbrev || "";
      const theme = TEAM_THEME_MAP[teamAbbrev] || {};
      return {
        kind: "development-report",
        headline: `${riser.name} is rising`,
        subline: `${riser.position} · ${riser.before} → ${riser.after} OVR`,
        stats: [
          { label: "Change", value: `${Number(riser.change) > 0 ? "+" : ""}${riser.change}` },
          { label: "Age", value: riser.age ?? "-" },
          report.club ? { label: "Club Improved", value: `${report.club.improved}/${report.club.progressed}` } : null
        ].filter(Boolean),
        teamCode: teamAbbrev,
        teamName: d.controlledTeam?.name || "",
        primary: theme.primary,
        secondary: theme.secondary,
        seasonLabel: report.year ? `${report.year} Offseason` : "",
        challengeCode: momentCard.deriveActiveChallengeCode(state)
      };
    });
  }).catch((error) => recordClientDiagnostic({ surface: "moment-card", operation: "share-control", error, severity: "warning" }));
}
