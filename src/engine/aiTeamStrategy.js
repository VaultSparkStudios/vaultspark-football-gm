import { POSITION_ROLE_RETENTION, ROSTER_TEMPLATE, TEAM_STRATEGY_PRESETS } from "../config.js";
import { normalizeContract } from "../domain/contracts.js";
import { clamp } from "../utils/rng.js";
import { buildGmReputationProfile } from "./gmLegacyScore.js";

function schemeWeight(position, scheme = { passRate: 0.5, aggression: 0.5 }) {
  const passRate = Number(scheme.passRate || 0.5);
  const aggression = Number(scheme.aggression || 0.5);
  if (position === "QB" || position === "WR" || position === "TE") return 0.9 + passRate * 0.28;
  if (position === "RB" || position === "OL") return 0.9 + (1 - passRate) * 0.22;
  if (position === "DL" || position === "LB") return 0.9 + aggression * 0.22;
  if (position === "DB") return 0.9 + (1 - aggression) * 0.2;
  return 1;
}

// S109 — rival GM personas were flavor text: `rivalGmPersona.js` declared them
// "non-causal" and every rival judged a package through one flat ±0.33 band.
// These tables are the whole causal surface. They key on the persona's
// `style` (the club's strategyProfile) and its two traits, both of which are
// derived from seed + team id with no RNG draw, so a persona changes a verdict
// without moving the session stream.

/** Value-ratio band a persona will accept, by style. Gamblers overpay for the piece; hoarders guard the ledger. */
export const PERSONA_TRADE_TOLERANCE = Object.freeze({
  "win-now": 0.45,
  contender: 0.38,
  balanced: 0.33,
  retool: 0.28,
  rebuild: 0.22
});

/** Traits that say something about how a GM haggles move the band; the rest are voice only. */
export const PERSONA_TRAIT_TOLERANCE_DELTA = Object.freeze({
  "treats the deadline like a holiday": 0.04,
  "works the phones on draft night": 0.03,
  "overpays for proven playoff tape": 0.03,
  "never forgets a lopsided deal": -0.04,
  "guards the cap like a vault": -0.03,
  "won't move future firsts": -0.02
});

/** Age-curve weight by style: win-now pays for prime years, rebuilders pay for the ones still coming. */
export const PERSONA_AGE_HORIZON = Object.freeze({
  "win-now": { youth: 0.95, prime: 1.12, veteran: 1.02 },
  contender: { youth: 0.97, prime: 1.08, veteran: 1 },
  balanced: { youth: 1, prime: 1, veteran: 1 },
  retool: { youth: 1.06, prime: 1, veteran: 0.96 },
  rebuild: { youth: 1.12, prime: 0.98, veteran: 0.9 }
});

export const DEFAULT_TRADE_TOLERANCE = 0.33;
export const TRADE_TOLERANCE_BOUNDS = Object.freeze({ min: 0.12, max: 0.55 });
/** An incoming player at the rival's top-need position is worth this much more to them ... */
export const TRADE_NEED_PREMIUM = 0.15;
/** ... and one at a room they already have covered this much less. */
export const TRADE_SURPLUS_DISCOUNT = 0.12;
/**
 * Starter-points a room must sit from the league line before it counts as a
 * need or a surplus. Measured on seed 20260306 the real rooms sit within ±2
 * and the one-man specialist rooms swing ±6, so without a floor every club
 * always "needs" something and it is usually a punter.
 */
export const TRADE_NEED_THRESHOLD = 1;
/** Rooms the trade seam reads needs from; specialists are one-man rooms and never a trade target here. */
export const TRADE_NEED_POSITIONS = Object.freeze(Object.keys(ROSTER_TEMPLATE).filter((position) => position !== "K" && position !== "P"));

const NEED_NOUN = Object.freeze({
  QB: "quarterback",
  RB: "back",
  WR: "receiver",
  TE: "tight end",
  OL: "lineman",
  DL: "pass rusher",
  LB: "linebacker",
  DB: "corner",
  K: "kicker",
  P: "punter"
});

function ageBand(age) {
  const years = Number(age || 26);
  if (years <= 24) return "youth";
  if (years <= 29) return "prime";
  return "veteran";
}

export function personaAgeHorizon(player, persona) {
  const horizon = PERSONA_AGE_HORIZON[persona?.style] || null;
  if (!horizon) return 1;
  return horizon[ageBand(player?.age)] ?? 1;
}

