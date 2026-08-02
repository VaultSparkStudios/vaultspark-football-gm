/**
 * Characterized trade transaction authority.
 *
 * Evaluation is read-only. Commit mutates live assets only after the complete
 * refusal pipeline succeeds, then refreshes every derived index exactly once.
 */
import { buildTradePlan } from "./tradePlan.js";

export class TradeService {
  constructor(session, strategies = {}) {
    this.session = session;
    this.strategies = strategies;
  }

  _createPlan(input = {}) {
    return buildTradePlan(this.session, input);
  }

  evaluate(input = {}) {
    const {
      teamA,
      teamB,
      teamAPlayerIds = [],
      teamBPlayerIds = [],
      teamAPickIds = [],
      teamBPickIds = []
    } = input;
    const session = this.session;
    const {
      clamp,
      isTradeValueAcceptable,
      pickTradeValueForTeam,
      playerTradeValueForTeam,
      teamPlayersAll,
      teamTransactionAiProfile
    } = this.strategies;
    if (!session.getTeamById(teamA) || !session.getTeamById(teamB)) {
      return { ok: false, error: "Invalid team IDs.", reasonCode: "invalid-team" };
    }
    if (teamA === teamB) return { ok: false, error: "Teams must be different.", reasonCode: "same-team" };

    const fromA = teamAPlayerIds
      .map((id) => session.getPlayerById(id))
      .filter((player) => player?.teamId === teamA)
      .filter(Boolean);
    const fromB = teamBPlayerIds
      .map((id) => session.getPlayerById(id))
      .filter((player) => player?.teamId === teamB)
      .filter(Boolean);
    // A pick is only an asset while its draft is still ahead of us and it has
    // not been used. Before S67 nothing consumed picks and nothing floored the
    // year, so an already-spent 2027 first was still tradeable in 2029.
    const tradeable = (pick, owner) =>
      Boolean(pick) && pick.ownerTeamId === owner && pick.consumed !== true && pick.year > session.currentYear;
    const picksA = teamAPickIds.map((id) => session.getDraftPickById(id)).filter((pick) => tradeable(pick, teamA));
    const picksB = teamBPickIds.map((id) => session.getDraftPickById(id)).filter((pick) => tradeable(pick, teamB));

    if (
      fromA.length !== teamAPlayerIds.length ||
      fromB.length !== teamBPlayerIds.length ||
      picksA.length !== teamAPickIds.length ||
      picksB.length !== teamBPickIds.length
    ) {
      return { ok: false, error: "Invalid asset in trade package.", reasonCode: "invalid-asset" };
    }

    const challengeA = session.getChallengeRestrictions(teamA);
    const challengeB = session.getChallengeRestrictions(teamB);
    const incomingTop10ToA = picksB.filter((pick) => (pick.originalPickIndex || 99) <= 10);
    const incomingTop10ToB = picksA.filter((pick) => (pick.originalPickIndex || 99) <= 10);
    if (!challengeA.allowTop10PickTrading && incomingTop10ToA.length) {
      return {
        ok: false,
        error: "This challenge mode blocks acquiring top-10 draft picks.",
        reasonCode: "challenge-top10-picks"
      };
    }
    if (!challengeB.allowTop10PickTrading && incomingTop10ToB.length) {
      return {
        ok: false,
        error: "This challenge mode blocks acquiring top-10 draft picks.",
        reasonCode: "challenge-top10-picks"
      };
    }

    const capA = session.getTeamCapSummary(teamA).capSpace;
    const capB = session.getTeamCapSummary(teamB).capSpace;
    const outgoingA = fromA.reduce((sum, player) => sum + player.contract.capHit, 0);
    const incomingA = fromB.reduce((sum, player) => sum + player.contract.capHit, 0);
    const outgoingB = fromB.reduce((sum, player) => sum + player.contract.capHit, 0);
    const incomingB = fromA.reduce((sum, player) => sum + player.contract.capHit, 0);

    if (capA + outgoingA - incomingA < 0 || capB + outgoingB - incomingB < 0) {
      return {
        ok: false,
        error: "Trade failed cap check.",
        reasonCode: "cap-failed",
        capAfter: {
          [teamA]: capA + outgoingA - incomingA,
          [teamB]: capB + outgoingB - incomingB
        }
      };
    }

    const teamAObj = session.getTeamById(teamA);
    const teamBObj = session.getTeamById(teamB);
    const rosterA = teamPlayersAll(session.league, teamA);
    const rosterB = teamPlayersAll(session.league, teamB);
    const playerValueOutA = fromA.reduce(
      (sum, player) => sum + playerTradeValueForTeam(player, teamAObj, rosterA, { incoming: false }),
      0
    );
    const playerValueInA = fromB.reduce(
      (sum, player) => sum + playerTradeValueForTeam(player, teamAObj, rosterA, { incoming: true }),
      0
    );
    const playerValueOutB = fromB.reduce(
      (sum, player) => sum + playerTradeValueForTeam(player, teamBObj, rosterB, { incoming: false }),
      0
    );
    const playerValueInB = fromA.reduce(
      (sum, player) => sum + playerTradeValueForTeam(player, teamBObj, rosterB, { incoming: true }),
      0
    );
    const adjustedPickValueA = picksA.reduce(
      (sum, pick) => sum + pickTradeValueForTeam(pick, teamAObj, rosterA),
      0
    );
    const adjustedPickValueB = picksB.reduce(
      (sum, pick) => sum + pickTradeValueForTeam(pick, teamBObj, rosterB),
      0
    );
    const incomingPickValueA = picksB.reduce(
      (sum, pick) => sum + pickTradeValueForTeam(pick, teamAObj, rosterA),
      0
    );
    const incomingPickValueB = picksA.reduce(
      (sum, pick) => sum + pickTradeValueForTeam(pick, teamBObj, rosterB),
      0
    );

    const outgoingValueA = playerValueOutA + adjustedPickValueA;
    const incomingValueA = playerValueInA + incomingPickValueA;
    const outgoingValueB = playerValueOutB + adjustedPickValueB;
    const incomingValueB = playerValueInB + incomingPickValueB;
    const strategyTolerance = (team) => {
      const aggression = session.getLeagueSettings().cpuTradeAggression;
      const aggressionAdj = clamp((aggression - 0.5) * 0.24, -0.12, 0.12);
      const profile = teamTransactionAiProfile(team, teamPlayersAll(session.league, team.id));
      if (team.strategyProfile === "rebuild") {
        return clamp(0.4 + aggressionAdj + profile.tradeToleranceDelta, 0.2, 0.55);
      }
      if (team.strategyProfile === "contender") {
        return clamp(0.25 + aggressionAdj + profile.tradeToleranceDelta, 0.12, 0.4);
      }
      return clamp(0.32 + aggressionAdj + profile.tradeToleranceDelta, 0.15, 0.5);
    };
    const toleranceA = strategyTolerance(teamAObj);
    const toleranceB = strategyTolerance(teamBObj);
    const aiAcceptableA =
      isTradeValueAcceptable({ outgoing: fromA, incoming: fromB, team: teamAObj, tolerance: toleranceA }) ||
      incomingValueA >= outgoingValueA * (1 - toleranceA);
    const aiAcceptableB =
      isTradeValueAcceptable({ outgoing: fromB, incoming: fromA, team: teamBObj, tolerance: toleranceB }) ||
      incomingValueB >= outgoingValueB * (1 - toleranceB);

    if (!aiAcceptableA || !aiAcceptableB) {
      return {
        ok: false,
        error: "Trade rejected by AI valuation.",
        reasonCode: "valuation-failed",
        valuation: {
          [teamA]: { outgoingValue: outgoingValueA, incomingValue: incomingValueA, delta: incomingValueA - outgoingValueA },
          [teamB]: { outgoingValue: outgoingValueB, incomingValue: incomingValueB, delta: incomingValueB - outgoingValueB }
        }
      };
    }
    return {
      ok: true,
      teamA,
      teamB,
      plan: this._createPlan(input),
      players: { fromA, fromB },
      picks: { fromA: picksA, fromB: picksB },
      capAfter: {
        [teamA]: capA + outgoingA - incomingA,
        [teamB]: capB + outgoingB - incomingB
      },
      valuation: {
        [teamA]: { outgoingValue: outgoingValueA, incomingValue: incomingValueA, delta: incomingValueA - outgoingValueA },
        [teamB]: { outgoingValue: outgoingValueB, incomingValue: incomingValueB, delta: incomingValueB - outgoingValueB }
      }
    };
  }

