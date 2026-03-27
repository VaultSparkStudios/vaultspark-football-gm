/**
 * Franchise Newsletter — Season-End Shareable Card
 *
 * Generates a self-contained HTML card summarising the season.
 * Opened in a new tab — print-ready, screenshot-ready.
 *
 * Content:
 *   - Championship result + score
 *   - Controlled team final record + highlights
 *   - MVP / awards snapshot
 *   - Beat reporter top headlines (from newsLog)
 *   - GM Legacy score + persona tier
 *   - Next-season power-ranking teaser
 *
 * Exported: generateFranchiseNewsletter(state) → opens new window
 */

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return String(n);
}

export function generateFranchiseNewsletter(state) {
  const d = state.dashboard;
  if (!d) { alert("No league data loaded."); return; }

  const year       = d.currentYear ?? "—";
  const team       = d.controlledTeam || {};
  const teamId     = d.controlledTeamId || "—";
  const standings  = d.latestStandings || [];
  const myRow      = standings.find((r) => r.team === teamId) || {};
  const wins       = myRow.wins ?? "—";
  const losses     = myRow.losses ?? "—";
  const champ      = d.lastChampion || d.champions?.slice(-1)[0] || null;
  const champTeam  = champ?.championTeamId || champ || "—";
  const champScore = champ?.score || "";
  const isChamp    = champTeam === teamId;
  const awards     = d.lastAwards || {};
  const mvp        = awards.mvp?.name || awards.MVP?.name || "—";
  const newsLog    = d.newsLog || [];
  const gmLegacy   = d.gmLegacy || null;
  const teamColor  = team.primaryColor || "#1f6feb";
  const teamName   = team.name || teamId;
  const scheme     = team.schemeIdentity || {};

  // Top headlines (exclude press-conference subtype, keep punchy)
  const headlines = newsLog
    .filter((n) => n.type !== "press-conference")
    .slice(0, 5)
    .map((n) => n.headline || "");

  // Press conference highlight quote
  const pcQuote = newsLog.find((n) => n.type === "press-conference" && n.quote);

  // GM persona
  const persona = gmLegacy?.persona?.current;
  const personaName = persona?.name || "—";
  const gmScore = gmLegacy?.score ?? "—";
  const gmGrade = gmLegacy?.grade || "—";

  const capSpace = d.cap?.capSpace != null ? fmt(d.cap.capSpace) : "—";
  const ovr = team.overallRating ?? "—";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>VaultSpark Football GM — ${esc(year)} Franchise Newsletter</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #0d1117;
    color: #e6edf3;
    padding: 40px 20px 60px;
    min-height: 100vh;
  }
  .card {
    max-width: 680px;
    margin: 0 auto;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 16px;
    overflow: hidden;
  }
  .card-header {
    background: linear-gradient(135deg, ${esc(teamColor)}22 0%, #0d1117 100%);
    border-bottom: 3px solid ${esc(teamColor)};
    padding: 32px 32px 24px;
    position: relative;
  }
  .kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #7d8590; margin-bottom: 8px; }
  .team-name { font-size: 26px; font-weight: 800; color: #e6edf3; }
  .season-label { font-size: 14px; color: #7d8590; margin-top: 4px; }
  .champ-banner {
    background: ${esc(teamColor)}30;
    border: 1px solid ${esc(teamColor)}80;
    border-radius: 8px;
    padding: 10px 16px;
    margin-top: 16px;
    font-weight: 700;
    font-size: 15px;
    color: ${esc(teamColor)};
  }
  .record-strip {
    display: flex; gap: 0; border-bottom: 1px solid #30363d;
  }
  .record-cell {
    flex: 1; padding: 18px 24px; border-right: 1px solid #30363d;
    text-align: center;
  }
  .record-cell:last-child { border-right: none; }
  .rc-val { font-size: 22px; font-weight: 800; color: #e6edf3; }
  .rc-label { font-size: 11px; color: #7d8590; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; }
  .section { padding: 20px 32px; border-bottom: 1px solid #21262d; }
  .section:last-child { border-bottom: none; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #7d8590; margin-bottom: 12px; }
  .headline-list { list-style: none; }
  .headline-list li {
    padding: 7px 0; border-bottom: 1px solid #21262d;
    font-size: 13px; line-height: 1.4;
  }
  .headline-list li:last-child { border-bottom: none; }
  .headline-list li::before { content: "▸ "; color: ${esc(teamColor)}; }
  .gm-row { display: flex; align-items: center; gap: 16px; }
  .gm-score { font-size: 36px; font-weight: 900; color: #d29922; }
  .gm-grade {
    background: rgba(210,153,34,.15); border: 1px solid rgba(210,153,34,.4);
    color: #d29922; font-size: 13px; font-weight: 800;
    padding: 3px 10px; border-radius: 10px;
  }
  .gm-text { font-size: 12px; color: #7d8590; margin-top: 4px; }
  .quote-block {
    background: #0d1117; border-left: 3px solid ${esc(teamColor)};
    border-radius: 0 8px 8px 0;
    padding: 12px 16px; font-style: italic;
    font-size: 13px; line-height: 1.6; color: #c9d1d9;
  }
  .footer {
    padding: 16px 32px;
    font-size: 11px; color: #484f58; text-align: center;
  }
  @media print {
    body { background: white; color: #111; padding: 0; }
    .card { border: none; border-radius: 0; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <div class="kicker">VaultSpark Football GM · Season Review</div>
    <div class="team-name">${esc(teamName)}</div>
    <div class="season-label">${esc(year)} Season · ${esc(scheme.offense || "—")} / ${esc(scheme.defense || "—")}</div>
    ${isChamp
      ? `<div class="champ-banner">🏆 CHAMPIONS · ${esc(champScore)}</div>`
      : champTeam !== "—"
        ? `<div style="margin-top:14px;font-size:12px;color:#7d8590;">League Champions: ${esc(champTeam)} ${champScore ? `(${esc(champScore)})` : ""}</div>`
        : ""
    }
  </div>

  <div class="record-strip">
    <div class="record-cell"><div class="rc-val">${esc(String(wins))}–${esc(String(losses))}</div><div class="rc-label">Record</div></div>
    <div class="record-cell"><div class="rc-val">${esc(String(ovr))}</div><div class="rc-label">Team OVR</div></div>
    <div class="record-cell"><div class="rc-val">${esc(capSpace)}</div><div class="rc-label">Cap Space</div></div>
    <div class="record-cell"><div class="rc-val">${esc(mvp)}</div><div class="rc-label">League MVP</div></div>
  </div>

  ${headlines.length ? `
  <div class="section">
    <div class="section-title">Top Stories</div>
    <ul class="headline-list">
      ${headlines.map((h) => `<li>${esc(h)}</li>`).join("")}
    </ul>
  </div>` : ""}

  ${pcQuote ? `
  <div class="section">
    <div class="section-title">Post-Season Quote</div>
    <div class="quote-block">${esc(pcQuote.quote)}</div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">GM Legacy</div>
    <div class="gm-row">
      <div class="gm-score">${esc(String(gmScore))}</div>
      <div>
        <div><span class="gm-grade">${esc(gmGrade)}</span> &nbsp; <strong>${esc(personaName)}</strong></div>
        <div class="gm-text">${gmLegacy ? `${gmLegacy.wins ?? 0}W–${gmLegacy.losses ?? 0}L career · ${gmLegacy.playoffs ?? 0} playoff appearances · ${gmLegacy.superBowls ?? 0} titles` : "No legacy data yet."}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    Generated by VaultSpark Football GM · vaultsparkstudios.com<br>
    ${esc(teamName)} · ${esc(String(year))} Season
  </div>
</div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=760,height=900");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