export function playerStrategyValue(player, team, { persona = null } = {}) {
  const contract = normalizeContract(player.contract);
  const strategy = TEAM_STRATEGY_PRESETS[team?.strategyProfile] || TEAM_STRATEGY_PRESETS.balanced;
  const roleRule = POSITION_ROLE_RETENTION[player.position] || POSITION_ROLE_RETENTION.QB;
  const agePrime = player.age <= 24 ? 1.06 : player.age <= 29 ? 1.08 : player.age <= 32 ? 1 : 0.9;
  const devBoost =
    player.developmentTrait === "Superstar"
      ? 1.12
      : player.developmentTrait === "Hidden Development"
        ? 1.07
        : player.developmentTrait === "Bust"
          ? 0.9
          : 1;
  const roleBoost = player.age <= roleRule.replaceAge ? 1.02 : 0.94;
  const veteranBoost = player.age >= 28 ? strategy.veteranBias : 1;
  const youthBoost = player.age <= 24 ? strategy.youthBias : 1;
  const capPenalty = clamp(1 - contract.capHit / (75_000_000 * strategy.capDiscipline), 0.76, 1.08);
  const fitBonus = 0.88 + ((player.schemeFit || 70) - 70) / 220;
  const moraleBonus = 0.9 + ((player.morale || 70) - 70) / 280;
  // Only the trade seam passes a persona; depth charts still sort on the club's preset alone.
  const horizon = personaAgeHorizon(player, persona);
  return Number(
    (
      player.overall *
      schemeWeight(player.position, team.scheme) *
      agePrime *
      devBoost *
      roleBoost *
      veteranBoost *
      youthBoost *
      fitBonus *
      moraleBonus *
      capPenalty *
      horizon
    ).toFixed(2)
  );
}

export function roleRetentionProfile(position) {
  return POSITION_ROLE_RETENTION[position] || POSITION_ROLE_RETENTION.QB;
}

export function strategyPresetForTeam(team) {
  return TEAM_STRATEGY_PRESETS[team?.strategyProfile] || TEAM_STRATEGY_PRESETS.balanced;
}

export function sortPlayersForDepth(players, team) {
  return players
    .slice()
    .sort((a, b) => playerStrategyValue(b, team) - playerStrategyValue(a, team) || b.overall - a.overall);
}

export function defaultDepthChartForTeam(players, team) {
  const chart = {};
  for (const position of Object.keys(ROSTER_TEMPLATE)) {
    const ranked = sortPlayersForDepth(
      players.filter((player) => player.position === position),
      team
    );
    chart[position] = ranked.map((player) => player.id);
  }
  return chart;
}

/**
 * Quality-based roster needs for the trade seam. The counts-based summary
 * GameSession keeps for maintenance is a dead signal here: AI maintenance
 * holds every room at template size, so delta is 0 everywhere. A room is a
 * need when the club's starters at it sit below the league's starters at it.
 * Returns [{ position, delta, top, leagueTop }], delta < 0 meaning need.
 */
export function buildTradeNeedProfile(league, teamId) {
  const players = Array.isArray(league?.players) ? league.players : [];
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const byTeam = new Map();
  for (const player of players) {
    if (player.status !== "active" || (player.rosterSlot || "active") !== "active") continue;
    if (!player.teamId || player.teamId === "FA" || player.teamId === "WAIVER") continue;
    let rooms = byTeam.get(player.teamId);
    if (!rooms) byTeam.set(player.teamId, (rooms = {}));
    (rooms[player.position] ||= []).push(Number(player.overall) || 0);
  }
  const starters = (position) => Math.max(1, Math.round((ROSTER_TEMPLATE[position] || 1) / 2));
  const roomTop = (rooms, position) => {
    const ratings = (rooms?.[position] || []).slice().sort((a, b) => b - a).slice(0, starters(position));
    return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
  };
  const teamIds = teams.length ? teams.map((team) => team.id) : [...byTeam.keys()];
  return TRADE_NEED_POSITIONS.map((position) => {
    const tops = teamIds.map((id) => roomTop(byTeam.get(id), position));
    const leagueTop = tops.length ? tops.reduce((sum, value) => sum + value, 0) / tops.length : 0;
    const top = roomTop(byTeam.get(teamId), position);
    return { position, top: Number(top.toFixed(2)), leagueTop: Number(leagueTop.toFixed(2)), delta: Number((top - leagueTop).toFixed(2)) };
  });
}

/** The single most exposed room (most negative delta) and the rooms already covered (delta > 0). */
export function rankTradeNeeds(rosterNeeds = []) {
  const rows = (Array.isArray(rosterNeeds) ? rosterNeeds : [])
    .filter((row) => row?.position && Number.isFinite(Number(row.delta)))
    .map((row) => ({ position: row.position, delta: Number(row.delta) }));
  const needs = rows
    .filter((row) => row.delta <= -TRADE_NEED_THRESHOLD)
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position));
  return {
    topNeed: needs[0]?.position || null,
    surplus: new Set(rows.filter((row) => row.delta >= TRADE_NEED_THRESHOLD).map((row) => row.position))
  };
}

