/**
 * Rival GM inbound trade offers (S62).
 *
 * Before this module, trades were 100% player-initiated: rival GM archetypes
 * were a read-only scouting table and the multi-asset TradeService had no
 * offer-generation entry point. Now rival front offices act on the player:
 * each regular-season week (spiking through the deadline window) a rival with
 * a genuine roster need may construct an offer for one of the controlled
 * team's surplus veterans.
 *
 * Honesty contract:
 * - Packages are built by probing the real TradeService.evaluate authority —
 *   the CPU can only propose what the shared valuation/cap/challenge pipeline
 *   already endorses. No parallel valuation math exists here.
 * - Offers are deterministic per seed (session RNG), bounded (max 2 pending,
 *   log capped), expire honestly, and carry a rationale naming the rival's
 *   archetype and need — no hidden bonuses, no outcome prediction.
 */

const OFFER_LOG_LIMIT = 20;
const MAX_PENDING = 2;
const DEADLINE_START = 9;
const DEADLINE_END = 11;

function offerList(league) {
  if (!Array.isArray(league.inboundTradeOffers)) league.inboundTradeOffers = [];
  return league.inboundTradeOffers;
}

export function isDeadlineWindow(week) {
  return week >= DEADLINE_START && week <= DEADLINE_END;
}

export function expireInboundTradeOffers(session) {
  const league = session.league;
  const expired = [];
  for (const offer of offerList(league)) {
    if (offer.status === "pending" && session.currentWeek > offer.expiresWeek) {
      offer.status = "expired";
      offer.resolvedWeek = session.currentWeek;
      offer.resolution = "The offer window closed without a response.";
      expired.push(offer);
    }
  }
  return expired;
}

