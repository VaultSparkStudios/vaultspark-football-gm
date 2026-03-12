import {
  COACHING_TENDENCY_ARCHETYPES,
  DEPTH_CHART_SNAP_SHARE,
  OFFENSIVE_PERSONNEL_PACKAGES
} from "../config.js";
import { clamp } from "../utils/rng.js";

const DEFENSIVE_SUBPACKAGE_RESPONSE = {
  "10": { DL: 4, LB: 1, DB: 6 },
  "11": { DL: 4, LB: 2, DB: 5 },
  "12": { DL: 4, LB: 3, DB: 4 },
  "13": { DL: 4, LB: 4, DB: 3 },
  "20": { DL: 4, LB: 2, DB: 5 },
  "21": { DL: 4, LB: 3, DB: 4 },
  "22": { DL: 4, LB: 4, DB: 3 }
};

function total(values = []) {
  return values.reduce((sum, value) => sum + value, 0);
}

function normalizeTo(values = [], targetTotal) {
  const currentTotal = total(values);
  if (!currentTotal || !targetTotal) return values.slice();
  return values.map((value) => value * (targetTotal / currentTotal));
}

function reshapeRoomShares(rawShares, baseShares, { floor = 0.005, ceiling = 0.995, blend = 0.65 } = {}) {
  const targetTotal = total(baseShares);
  const normalizedRaw = normalizeTo(rawShares, targetTotal);
  return baseShares.map((baseShare, index) =>
    Number(clamp(normalizedRaw[index] * blend + baseShare * (1 - blend), floor, ceiling).toFixed(3))
  );
}

function teamTendencies(team) {
  return team?.coaching?.tendencies || COACHING_TENDENCY_ARCHETYPES.balanced;
}

function normalizedPackageRates(team) {
  const tendencies = teamTendencies(team);
  const entries = Object.entries(OFFENSIVE_PERSONNEL_PACKAGES).map(([key, pkg]) => {
    let weight = Number(pkg.rate || 0);
    if (key === "11") weight *= 0.96 + (tendencies.deepShotRate || 1) * 0.14;
    if (key === "10") weight *= 0.82 + (tendencies.deepShotRate || 1) * 0.34;
    if (key === "12") weight *= 0.84 + (tendencies.targetTeRate || 1) * 0.24;
    if (key === "13") weight *= 0.72 + (tendencies.targetTeRate || 1) * 0.36;
    if (key === "20") weight *= 0.74 + (tendencies.rbCommitteeRate || 1) * 0.42;
    if (key === "21") weight *= 0.78 + (tendencies.rbCommitteeRate || 1) * 0.34;
    if (key === "22") weight *= 0.72 + (tendencies.rbCommitteeRate || 1) * 0.28;
    return {
      ...pkg,
      key,
      weight
    };
  });

  const weightTotal = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return entries.map((entry) => ({
    ...entry,
    rate: entry.weight / weightTotal
  }));
}

function slotParticipation(packages, roomKey, maxSlots) {
  const shares = Array.from({ length: maxSlots }, () => 0);
  for (const pkg of packages) {
    const slots = Math.max(0, Number(pkg[roomKey] || 0));
    for (let index = 0; index < maxSlots; index += 1) {
      if (index < slots) shares[index] += pkg.rate;
    }
  }
  return shares;
}

function defensiveSlotParticipation(packages, position, maxSlots) {
  const shares = Array.from({ length: maxSlots }, () => 0);
  for (const pkg of packages) {
    const response = DEFENSIVE_SUBPACKAGE_RESPONSE[pkg.key] || DEFENSIVE_SUBPACKAGE_RESPONSE["11"];
    const slots = Math.max(0, Number(response[position] || 0));
    for (let index = 0; index < maxSlots; index += 1) {
      if (index < slots) shares[index] += pkg.rate;
    }
  }
  return shares;
}

function adjustRbShares(shares, committeeRate) {
  const adjusted = shares.slice();
  const committee = clamp(Number(committeeRate || 1), 0.82, 1.18);
  adjusted[0] *= clamp(1.09 - (committee - 1) * 0.85, 0.84, 1.14);
  adjusted[1] *= clamp(0.96 + (committee - 1) * 1.4, 0.82, 1.16);
  adjusted[2] *= clamp(0.88 + (committee - 1) * 1.25, 0.72, 1.12);
  adjusted[3] *= clamp(0.76 + (committee - 1) * 1.5, 0.55, 1.08);
  return normalizeTo(adjusted, total(shares)).map((value) => Number(value.toFixed(3)));
}