export function tradeNeedMultiplier(position, rosterNeeds = []) {
  const { topNeed, surplus } = rankTradeNeeds(rosterNeeds);
  if (position && position === topNeed) return 1 + TRADE_NEED_PREMIUM;
  if (position && surplus.has(position)) return 1 - TRADE_SURPLUS_DISCOUNT;
  return 1;
}

export function resolvePersonaTradeTolerance({ persona = null, tolerance = null } = {}) {
  // `Number(null)` is 0 and finite; an absent tolerance must fall through to the style table.
  const base = tolerance != null && Number.isFinite(Number(tolerance))
    ? Number(tolerance)
    : PERSONA_TRADE_TOLERANCE[persona?.style] ?? DEFAULT_TRADE_TOLERANCE;
  const traitDelta = (persona?.traits || []).reduce((sum, trait) => sum + (PERSONA_TRAIT_TOLERANCE_DELTA[trait] || 0), 0);
  return Number(clamp(base + traitDelta, TRADE_TOLERANCE_BOUNDS.min, TRADE_TOLERANCE_BOUNDS.max).toFixed(3));
}

/** The line the offer and the evaluation receipt carry; null when needs played no part. */
export function describeTradeNeed({ team, incoming = [], outgoing = [], rosterNeeds = [] } = {}) {
  const { topNeed, surplus } = rankTradeNeeds(rosterNeeds);
  const who = team?.id || team?.name || "They";
  const fills = incoming.find((player) => player?.position === topNeed);
  if (fills) {
    const noun = NEED_NOUN[topNeed] || topNeed;
    const cost = outgoing.length ? `${NEED_NOUN[outgoing[0].position] || outgoing[0].position} depth` : "the picks";
    return `${who} need a ${noun} more than they need ${cost}.`;
  }
  const spare = incoming.find((player) => player?.position && surplus.has(player.position));
  if (spare) {
    const noun = NEED_NOUN[spare.position] || spare.position;
    return `${who} already have ${noun} depth; another ${noun} moves them less.`;
  }
  return null;
}

/**
 * The shared acceptance seam. Every CPU verdict — TradeService for both
 * clubs, rival inbound offers, the draft-day market's counterpart — passes
 * through here, so a persona and a need profile change the decision in one
 * place. No RNG: persona is derived, needs are a sort.
 */
export function evaluateTradeValue({ outgoing = [], incoming = [], team, tolerance = null, persona = null, rosterNeeds = [] } = {}) {
  const band = resolvePersonaTradeTolerance({ persona, tolerance });
  const outgoingValue = outgoing.reduce((sum, player) => sum + playerStrategyValue(player, team, { persona }), 0);
  const incomingValue = incoming.reduce(
    (sum, player) => sum + playerStrategyValue(player, team, { persona }) * tradeNeedMultiplier(player.position, rosterNeeds),
    0
  );
  const needRead = describeTradeNeed({ team, incoming, outgoing, rosterNeeds });
  const receipt = { tolerance: band, outgoingValue, incomingValue, ratio: null, needRead, persona: persona?.name || null };
  if (outgoingValue <= 0 && incomingValue <= 0) return { ...receipt, acceptable: true };
  if (outgoingValue <= 0 || incomingValue <= 0) return { ...receipt, acceptable: false };
  const ratio = incomingValue / outgoingValue;
  return { ...receipt, ratio, acceptable: ratio >= 1 - band && ratio <= 1 + band };
}

export function tradePackageValue(players, team, options = {}) {
  return players.reduce((sum, player) => sum + playerStrategyValue(player, team, options), 0);
}

export function isTradeValueAcceptable(args) {
  return evaluateTradeValue(args).acceptable;
}

/**
 * The pre-S109 gate, kept reachable so the negative control can show the flat
 * band accepting what the need-aware one refuses. Not wired to any decision.
 */
export function isTradeValueAcceptableFlat({ outgoing, incoming, team, tolerance = DEFAULT_TRADE_TOLERANCE }) {
  const outgoingValue = tradePackageValue(outgoing, team);
  const incomingValue = tradePackageValue(incoming, team);
  if (outgoingValue <= 0 && incomingValue <= 0) return true;
  if (outgoingValue <= 0 || incomingValue <= 0) return false;
  const ratio = incomingValue / outgoingValue;
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
}

export function applyReputationToTradeAsk(baseAsk, gmLegacy) {
  const rep = buildGmReputationProfile(gmLegacy);
  return Math.round(baseAsk * rep.multiplier);
}
