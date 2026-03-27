/**
 * Narrative Event Engine — League Story Layer
 *
 * Fires low-frequency, sim-derived story moments using world-state signals.
 * Events are NOT random flavour text — each requires a real state condition to trigger.
 *
 * Event types:
 *   TRADE_REQUEST        — star player's morale + contract context → requests trade
 *   BREAKOUT_FLAG        — statistically anomalous young player performance
 *   RIVAL_OFFER          — CPU team makes public overture to a pending free agent
 *   CULTURE_CRISIS       — team chemistry collapse triggers locker-room event
 *   OWNER_ULTIMATUM      — owner patience hits critical floor
 *   STREAK_CEREMONY      — milestone win/loss streak crossing a threshold
 *   LEGEND_FAREWELL      — high-AV veteran in final contract year signals retirement intent
 *
 * Events attach to league.narrativeLog (rolling 30-item window, newest first).
 * Each event includes: type, year, week, teamIds[], playerIds[], headline, detail, impact.
 */

const MAX_LOG = 30;

function pushEvent(league, event) {
  if (!Array.isArray(league.narrativeLog)) league.narrativeLog = [];
  league.narrativeLog.unshift({
    id: `narr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...event
  });
  if (league.narrativeLog.length > MAX_LOG) league.narrativeLog.length = MAX_LOG;
}

// ── TRADE_REQUEST ─────────────────────────────────────────────────────────────
// Condition: OVR ≥ 82 + contract year + morale < 45 + team losing record

export function checkTradeRequests(league, year, week, rng) {
  for (const player of league.players) {
    if ((player.overall || 70) < 82) continue;
    if ((player.contract?.yearsRemaining || 2) > 1) continue;
    if ((player.morale || 60) >= 45) continue;

    const team = league.teams.find((t) => t.id === player.teamId);
    if (!team) continue;
    const winPct = (team.season?.wins || 0) /
      Math.max(1, (team.season?.wins || 0) + (team.season?.losses || 1));
    if (winPct > 0.45) continue;
    if (rng.next() > 0.18) continue; // ~18% chance per eligible player per week

    // Don't fire the same event twice for this player this season
    const already = (league.narrativeLog || []).some(
      (e) => e.type === "TRADE_REQUEST" && e.playerIds?.includes(player.id) && e.year === year
    );
    if (already) continue;

    pushEvent(league, {
      type: "TRADE_REQUEST",
      year, week,
      headline: `${player.name} requests a trade out of ${player.teamId}`,
      detail: `${player.name} (${player.position}, ${player.overall} OVR) has requested a trade. Morale is low (${player.morale || "—"}) and the team's record isn't helping his case.`,
      impact: "Trade value is elevated while demand is active. Holding may damage locker-room chemistry.",
      teamIds: [player.teamId],
      playerIds: [player.id]
    });
  }
}

// ── BREAKOUT_FLAG ─────────────────────────────────────────────────────────────
// Condition: age ≤ 24, experience ≤ 2, season AV ≥ 8 by Week 10

export function checkBreakoutFlags(league, year, week, rng) {
  if (week < 10) return;
  for (const player of league.players) {
    if ((player.age || 25) > 24) continue;
    if ((player.experience || 3) > 2) continue;
    const ss = player.seasonStats?.[year];
    if (!ss || (ss.av || 0) < 8) continue;

    const already = (league.narrativeLog || []).some(
      (e) => e.type === "BREAKOUT_FLAG" && e.playerIds?.includes(player.id) && e.year === year
    );
    if (already) continue;
    if (rng.next() > 0.7) continue; // fire once per eligible player

    pushEvent(league, {
      type: "BREAKOUT_FLAG",
      year, week,
      headline: `${player.name} is having a breakout season — scouts are taking notice`,
      detail: `${player.name} (${player.position}, age ${player.age}) has posted ${ss.av} AV through Week ${week} — well above the baseline for players his age and experience level.`,
      impact: "Trade value and contract demands will rise. Lock him up now or risk a bidding war.",
      teamIds: [player.teamId],
      playerIds: [player.id]
    });
  }
}

// ── RIVAL_OFFER ───────────────────────────────────────────────────────────────
// Condition: player in contract year, OVR ≥ 80, and another team has cap space

export function checkRivalOffers(league, year, week, rng) {
  if (week < 14) return; // Late season only
  for (const player of league.players) {
    if ((player.overall || 70) < 80) continue;
    if ((player.contract?.yearsRemaining || 2) > 1) continue;

    const already = (league.narrativeLog || []).some(
      (e) => e.type === "RIVAL_OFFER" && e.playerIds?.includes(player.id) && e.year === year
    );
    if (already) continue;
    if (rng.next() > 0.12) continue;

    // Find a plausible rival team (different conference, cap space > 20M)
    const currentTeam = league.teams.find((t) => t.id === player.teamId);
    const rivals = league.teams.filter((t) =>
      t.id !== player.teamId &&
      t.conference !== currentTeam?.conference &&
      (t.capRemaining || 0) > 20_000_000
    );
    if (!rivals.length) continue;
    const rival = rng.pick(rivals);

    pushEvent(league, {
      type: "RIVAL_OFFER",
      year, week,
      headline: `${rival.id} is pursuing ${player.name} ahead of free agency`,
      detail: `Reports indicate ${rival.id} has made preliminary contact with ${player.name}'s camp. The ${rival.id} have significant cap space and a clear need at ${player.position}.`,
      impact: "Competing interest will raise contract demands. Act before free agency opens.",
      teamIds: [player.teamId, rival.id],
      playerIds: [player.id]
    });
  }
}

