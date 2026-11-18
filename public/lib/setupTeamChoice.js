// Team choice on the start page. The hero picker and the "Your Team" picker
// share one option list and one rule: "Surprise me" means a random club.

export const RANDOM_TEAM_VALUE = "__random__";

function escapeOption(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function teamOptionsHtml(teams = [], randomLabel = "Surprise me") {
  return `<option value="${RANDOM_TEAM_VALUE}">${escapeOption(randomLabel)}</option>` +
    (Array.isArray(teams) ? teams : [])
      .map((team) => `<option value="${escapeOption(team.id)}">${escapeOption(team.abbrev || team.id || "-")} - ${escapeOption(team.name)}</option>`)
      .join("");
}

// A value that is not a listed club (stale, empty, or "Surprise me") falls back
// to the random option, so a picker can never submit a club that does not exist.
export function keepTeamChoice(chosen, teams = []) {
  return (Array.isArray(teams) ? teams : []).some((team) => team.id === chosen) ? chosen : RANDOM_TEAM_VALUE;
}

export function resolveTeamChoice(chosen, teams = [], random = Math.random) {
  const kept = keepTeamChoice(chosen, teams);
  if (kept !== RANDOM_TEAM_VALUE) return kept;
  if (!Array.isArray(teams) || !teams.length) return "BUF";
  return teams[Math.min(teams.length - 1, Math.floor(random() * teams.length))].id;
}