function buildOlShares(packages, baseShares, team) {
  const runLean = 1 - Number(team?.scheme?.passRate ?? 0.54);
  const heavyRate = packages
    .filter((pkg) => ["12", "13", "22"].includes(pkg.key))
    .reduce((sum, pkg) => sum + pkg.rate, 0);
  const sixth = clamp(0.025 + heavyRate * 0.17 + runLean * 0.06, 0.03, 0.12);
  const seventh = clamp(0.005 + heavyRate * 0.03, 0.005, 0.035);
  const eighth = clamp(heavyRate * 0.008, 0.001, 0.015);
  const ninth = clamp(heavyRate * 0.003, 0.001, 0.008);
  return [
    0.99,
    0.99,
    0.99,
    0.99,
    0.99,
    Number(sixth.toFixed(3)),
    Number(seventh.toFixed(3)),
    Number(eighth.toFixed(3)),
    Number(ninth.toFixed(3))
  ].map((value, index) => Number(clamp(value, 0.001, baseShares[index] ? 0.995 : 0.05).toFixed(3)));
}

export function resolveDepthChartRoomShares({
  position,
  playerIds = [],
  baseShares = [],
  manualSharesByPlayer = {}
} = {}) {
  return playerIds.map((playerId, index) => {
    const defaultSnapShare = Number((baseShares[index] ?? 0.02).toFixed(3));
    const rawManual = Number(manualSharesByPlayer?.[playerId]);
    const manual = Number.isFinite(rawManual);
    const snapShare = Number(clamp(manual ? rawManual : defaultSnapShare, 0, 1).toFixed(3));
    return {
      position,
      rank: index + 1,
      playerId,
      defaultSnapShare,
      snapShare,
      manual
    };
  });
}

export function buildTeamUsageProfile(team) {
  const base = DEPTH_CHART_SNAP_SHARE;
  const tendencies = teamTendencies(team);
  const packages = normalizedPackageRates(team);

  const wrShares = reshapeRoomShares(slotParticipation(packages, "wr", base.WR.length), base.WR, {
    floor: 0.01,
    ceiling: 0.99,
    blend: 0.72
  });
  const teShares = reshapeRoomShares(slotParticipation(packages, "te", base.TE.length), base.TE, {
    floor: 0.01,
    ceiling: 0.96,
    blend: 0.7
  });
  const rbBase = reshapeRoomShares(slotParticipation(packages, "rb", base.RB.length), base.RB, {
    floor: 0.01,
    ceiling: 0.92,
    blend: 0.68
  });
  const rbShares = adjustRbShares(rbBase, tendencies.rbCommitteeRate);

  const dbShares = reshapeRoomShares(defensiveSlotParticipation(packages, "DB", base.DB.length), base.DB, {
    floor: 0.01,
    ceiling: 0.99,
    blend: 0.7
  });
  const lbShares = reshapeRoomShares(defensiveSlotParticipation(packages, "LB", base.LB.length), base.LB, {
    floor: 0.005,
    ceiling: 0.92,
    blend: 0.72
  });
  const dlShares = reshapeRoomShares(defensiveSlotParticipation(packages, "DL", base.DL.length), base.DL, {
    floor: 0.01,
    ceiling: 0.9,
    blend: 0.58
  });

  const qb2 = clamp((1 - (tendencies.rotationDiscipline || 1)) * 0.07 + 0.015, 0.01, 0.05);
  const qbShares = [Number((1 - qb2).toFixed(3)), Number(qb2.toFixed(3))];

  return {
    packages,
    sharesByPosition: {
      QB: qbShares,
      RB: rbShares,
      WR: wrShares,
      TE: teShares,
      OL: buildOlShares(packages, base.OL, team),
      DL: dlShares,
      LB: lbShares,
      DB: dbShares,
      K: base.K.slice(),
      P: base.P.slice()
    }
  };
}

function topPlayers(players, position, count) {
  return players
    .filter((player) => player.position === position)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, count);
}

export function depthOrderedPlayers(league, teamId, position, roster) {
  const chart = league.depthCharts?.[teamId]?.[position];
  if (!Array.isArray(chart) || !chart.length) return topPlayers(roster, position, 32);
  const byId = new Map(roster.filter((player) => player.position === position).map((player) => [player.id, player]));
  const fromChart = chart.map((id) => byId.get(id)).filter(Boolean);
  const missing = roster
    .filter((player) => player.position === position && !fromChart.some((entry) => entry.id === player.id))
    .sort((a, b) => b.overall - a.overall);
  return [...fromChart, ...missing];
}