// ── CULTURE_CRISIS ────────────────────────────────────────────────────────────
// Condition: team chemistry < 38 AND losing ≥ 5 straight

export function checkCultureCrises(league, year, week, rng) {
  for (const team of league.teams) {
    const chemistry = team.worldState?.culture?.chemistry || team.culture?.chemistry || 60;
    const streak = team.season?.streak || 0; // negative = losing streak
    if (chemistry >= 38) continue;
    if (streak > -5) continue;

    const already = (league.narrativeLog || []).some(
      (e) => e.type === "CULTURE_CRISIS" && e.teamIds?.includes(team.id) && e.year === year
    );
    if (already) continue;
    if (rng.next() > 0.45) continue;

    pushEvent(league, {
      type: "CULTURE_CRISIS",
      year, week,
      headline: `Locker-room tension boils over in ${team.id}`,
      detail: `Sources inside the ${team.id} facility describe fractured relationships between veterans and the coaching staff. Team chemistry is at a critical low (${chemistry}) amid a losing streak.`,
      impact: "Performance drag will continue until culture metrics recover. Staff changes or veteran departures may be necessary.",
      teamIds: [team.id],
      playerIds: []
    });
  }
}

// ── OWNER_ULTIMATUM ───────────────────────────────────────────────────────────
// Condition: owner hot-seat >= 80 AND wins < target - 4

export function checkOwnerUltimatums(league, year, week, rng) {
  if (week < 12) return;
  for (const team of league.teams) {
    const hotSeat = team.worldState?.owner?.hotSeat || team.owner?.hotSeat || 0;
    if (hotSeat < 80) continue;

    const targetWins = team.worldState?.owner?.mandate?.targetWins || team.owner?.mandate?.targetWins || 9;
    const currentWins = team.season?.wins || 0;
    if (currentWins >= targetWins - 4) continue;

    const already = (league.narrativeLog || []).some(
      (e) => e.type === "OWNER_ULTIMATUM" && e.teamIds?.includes(team.id) && e.year === year
    );
    if (already) continue;
    if (rng.next() > 0.55) continue;

    pushEvent(league, {
      type: "OWNER_ULTIMATUM",
      year, week,
      headline: `${team.id} ownership delivers ultimatum to front office`,
      detail: `Owner pressure has reached a critical level. The front office has been put on notice — results need to improve or significant changes are coming at season's end.`,
      impact: "Hot-seat modifier is at maximum. Trades and signings may require owner approval. Missing the target could trigger staff overhaul.",
      teamIds: [team.id],
      playerIds: []
    });
  }
}

// ── LEGEND_FAREWELL ───────────────────────────────────────────────────────────
// Condition: age >= maxAge-2, career AV >= 40, final contract year

export function checkLegendFarewells(league, year, week, rng) {
  if (week !== 1) return; // Fire at season start only
  for (const player of league.players) {
    if ((player.age || 25) < 34) continue;
    if ((player.contract?.yearsRemaining || 2) > 1) continue;
    const careerAV = Object.values(player.seasonStats || {}).reduce((s, ss) => s + (ss?.av || 0), 0);
    if (careerAV < 40) continue;

    const already = (league.narrativeLog || []).some(
      (e) => e.type === "LEGEND_FAREWELL" && e.playerIds?.includes(player.id) && e.year === year
    );
    if (already) continue;
    if (rng.next() > 0.6) continue;

    pushEvent(league, {
      type: "LEGEND_FAREWELL",
      year, week,
      headline: `${player.name} hints this could be his final season`,
      detail: `${player.name} (${player.position}, age ${player.age}, career AV: ${careerAV}) has signalled that retirement is likely after this season. He enters the year on an expiring deal.`,
      impact: "Consider a farewell extension, a ceremonial start, or begin succession planning at the position.",
      teamIds: [player.teamId],
      playerIds: [player.id]
    });
  }
}

// ── Master driver — call each check ──────────────────────────────────────────

export function runNarrativeChecks(league, year, week, rng) {
  checkTradeRequests(league, year, week, rng);
  checkBreakoutFlags(league, year, week, rng);
  checkRivalOffers(league, year, week, rng);
  checkCultureCrises(league, year, week, rng);
  checkOwnerUltimatums(league, year, week, rng);
  checkLegendFarewells(league, year, week, rng);
}