  commit(input) {
    if (input?.expectedPlanFingerprint) {
      const currentPlan = this._createPlan(input);
      if (currentPlan.fingerprint !== input.expectedPlanFingerprint) {
        return {
          ok: false,
          status: 409,
          reasonCode: "stale-trade-plan",
          error: "Trade authority changed after evaluation. Re-evaluate before committing.",
          currentPlan
        };
      }
    }
    const result = this.evaluate(input);
    if (!result.ok) return result;
    const { teamA, teamB } = result;
    const fromA = result.players.fromA;
    const fromB = result.players.fromB;
    const picksA = result.picks.fromA;
    const picksB = result.picks.fromB;

    for (const player of fromA) player.teamId = teamB;
    for (const player of fromB) player.teamId = teamA;
    for (const pick of picksA) pick.ownerTeamId = teamB;
    for (const pick of picksB) pick.ownerTeamId = teamA;

    this.session.logTransaction({
      type: "trade",
      teamA,
      teamB,
      details: {
        fromA: fromA.map((player) => ({ playerId: player.id, player: player.name, capHit: player.contract.capHit })),
        fromB: fromB.map((player) => ({ playerId: player.id, player: player.name, capHit: player.contract.capHit })),
        picksFromA: picksA.map((pick) => ({ id: pick.id, year: pick.year, round: pick.round, originalTeamId: pick.originalTeamId })),
        picksFromB: picksB.map((pick) => ({ id: pick.id, year: pick.year, round: pick.round, originalTeamId: pick.originalTeamId }))
      }
    });
    this.session.logNews(`${teamA} and ${teamB} completed a trade`, {
      teamA,
      teamB,
      playersMoved: fromA.length + fromB.length
    });
    this.strategies.ensureDepthCharts(this.session.league);
    this.strategies.recalculateAllTeamRatings(this.session.league);
    this.session.statBook.reindexPlayers();
    this.session.rebuildLookupIndexes();
    return {
      ok: true,
      teamA,
      teamB,
      movedA: fromA.map((player) => player.id),
      movedB: fromB.map((player) => player.id),
      movedPicksA: picksA.map((pick) => pick.id),
      movedPicksB: picksB.map((pick) => pick.id),
      valuation: result.valuation
    };
  }
}
