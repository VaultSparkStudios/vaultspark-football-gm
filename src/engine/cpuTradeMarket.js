/**
 * Bounded league trade activity between CPU front offices.
 *
 * This module only proposes packages. TradeService is the sole authority for
 * valuation, cap, challenge rules, deadline, transaction logging and indexes.
 * No random stream is consumed: the same league at the same week gets the same
 * proposal order, including after snapshot restore.
 */
import { FIELDABLE_DEPTH } from "../config.js";
import { buildTradeNeedProfile } from "./aiTeamStrategy.js";

const MARKET_WEEKS = new Set([2, 4, 6, 8, 10]);
const MAX_TRADES_PER_SEASON = 4;
const MAX_PAIRS_TO_PROBE = 36;
const MIN_QUALITY_GAP = 1;

function activeRooms(league, teamId) {
  const rooms = new Map();
  for (const player of league.players || []) {
    if (player.teamId !== teamId || player.status !== "active" || (player.rosterSlot || "active") !== "active") continue;
    const room = rooms.get(player.position) || [];
    room.push(player);
    rooms.set(player.position, room);
  }
  for (const room of rooms.values()) {
    room.sort((a, b) => (b.overall || 0) - (a.overall || 0) || String(a.id).localeCompare(String(b.id)));
  }
  return rooms;
}

function positionExchangeOptions(from, to) {
  const options = [];
  for (const [position, fromRead] of from.needs) {
    const toRead = to.needs.get(position);
    const band = FIELDABLE_DEPTH[position];
    if (!band || !toRead || fromRead < MIN_QUALITY_GAP || toRead > -MIN_QUALITY_GAP) continue;
    const fromRoom = from.rooms.get(position) || [];
    const toRoom = to.rooms.get(position) || [];
    // A one-for-one swap across positions must leave both active rooms fieldable.
    if (fromRoom.length <= band.min || toRoom.length >= band.max) continue;
    const players = fromRoom.slice(1, 5).filter((player) =>
      player.overall >= 68 && player.age <= 32 && Number.isFinite(Number(player.contract?.capHit))
    );
    if (players.length) options.push({ position, score: fromRead - toRead, players });
  }
  return options.sort((a, b) => b.score - a.score || a.position.localeCompare(b.position)).slice(0, 3);
}

function seasonTrades(session) {
  return (session.league.transactionLog || []).filter((row) =>
    row.type === "trade" && Number(row.year) === Number(session.currentYear) &&
    row.teamA !== session.controlledTeamId && row.teamB !== session.controlledTeamId
  );
}

export function runCpuTradeMarket(session) {
  if (session.phase !== "regular-season" || !MARKET_WEEKS.has(Number(session.currentWeek))) return null;
  if (Number(session.currentWeek) > Number(session.getLeagueSettings().tradeDeadlineWeek)) return null;
  const service = session.services?.trades;
  if (!service) return null;
  const prior = seasonTrades(session);
  if (prior.length >= MAX_TRADES_PER_SEASON || prior.some((row) => Number(row.week) === Number(session.currentWeek))) return null;
  const used = new Set(prior.flatMap((row) => [row.teamA, row.teamB]));
  const clubs = (session.league.teams || [])
    .filter((team) => team.id !== session.controlledTeamId && !used.has(team.id))
    .map((team) => ({
      id: team.id,
      rooms: activeRooms(session.league, team.id),
      needs: new Map(buildTradeNeedProfile(session.league, team.id).map((row) => [row.position, row.delta]))
    }));
  const pairs = [];
  for (let i = 0; i < clubs.length; i += 1) {
    for (let j = i + 1; j < clubs.length; j += 1) {
      const fromA = positionExchangeOptions(clubs[i], clubs[j]);
      const fromB = positionExchangeOptions(clubs[j], clubs[i]);
      if (fromA.length && fromB.length) {
        pairs.push({ a: clubs[i], b: clubs[j], fromA, fromB, score: fromA[0].score + fromB[0].score });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id) || a.b.id.localeCompare(b.b.id));

  for (const pair of pairs.slice(0, MAX_PAIRS_TO_PROBE)) {
    for (const aRoom of pair.fromA) {
      for (const bRoom of pair.fromB) {
        if (aRoom.position === bRoom.position) continue;
        for (const aPlayer of aRoom.players) {
          for (const bPlayer of bRoom.players) {
            const input = {
              teamA: pair.a.id, teamB: pair.b.id,
              teamAPlayerIds: [aPlayer.id], teamBPlayerIds: [bPlayer.id],
              teamAPickIds: [], teamBPickIds: []
            };
            const evaluation = service.evaluate(input);
            if (!evaluation.ok) continue;
            const result = service.commit({ ...input, expectedPlanFingerprint: evaluation.plan.fingerprint });
            if (!result.ok) continue;
            const rationale = `${pair.a.id} dealt from ${aRoom.position} depth to address ${bRoom.position}; ${pair.b.id} made the reciprocal roster call.`;
            session.logNews(`${pair.a.id} sent ${aPlayer.name} to ${pair.b.id} for ${bPlayer.name}. ${rationale}`, {
              kind: "cpu-trade-market", teamA: pair.a.id, teamB: pair.b.id,
              playerIds: [aPlayer.id, bPlayer.id]
            });
            return {
              ...result,
              year: session.currentYear,
              week: session.currentWeek,
              rationale,
              players: [aPlayer.name, bPlayer.name]
            };
          }
        }
      }
    }
  }
  return null;
}
