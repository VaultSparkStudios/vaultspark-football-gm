// S113 — League Pulse: power rankings, award races and the record watch.
// Pure rendering of `dashboard.leagueLens`; the numbers are computed once in the
// runtime (src/stats/leagueLens.js) so every transport shows the same list.
import { escapeHtml, teamCode, teamName } from "./appCore.js";

function moveBadge(move, previousRank) {
  if (previousRank == null || !move) return '<span class="lens-move flat" aria-label="No change">–</span>';
  const up = move > 0;
  return `<span class="lens-move ${up ? "up" : "down"}" aria-label="${up ? "Up" : "Down"} ${Math.abs(move)}">${up ? "▲" : "▼"}${Math.abs(move)}</span>`;
}

function raceList(title, rows, describe) {
  if (!rows?.length) return `<div class="lens-race"><h4>${escapeHtml(title)}</h4><p class="small muted">The race forms after a few games.</p></div>`;
  return `
    <div class="lens-race">
      <h4>${escapeHtml(title)}</h4>
      <ol>
        ${rows.map((row) => `
          <li>
            <div class="lens-race-head"><strong>${escapeHtml(describe(row))}</strong><span class="small">${escapeHtml(String(row.shareOfLeader))}%</span></div>
            <div class="lens-bar" aria-hidden="true"><span style="width:${Math.max(4, Math.min(100, Number(row.shareOfLeader) || 0))}%"></span></div>
            <small>${escapeHtml(row.line || "")}</small>
          </li>`).join("")}
      </ol>
    </div>`;
}

export function renderLeagueLensPanel(dashboard, root = document.getElementById("leagueLensPanel")) {
  if (!root) return;
  const lens = dashboard?.leagueLens;
  if (!lens?.powerRankings?.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const controlled = dashboard.controlledTeamId || dashboard.controlledTeam?.id;
  const top = lens.powerRankings.slice(0, 10);
  const mine = lens.powerRankings.find((row) => row.teamId === controlled);
  const showMine = mine && mine.rank > top.length;
  const races = lens.awardRaces || {};
  const alerts = lens.recordWatch || [];
  root.innerHTML = `
    <div class="franchise-command-head">
      <div><span class="brand-kicker">League Pulse · Week ${escapeHtml(String(lens.week ?? "—"))}</span><h2 id="leagueLensTitle">Power Rankings &amp; Award Races</h2></div>
      <span class="small">Built from results and roster strength, never from hidden ratings</span>
    </div>
    ${alerts.length ? `
      <div class="lens-alerts" role="status">
        ${alerts.map((alert) => `
          <div class="lens-alert ${escapeHtml(alert.status)}">
            <strong>${alert.status === "broken" ? "Record broken" : "Record watch"}</strong>
            <span>${escapeHtml(alert.player)} (${escapeHtml(teamCode(alert.teamId))}) ${alert.status === "broken"
              ? `has ${escapeHtml(String(alert.value))}, past the ${escapeHtml(alert.label)} mark of ${escapeHtml(String(alert.record))}`
              : `is on pace for ${escapeHtml(String(alert.pace))}; the ${escapeHtml(alert.label)} record is ${escapeHtml(String(alert.record))}`} set by ${escapeHtml(alert.holder || "—")} in ${escapeHtml(String(alert.recordYear))}.</span>
          </div>`).join("")}
      </div>` : ""}
    <div class="lens-grid">
      <div class="lens-rankings">
        <h3>Power Rankings</h3>
        <ol class="lens-ranking-list">
          ${top.map((row) => `
            <li class="${row.teamId === controlled ? "is-controlled" : ""}">
              <span class="lens-rank">${escapeHtml(String(row.rank))}</span>
              ${moveBadge(row.move, row.previousRank)}
              <span class="lens-team"><strong>${escapeHtml(row.teamName || teamName(row.teamId))}</strong><small>${escapeHtml(row.record)} · ${escapeHtml(row.blurb)}</small></span>
            </li>`).join("")}
          ${showMine ? `
            <li class="is-controlled lens-gap">
              <span class="lens-rank">${escapeHtml(String(mine.rank))}</span>
              ${moveBadge(mine.move, mine.previousRank)}
              <span class="lens-team"><strong>${escapeHtml(mine.teamName)}</strong><small>${escapeHtml(mine.record)} · ${escapeHtml(mine.blurb)}</small></span>
            </li>` : ""}
        </ol>
      </div>
      <div class="lens-races">
        ${raceList("MVP Race", races.mvp, (row) => `${row.player} · ${row.pos} · ${teamCode(row.teamId)}`)}
        ${raceList("Defensive Player of the Year", races.dpoy, (row) => `${row.player} · ${row.pos} · ${teamCode(row.teamId)}`)}
        ${raceList("Coach of the Year", races.coachOfTheYear, (row) => row.coach ? `${row.coach} · ${row.teamName}` : row.teamName)}
      </div>
    </div>
    <p class="small muted">Race bars show each candidate's standing against the current leader, not a probability.</p>`;
}
