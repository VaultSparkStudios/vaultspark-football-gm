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

function latest(list = []) {
  return Array.isArray(list) && list.length ? list[list.length - 1] : null;
}

function nameFromAward(award) {
  if (!award) return "—";
  if (typeof award === "string") return award;
  return award.name || award.player || award.playerName || "—";
}

function standingsRecord(dashboard) {
  const teamId = dashboard?.controlledTeamId;
  const row = (dashboard?.latestStandings || []).find((entry) => entry.team === teamId || entry.teamId === teamId);
  if (!row) return "—";
  return `${row.wins ?? 0}-${row.losses ?? 0}${row.ties ? `-${row.ties}` : ""}`;
}

function leaderName(rows = [], category) {
  const leader = Array.isArray(rows) ? rows[0] : null;
  if (!leader) return "—";
  const name = leader.player || leader.name || leader.playerName || "—";
  const team = leader.team || leader.teamId ? `, ${leader.team || leader.teamId}` : "";
  const stat =
    category === "passing" ? leader.yds ?? leader.yards :
    category === "rushing" ? leader.yds ?? leader.yards :
    category === "receiving" ? leader.yds ?? leader.yards :
    category === "sacks" ? leader.sacks :
    null;
  return stat == null ? `${name}${team}` : `${name}${team} (${stat})`;
}

export function buildLeagueStoryFromDashboard(dashboard = {}) {
  const team = dashboard.controlledTeam || {};
  const champion = latest(dashboard.champions || []);
  const lastAwards = dashboard.lastAwards || latest(dashboard.awards || []) || {};
  const leaders = dashboard.leagueLeaders || dashboard.statLeaders || {};
  const capsule = dashboard.timeCapsule?.graded || dashboard.timeCapsuleGrade || null;
  const gmLegacy = dashboard.gmLegacy || {};
  const cap = dashboard.cap || {};

  return buildLeagueStory({
    year: dashboard.currentYear,
    leagueName: "Franchise Architect League",
    teamName: team.name || dashboard.controlledTeamName || dashboard.controlledTeamId,
    champion: champion?.championTeamName || champion?.championTeamId || champion,
    sbMvpName: champion?.mvp?.name || champion?.superBowlMvp?.name,
    sbMvpPosition: champion?.mvp?.position || champion?.superBowlMvp?.position || champion?.mvp?.pos,
    sbScore: champion?.score,
    awards: {
      mvp: nameFromAward(lastAwards.mvp || lastAwards.MVP),
      roy: nameFromAward(lastAwards.roy || lastAwards.OROY || lastAwards.DROY),
      dpoy: nameFromAward(lastAwards.dpoy || lastAwards.DPOY)
    },
    bestDraftPick: dashboard.draftPickAssets?.[0]?.label || dashboard.draftPickAssets?.[0]?.summary,
    bestTrade: (dashboard.newsLog || []).find((entry) => /trade/i.test(entry.headline || entry.message || ""))?.headline,
    controlledTeamRecord: standingsRecord(dashboard),
    leagueLeaders: {
      passing: leaderName(leaders.passing, "passing"),
      rushing: leaderName(leaders.rushing, "rushing"),
      receiving: leaderName(leaders.receiving, "receiving"),
      sacks: leaderName(leaders.sacks || leaders.defense, "sacks")
    },
    capSpace: cap.capSpace,
    gmLegacy: gmLegacy.score != null ? `${gmLegacy.score} (${gmLegacy.grade || "grade pending"})` : "—",
    timeCapsule: capsule
      ? `${capsule.hits || 0}-${capsule.misses || 0}${capsule.pushes ? `, ${capsule.pushes} push` : ""}: ${capsule.reporterVerdict || "receipts filed"}`
      : "No receipt ledger yet"
  });
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
    leagueLeaders = {},
    capSpace,
    gmLegacy,
    timeCapsule
  } = state;

  return {
    year,
    leagueName: leagueName || "VaultSpark League",
    teamName: teamName || "Your Franchise",
    champion: champion || "TBD",
    sbMvp: sbMvpName ? `${sbMvpName} (${sbMvpPosition || "—"})` : "—",
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
    sacksLeader: leagueLeaders.sacks || "—",
    capSpace: fmtSalary(capSpace),
    gmLegacy: gmLegacy || "—",
    timeCapsule: timeCapsule || "—"
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
  .card{background:#111518;border:1px solid #2a2f35;border-radius:12px;max-width:760px;width:100%;overflow:hidden}
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
  @media (max-width:640px){body{padding:1rem}.grid{grid-template-columns:1fr}.cell:nth-child(odd){border-right:0}.hero{padding:2rem 1.25rem 1.5rem}}
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
      <div class="cell-label">Cap Space</div>
      <div class="cell-value">${esc(story.capSpace)}</div>
    </div>
    <div class="cell">
      <div class="cell-label">GM Legacy</div>
      <div class="cell-value">${esc(story.gmLegacy)}</div>
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
    <div class="cell">
      <div class="cell-label">Time Capsule Receipts</div>
      <div class="cell-value">${esc(story.timeCapsule)}</div>
    </div>
  </div>
  <div class="footer">
    Generated ${now} &nbsp;&bull;&nbsp; <a href="https://playfranchisearchitect.com/" target="_blank">Franchise Architect: Football</a>
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
