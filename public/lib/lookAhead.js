// S113 — "Looking ahead": next week's opponent through the League Pulse lens.
// Context only: a ranking and a record, never a win probability.
export function buildLookAhead(dashboard = {}) {
  const teamId = dashboard.controlledTeamId;
  const games = dashboard.currentWeekSchedule?.games || [];
  const game = games.find((entry) => entry.homeTeamId === teamId || entry.awayTeamId === teamId);
  if (!teamId || !game) return null;
  const home = game.homeTeamId === teamId;
  const opponentId = home ? game.awayTeamId : game.homeTeamId;
  const rankings = dashboard.leagueLens?.powerRankings || [];
  const opponent = rankings.find((row) => row.teamId === opponentId) || null;
  const own = rankings.find((row) => row.teamId === teamId) || null;
  if (!opponent) return null;
  const gap = own ? own.rank - opponent.rank : 0;
  const framing = !own ? "" : gap >= 8 ? "A statement game: they rank well above you." : gap <= -8 ? "A game you are expected to win, which makes it a trap." : "An even matchup on paper.";
  return {
    opponentId,
    opponentName: opponent.teamName,
    venue: home ? "vs" : "at",
    opponentRank: opponent.rank,
    opponentRecord: opponent.record,
    opponentBlurb: opponent.blurb,
    ownRank: own?.rank ?? null,
    framing
  };
}

export function renderLookAhead(dashboard) {
  const read = buildLookAhead(dashboard);
  if (!read) return "";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `
    <div class="advisor-look-ahead">
      <span class="franchise-horizon-label">Looking ahead</span>
      <strong>${escape(read.venue)} ${escape(read.opponentName)} · #${escape(read.opponentRank)} in the power rankings (${escape(read.opponentRecord)})</strong>
      <small>${escape(read.opponentBlurb)}${read.ownRank ? ` · You sit #${escape(read.ownRank)}.` : ""} ${escape(read.framing)}</small>
    </div>`;
}