function controlledSurplusTargets(session) {
  const teamId = session.controlledTeamId;
  return session.league.players
    .filter(
      (player) =>
        player.teamId === teamId &&
        player.status === "active" &&
        (player.rosterSlot || "active") === "active" &&
        (player.overall || 0) >= 76 &&
        (player.age || 27) >= 24 &&
        (player.age || 27) <= 32
    )
    .sort((a, b) => (b.overall || 0) - (a.overall || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 12);
}

function rivalCandidates(session, target) {
  // AI maintenance keeps every roster at template COUNTS, so numeric shortfall
  // is a dead signal. Real trade appetite is a QUALITY gap: the rival's best
  // player at the position is clearly worse than the offered veteran.
  const controlled = session.controlledTeamId;
  return session.league.teams
    .filter((team) => team.id !== controlled)
    .map((team) => {
      const bestAtPosition = session.league.players
        .filter(
          (player) =>
            player.teamId === team.id &&
            player.status === "active" &&
            (player.rosterSlot || "active") === "active" &&
            player.position === target.position
        )
        .reduce((best, player) => Math.max(best, player.overall || 0), 0);
      const upgradeGap = (target.overall || 0) - bestAtPosition;
      if (upgradeGap < 4) return null;
      const urgency = team.strategyProfile === "contender" ? 1.5 : team.strategyProfile === "rebuild" ? 0.7 : 1;
      return { team, needSeverity: Math.round(upgradeGap * urgency) };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.needSeverity - a.needSeverity ||
        (b.team.overallRating || 0) - (a.team.overallRating || 0) ||
        String(a.team.id).localeCompare(String(b.team.id))
    )
    .slice(0, 3);
}

function rivalPickAssets(session, teamId) {
  return (session.getDraftPickAssets(teamId) || [])
    .filter((pick) => pick.ownerTeamId === teamId || !pick.ownerTeamId)
    .sort((a, b) => (a.year || 0) - (b.year || 0) || (a.round || 9) - (b.round || 9));
}

function rivalOfferablePlayers(session, rival, target) {
  // Young or pick-adjacent talent the rival would move for a proven veteran.
  return session.league.players
    .filter(
      (player) =>
        player.teamId === rival.id &&
        player.status === "active" &&
        (player.rosterSlot || "active") === "active" &&
        player.id !== target.id &&
        (player.overall || 0) >= 68 &&
        (player.overall || 0) <= (target.overall || 76) - 2
    )
    .sort((a, b) => (b.potential || 0) - (a.potential || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 4);
}

function archetypeRationale(rival, target, needSeverity) {
  const profile = rival.strategyProfile || "balanced";
  if (profile === "contender") {
    return `${rival.id} are in win-now mode and see ${target.name} as the missing ${target.position}.`;
  }
  if (profile === "rebuild") {
    return `${rival.id} are rebuilding but ${target.position} is their most exposed room (need severity ${needSeverity}).`;
  }
  return `${rival.id} rate ${target.name} as a clear upgrade at ${target.position}.`;
}

function packageAttempts({ picks, players }) {
  // Escalating, deterministic ladder of realistic packages: picks first,
  // then player+pick sweeteners. The evaluate authority culls fantasy.
  const attempts = [];
  const secondRounder = picks.find((pick) => pick.round === 2);
  const firstRounder = picks.find((pick) => pick.round === 1);
  const thirdRounder = picks.find((pick) => pick.round === 3);
  if (secondRounder) attempts.push({ playerIds: [], pickIds: [secondRounder.id] });
  if (players[0]) attempts.push({ playerIds: [players[0].id], pickIds: [] });
  if (players[0] && thirdRounder) attempts.push({ playerIds: [players[0].id], pickIds: [thirdRounder.id] });
  if (firstRounder) attempts.push({ playerIds: [], pickIds: [firstRounder.id] });
  if (players[0] && secondRounder) attempts.push({ playerIds: [players[0].id], pickIds: [secondRounder.id] });
  if (players[1] && firstRounder) attempts.push({ playerIds: [players[1].id], pickIds: [firstRounder.id] });
  return attempts;
}

/**
 * Weekly generation hook. Deterministic via the session RNG stream.
 * Returns the created offer or null (an honest no-offer week).
 */
export function generateInboundTradeOffers(session) {
  const league = session.league;
  const rng = session.rng;
  const week = session.currentWeek;
  expireInboundTradeOffers(session);
  if (session.phase !== "regular-season") return null;
  const offers = offerList(league);
  if (offers.filter((offer) => offer.status === "pending").length >= MAX_PENDING) return null;

  const deadline = isDeadlineWindow(week);
  const chance = deadline ? 0.6 : 0.22;
  if (!rng.chance(chance)) return null;

  const targets = controlledSurplusTargets(session);
  if (!targets.length) return null;
  const target = targets[rng.int(0, Math.min(targets.length, 6) - 1)];
  if (!target) return null;
  // One live offer per player at a time.
  if (offers.some((offer) => offer.status === "pending" && offer.requestedPlayerIds.includes(target.id))) return null;

  const rivals = rivalCandidates(session, target);
  if (!rivals.length) return null;
  const { team: rival, needSeverity } = rivals[rng.int(0, rivals.length - 1)];

  const picks = rivalPickAssets(session, rival.id);
  const players = rivalOfferablePlayers(session, rival, target);
  const trade = session.services?.trades;
  if (!trade) return null;

  for (const attempt of packageAttempts({ picks, players })) {
    const input = {
      teamA: rival.id,
      teamB: session.controlledTeamId,
      teamAPlayerIds: attempt.playerIds,
      teamBPlayerIds: [target.id],
      teamAPickIds: attempt.pickIds,
      teamBPickIds: []
    };
    const evaluation = trade.evaluate(input);
    if (!evaluation.ok) continue;

    const offer = {
      id: `TRO-${session.currentYear}-W${week}-${rival.id}-${target.id}`,
      year: session.currentYear,
      week,
      fromTeamId: rival.id,
      toTeamId: session.controlledTeamId,
      requestedPlayerIds: [target.id],
      requestedPlayers: [{ playerId: target.id, name: target.name, pos: target.position, ovr: target.overall }],
      offeredPlayerIds: attempt.playerIds,
      offeredPlayers: attempt.playerIds.map((id) => {
        const player = players.find((row) => row.id === id);
        return { playerId: id, name: player?.name || id, pos: player?.position || "?", ovr: player?.overall || 0 };
      }),
      offeredPickIds: attempt.pickIds,
      offeredPicks: attempt.pickIds.map((id) => {
        const pick = picks.find((row) => row.id === id);
        return { id, year: pick?.year, round: pick?.round };
      }),
      rationale: archetypeRationale(rival, target, needSeverity),
      archetype: rival.strategyProfile || "balanced",
      deadlineWindow: deadline,
      expiresWeek: Math.min(18, week + (deadline ? 1 : 2)),
      status: "pending",
      createdAt: `${session.currentYear}-W${week}`,
      valuation: evaluation.valuation?.[session.controlledTeamId] || null
    };
    offers.unshift(offer);
    if (offers.length > OFFER_LOG_LIMIT) offers.length = OFFER_LOG_LIMIT;
    return offer;
  }
  return null;
}

/**
 * Player response authority: accept | decline | counter.
 * Accept re-evaluates through TradeService NOW and commits with the fresh
 * fingerprint — a changed league fails closed with a 409-style receipt.
 */
export function respondToInboundTradeOffer(session, { offerId, action } = {}) {
  const offers = offerList(session.league);
  const offer = offers.find((row) => row.id === offerId);
  if (!offer) return { ok: false, status: 404, error: "Trade offer not found." };
  if (offer.status !== "pending") {
    return { ok: false, status: 409, reasonCode: "offer-not-pending", error: `This offer is already ${offer.status}.`, offer };
  }
  if (!["accept", "decline", "counter"].includes(action)) {
    return { ok: false, status: 400, error: "Action must be accept, decline, or counter." };
  }
  if (action === "decline") {
    offer.status = "declined";
    offer.resolvedWeek = session.currentWeek;
    offer.resolution = "Front office declined the offer.";
    return { ok: true, offer };
  }
  if (action === "counter") {
    offer.status = "countered";
    offer.resolvedWeek = session.currentWeek;
    offer.resolution = "Front office opened counter negotiations at the trade desk.";
    // The counter flows through the existing trade workspace: the same
    // TradeService valuation that produced this offer judges the counter.
    return {
      ok: true,
      offer,
      counterPrefill: {
        teamA: offer.toTeamId,
        teamB: offer.fromTeamId,
        teamAPlayerIds: offer.requestedPlayerIds,
        teamBPlayerIds: offer.offeredPlayerIds,
        teamBPickIds: offer.offeredPickIds
      }
    };
  }
  const trade = session.services?.trades;
  if (!trade) return { ok: false, status: 500, error: "Trade authority unavailable." };
  const input = {
    teamA: offer.fromTeamId,
    teamB: offer.toTeamId,
    teamAPlayerIds: offer.offeredPlayerIds,
    teamBPlayerIds: offer.requestedPlayerIds,
    teamAPickIds: offer.offeredPickIds,
    teamBPickIds: []
  };
  const evaluation = trade.evaluate(input);
  if (!evaluation.ok) {
    offer.status = "expired";
    offer.resolvedWeek = session.currentWeek;
    offer.resolution = `The league changed since the offer was made (${evaluation.reasonCode || "re-evaluation failed"}).`;
    return { ok: false, status: 409, reasonCode: "offer-stale", error: offer.resolution, offer };
  }
  const commit = trade.commit({ ...input, expectedPlanFingerprint: evaluation.plan?.fingerprint });
  if (!commit.ok) {
    offer.status = "expired";
    offer.resolvedWeek = session.currentWeek;
    offer.resolution = commit.error || "Commit failed after evaluation.";
    return { ok: false, status: commit.status || 409, reasonCode: commit.reasonCode || "offer-commit-failed", error: offer.resolution, offer };
  }
  offer.status = "accepted";
  offer.resolvedWeek = session.currentWeek;
  offer.resolution = "Trade completed.";
  return { ok: true, offer, trade: commit };
}

export function getInboundTradeOffers(session) {
  expireInboundTradeOffers(session);
  return {
    week: session.currentWeek,
    deadlineWindow: isDeadlineWindow(session.currentWeek),
    offers: offerList(session.league).slice(0, OFFER_LOG_LIMIT)
  };
}
