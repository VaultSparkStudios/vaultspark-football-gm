/**
 * League Story Export
 *
 * Generates a shareable single-file HTML summary card from season state.
 * No server required — downloads directly from the browser.
 */

function esc(str) {
  return String(str ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtSalary(n) {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

/**
 * Build the story object from session state.
 * @param {object} state — flat snapshot object from app.js (gameState / summary data)
 */
export function buildLeagueStory(state) {
  const {
    year,
    leagueName,
    teamName,
    champion,
    sbMvpName,
    sbMvpPosition,
    sbScore,
    awards = {},
    bestDraftPick,
    bestTrade,
    biggestBust,
    controlledTeamRecord,
    leagueLeaders = {}
  } = state;

  return {
    year,
    leagueName: leagueName || "VaultSpark League",
    teamName: teamName || "Your Franchise",
    champion: champion || "TBD",
    sbMvp: sbMvpName ? `${sbMvpName} (${sbMvpPosition})` : "—",
    sbScore: sbScore || "—",
    mvp: awards.mvp || "—",
    roy: awards.roy || "—",
    dpoy: awards.dpoy || "—",
    bestDraftPick: bestDraftPick || "—",
    bestTrade: bestTrade || "—",
    biggestBust: biggestBust || "—",
    controlledTeamRecord: controlledTeamRecord || "—",
    passingLeader: leagueLeaders.passing || "—",
    rushingLeader: leagueLeaders.rushing || "—",
    receivingLeader: leagueLeaders.receiving || "—",
    sacksLeader: leagueLeaders.sacks || "—"
  };
}

/**
 * Render the story as a standalone HTML string.
 */
export function renderStoryHTML(story) {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(story.leagueName)} — Season ${esc(story.year)} Story</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090c0e;color:#f5f1e7;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
  .card{background:#111518;border:1px solid #2a2f35;border-radius:12px;max-width:680px;width:100%;overflow:hidden}
  .hero{background:linear-gradient(135deg,#0d1f2d 0%,#1a2e42 100%);padding:2.5rem 2rem 2rem;text-align:center;border-bottom:1px solid #2a2f35}
  .league-name{font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:#8ab4c2;margin-bottom:.5rem}
  .season-title{font-size:2rem;font-weight:700;color:#e8d5a0;margin-bottom:.25rem}
  .champion-row{font-size:1.15rem;color:#f5f1e7;margin-top:.75rem}
  .champion-team{font-weight:700;color:#f0c040}
  .sb-score{font-size:.9rem;color:#8ab4c2;margin-top:.25rem}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
  .cell{padding:1.25rem 1.5rem;border-bottom:1px solid #1e2428}
  .cell:nth-child(odd){border-right:1px solid #1e2428}
  .cell-label{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#6b7a8a;margin-bottom:.35rem}
  .cell-value{font-size:.95rem;color:#f5f1e7;font-weight:600;line-height:1.3}
  .cell-value.highlight{color:#f0c040}
  .footer{padding:1rem 1.5rem;background:#0c0f12;text-align:center;font-size:.75rem;color:#4a5568}
  .footer a{color:#8ab4c2;text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <div class="hero">
    <div class="league-name">${esc(story.leagueName)}</div>
    <div class="season-title">Season ${esc(story.year)} Story</div>
    <div class="champion-row">Champion: <span class="champion-team">${esc(story.champion)}</span></div>
    <div class="sb-score">Super Bowl: ${esc(story.sbScore)} &nbsp;|&nbsp; MVP: ${esc(story.sbMvp)}</div>
  </div>
  <div class="grid">
    <div class="cell">
      <div class="cell-label">League MVP</div>
      <div class="cell-value highlight">${esc(story.mvp)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Rookie of the Year</div>
      <div class="cell-value">${esc(story.roy)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Defensive Player of the Year</div>
      <div class="cell-value">${esc(story.dpoy)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Your Franchise Record</div>
      <div class="cell-value">${esc(story.controlledTeamRecord)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Best Draft Pick</div>
      <div class="cell-value">${esc(story.bestDraftPick)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Best Trade</div>
      <div class="cell-value">${esc(story.bestTrade)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Passing Leader</div>
      <div class="cell-value">${esc(story.passingLeader)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Rushing Leader</div>
      <div class="cell-value">${esc(story.rushingLeader)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Receiving Leader</div>
      <div class="cell-value">${esc(story.receivingLeader)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">Sack Leader</div>
      <div class="cell-value">${esc(story.sacksLeader)}</div>
    </div>
  </div>
  <div class="footer">
    Generated ${now} &nbsp;&bull;&nbsp; <a href="https://vaultsparkstudios.com/vaultspark-football-gm/" target="_blank">VaultSpark Football GM</a>
  </div>
</div>
</body>
</html>`;
}

/**
 * Trigger a browser download of the story HTML.
 */
export function downloadLeagueStory(story) {
  const html = renderStoryHTML(story);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vsfgm-season-${story.year}-story.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
