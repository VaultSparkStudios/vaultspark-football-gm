import { POSITION_ROLE_RETENTION, ROSTER_TEMPLATE, TEAM_STRATEGY_PRESETS } from "../config.js";
import { normalizeContract } from "../domain/contracts.js";
import { clamp } from "../utils/rng.js";

function schemeWeight(position, scheme = { passRate: 0.5, aggression: 0.5 }) {
  const passRate = Number(scheme.passRate || 0.5);
  const aggression = Number(scheme.aggression || 0.5);
  if (position === "QB" || position === "WR" || position === "TE") return 0.9 + passRate * 0.28;
  if (position === "RB" || position === "OL") return 0.9 + (1 - passRate) * 0.22;
  if (position === "DL" || position === "LB") return 0.9 + aggression * 0.22;
  if (position === "DB") return 0.9 + (1 - aggression) * 0.2;
  return 1;
}

export function playerStrategyValue(player, team) {
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
      capPenalty
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

export function tradePackageValue(players, team) {
  return players.reduce((sum, player) => sum + playerStrategyValue(player, team), 0);
}

export function isTradeValueAcceptable({ outgoing, incoming, team, tolerance = 0.33 }) {
  const outgoingValue = tradePackageValue(outgoing, team);
  const incomingValue = tradePackageValue(incoming, team);
  if (outgoingValue <= 0 && incomingValue <= 0) return true;
  if (outgoingValue <= 0 || incomingValue <= 0) return false;
  const ratio = incomingValue / outgoingValue;
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
}
