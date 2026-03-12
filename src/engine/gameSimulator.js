import { DEPTH_CHART_ROLE_NAMES, DRIVE_OUTCOMES, NFL_STRUCTURE } from "../config.js";
import { createZeroedSeasonStats, mergeStats } from "../domain/playerFactory.js";
import { clamp, mean } from "../utils/rng.js";
import { getTeamPlayers } from "../domain/teamFactory.js";
import { buildTeamUsageProfile, depthOrderedPlayers, resolveDepthChartRoomShares } from "./depthChartUsage.js";

function mergeObject(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key]) target[key] = {};
      mergeObject(target[key], value);
    } else if (typeof value === "number") {
      target[key] = (target[key] || 0) + value;
    }
  }
  return target;
}

function addDelta(deltaMap, playerId, delta) {
  if (!deltaMap.has(playerId)) deltaMap.set(playerId, {});
  const current = deltaMap.get(playerId);
  mergeObject(current, delta);
}

function topPlayers(players, position, count) {
  return players
    .filter((player) => player.position === position)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, count);
}

function buildRotation(players, shares = []) {
  const rotation = [];
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    const snapShare = shares[i] ?? 0.02;
    const talentBoost = 0.85 + ((player.overall || 70) - 70) / 260;
    const fitBoost = 0.88 + ((player.schemeFit || 70) - 70) / 250;
    const moraleBoost = 0.9 + ((player.morale || 70) - 70) / 320;
    rotation.push({
      player,
      rank: i + 1,
      snapShare: Number(clamp(snapShare, 0, 1).toFixed(3)),
      usageWeight: clamp(snapShare * talentBoost * fitBoost * moraleBoost, 0, 2)
    });
  }
  return rotation;
}

function sumUsage(rotation) {
  return rotation.reduce((sum, row) => sum + row.usageWeight, 0);
}

function chooseFromRotation(rng, rotation) {
  if (!rotation.length) return null;
  const total = sumUsage(rotation);
  let roll = rng.float(0, total);
  for (const row of rotation) {
    roll -= row.usageWeight;
    if (roll <= 0) return row.player;
  }
  return rotation[rotation.length - 1].player;
}

function applySnapCounts(statBook, year, rotation, unitSnaps, key, seasonType = "regular") {
  const playersWithSnaps = new Set();
  if (!rotation?.length || !unitSnaps) return playersWithSnaps;
  const boundedSnaps = Math.max(0, Math.round(unitSnaps));
  for (const row of rotation) {
    const snaps = Math.max(0, Math.round(boundedSnaps * row.snapShare));
    if (!snaps) continue;
    playersWithSnaps.add(row.player.id);
    statBook.applyStatDelta(
      row.player.id,
      year,
      { snaps: { [key]: snaps } },
      { teamId: row.player.teamId, position: row.player.position, seasonType }
    );
    if (key === "offense" && row.player.position === "OL") {
      statBook.applyStatDelta(
        row.player.id,
        year,
        { snaps: { passBlock: Math.round(snaps * 0.58), runBlock: Math.round(snaps * 0.42) } },
        { teamId: row.player.teamId, position: row.player.position, seasonType }
      );
    }
  }
  return playersWithSnaps;
}

function applyBlockingNoise(statBook, year, olRotation, offSnaps, rng, seasonType = "regular") {
  for (const row of olRotation.slice(0, 5)) {
    const snaps = Math.max(1, Math.round(offSnaps * row.snapShare));
    const pressureChance = clamp(0.015 + (78 - (row.player.overall || 70)) * 0.0012, 0.004, 0.07);
    const penaltyChance = clamp(0.01 + (76 - (row.player.ratings?.discipline || 70)) * 0.0009, 0.003, 0.06);
    let pressures = 0;
    for (let i = 0; i < snaps; i += 1) {
      if (rng.chance(pressureChance)) pressures += 1;
    }
    const penalties = rng.chance(penaltyChance * Math.min(3, snaps / 25)) ? 1 : 0;
    if (pressures || penalties) {
      statBook.applyStatDelta(
        row.player.id,
        year,
        { blocking: { pressuresAllowed: pressures, penalties } },
        { teamId: row.player.teamId, position: row.player.position, seasonType }
      );
    }
  }
}

function choosePlayer(rng, players) {
  if (!players.length) return null;
  const weights = players.map((p, i) => Math.max(1, (players.length - i) * 1.5));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.float(0, total);
  for (let i = 0; i < players.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return players[i];
  }
  return players[players.length - 1];
}

function chooseWeightedEntity(rng, entries) {
  const clean = entries.filter((entry) => entry?.player && entry.weight > 0);
  if (!clean.length) return null;
  const total = clean.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.float(0, total);
  for (const entry of clean) {
    roll -= entry.weight;
    if (roll <= 0) return entry.player;
  }
  return clean[clean.length - 1].player;
}

function rating(player, key, fallback = 68) {
  return player?.ratings?.[key] ?? fallback;
}

function averageRatingFromRotation(rotation, keys, fallback = 68) {
  const players = (rotation || []).map((row) => row.player).filter(Boolean);
  if (!players.length) return fallback;
  return mean(
    players.map((player) =>
      mean(keys.map((key) => rating(player, key, fallback)))
    )
  );
}

function averageRatingFromPlayers(players, keys, fallback = 68) {
  const clean = (players || []).filter(Boolean);
  if (!clean.length) return fallback;
  return mean(clean.map((player) => mean(keys.map((key) => rating(player, key, fallback)))));
}

const GAME_MISS_CHANCE_BY_POSITION = {
  QB: 0.025,
  RB: 0.1,
  WR: 0.085,
  TE: 0.08,
  OL: 0.07,
  DL: 0.065,
  LB: 0.065,
  DB: 0.06,
  K: 0.01,
  P: 0.01
};

const MIN_GAME_READY_BY_POSITION = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
  OL: 5,
  DL: 4,
  LB: 2,
  DB: 4,
  K: 1,
  P: 1
};

function gameMissChance(player, team) {
  const base = GAME_MISS_CHANCE_BY_POSITION[player.position] ?? 0.05;
  const agePenalty = Math.max(0, (player.age || 26) - 28) * 0.004;
  const durabilityBoost = Math.max(0, ((player.ratings?.strength || 70) - 70) * 0.0012);
  const disciplineBoost = Math.max(0, ((team?.coaching?.discipline || 72) - 72) * 0.0005);
  const moraleBoost = Math.max(0, ((player.morale || 70) - 70) * 0.0006);
  const capped = base + agePenalty - durabilityBoost - disciplineBoost - moraleBoost;
  return clamp(capped, 0.004, player.position === "K" || player.position === "P" ? 0.035 : 0.18);
}

function buildGameReadyRoster(roster, team, rng) {
  const ready = [];
  const reserves = {};
  for (const player of roster) {
    if (rng.chance(gameMissChance(player, team))) {
      if (!reserves[player.position]) reserves[player.position] = [];
      reserves[player.position].push(player);
      continue;
    }
    ready.push(player);
  }

  for (const [position, minimum] of Object.entries(MIN_GAME_READY_BY_POSITION)) {
    const current = ready.filter((player) => player.position === position).length;
    const pool = reserves[position] || [];
    for (let index = current; index < minimum && pool.length; index += 1) {
      ready.push(pool.shift());
    }
  }

  return ready;
}

function buildTeamContext(league, teamId, rng) {
  const team = league.teams.find((t) => t.id === teamId);
  const roster = buildGameReadyRoster(getTeamPlayers(league, teamId), team, rng);
  const usageProfile = buildTeamUsageProfile(team);
  const manualSharesByPosition = league.depthChartSnapShares?.[teamId] || {};
  const qbs = depthOrderedPlayers(league, teamId, "QB", roster).slice(0, 2);
  const rbs = depthOrderedPlayers(league, teamId, "RB", roster).slice(0, 4);
  const wrs = depthOrderedPlayers(league, teamId, "WR", roster).slice(0, 6);
  const tes = depthOrderedPlayers(league, teamId, "TE", roster).slice(0, 3);
  const ol = depthOrderedPlayers(league, teamId, "OL", roster).slice(0, 9);
  const dls = depthOrderedPlayers(league, teamId, "DL", roster).slice(0, 8);
  const lbs = depthOrderedPlayers(league, teamId, "LB", roster).slice(0, 7);
  const dbs = depthOrderedPlayers(league, teamId, "DB", roster).slice(0, 8);
  const ks = depthOrderedPlayers(league, teamId, "K", roster).slice(0, 1);
  const ps = depthOrderedPlayers(league, teamId, "P", roster).slice(0, 1);

  const resolveShares = (position, players) =>
    resolveDepthChartRoomShares({
      position,
      playerIds: players.map((player) => player.id),
      baseShares: usageProfile.sharesByPosition[position] || [],
      manualSharesByPlayer: manualSharesByPosition[position] || {}
    }).map((row) => row.snapShare);

  const shares = {
    ...usageProfile.sharesByPosition,
    QB: resolveShares("QB", qbs),
    RB: resolveShares("RB", rbs),
    WR: resolveShares("WR", wrs),
    TE: resolveShares("TE", tes),
    OL: resolveShares("OL", ol),
    DL: resolveShares("DL", dls),
    LB: resolveShares("LB", lbs),
    DB: resolveShares("DB", dbs),
    K: resolveShares("K", ks.length ? ks : topPlayers(roster, "K", 1)),
    P: resolveShares("P", ps.length ? ps : topPlayers(roster, "P", 1))
  };
  usageProfile.sharesByPosition = shares;

  const qbRotation = buildRotation(qbs, shares.QB);
  const rbRotation = buildRotation(rbs, shares.RB);
  const wrRotation = buildRotation(wrs, shares.WR);
  const teRotation = buildRotation(tes, shares.TE);
  const olRotation = buildRotation(ol, shares.OL);
  const dlRotation = buildRotation(dls, shares.DL);
  const lbRotation = buildRotation(lbs, shares.LB);
  const dbRotation = buildRotation(dbs, shares.DB);
  const kRotation = buildRotation(ks.length ? ks : topPlayers(roster, "K", 1), shares.K);
  const pRotation = buildRotation(ps.length ? ps : topPlayers(roster, "P", 1), shares.P);

  const qb = qbRotation[0]?.player || choosePlayer(rng, roster);
  const rb = rbRotation[0]?.player || choosePlayer(rng, roster);
  const k = kRotation[0]?.player || choosePlayer(rng, roster);
  const p = pRotation[0]?.player || choosePlayer(rng, roster);

  const basePassLean = team.scheme?.passRate ?? 0.54;
  const coachingDelta = ((team.coaching?.offense || 72) - 72) / 180;
  const passLean = clamp(basePassLean + (qb.overall - rb.overall) * 0.0035 + coachingDelta, 0.34, 0.72);
  const chemistry = team.chemistry || 70;
  const schemeFit = roster.length
    ? roster.reduce((sum, player) => sum + (player.schemeFit || 70), 0) / roster.length
    : 70;
  const unitRatings = {
    passBlocking: averageRatingFromRotation(olRotation.slice(0, 5), ["passBlocking", "awareness", "strength"], 70),
    runBlocking: averageRatingFromRotation(olRotation.slice(0, 5), ["runBlocking", "strength", "awareness"], 70),
    passRush: mean([
      averageRatingFromRotation(dlRotation, ["passRush", "blockShedding", "playRecognition"], 68),
      averageRatingFromRotation(lbRotation, ["passRush", "blockShedding", "pursuit"], 66)
    ]),
    runDefense: mean([
      averageRatingFromRotation(dlRotation, ["tackle", "blockShedding", "strength"], 68),
      averageRatingFromRotation(lbRotation, ["tackle", "pursuit", "hitPower"], 68)
    ]),
    coverage: mean([
      averageRatingFromRotation(dbRotation, ["coverage", "manCoverage", "zoneCoverage", "playRecognition"], 68),
      averageRatingFromRotation(lbRotation, ["coverage", "playRecognition", "pursuit"], 65)
    ]),
    tackling: mean([
      averageRatingFromRotation(lbRotation, ["tackle", "pursuit", "hitPower"], 68),
      averageRatingFromRotation(dbRotation, ["tackle", "pursuit", "coverage"], 66)
    ])
  };
  return {
    team,
    roster,
    qb,
    rb,
    wrs,
    tes,
    ol,
    dls,
    lbs,
    dbs,
    qbRotation,
    rbRotation,
    wrRotation,
    teRotation,
    olRotation,
    dlRotation,
    lbRotation,
    dbRotation,
    kRotation,
    pRotation,
    k,
    p,
    passLean,
    chemistry,
    schemeFit,
    roleNames: DEPTH_CHART_ROLE_NAMES,
    usageProfile,
    unitRatings
  };
}

function chooseReceiver(rng, offenseContext) {
  const targetRbRate = offenseContext.team?.coaching?.tendencies?.targetRbRate || 1;
  const targetTeRate = offenseContext.team?.coaching?.tendencies?.targetTeRate || 1;
  const entries = [
    ...offenseContext.wrRotation.map((row, index) => ({
      player: row.player,
      weight: row.usageWeight * (index === 0 ? 1.18 : index === 1 ? 1.08 : index === 2 ? 0.98 : 0.58)
    })),
    ...offenseContext.teRotation.map((row, index) => ({
      player: row.player,
      weight: row.usageWeight * (index === 0 ? 0.96 : 0.54) * targetTeRate
    })),
    ...offenseContext.rbRotation.map((row, index) => ({
      player: row.player,
      weight: row.usageWeight * (index === 0 ? 0.24 : index === 1 ? 0.13 : 0.06) * targetRbRate
    }))
  ];
  return chooseWeightedEntity(rng, entries);
}

function recordTeamTackle(deltaMap, rng, defenseContext) {
  const tackler = chooseFromRotation(rng, [
    ...defenseContext.lbRotation,
    ...defenseContext.dbRotation,
    ...defenseContext.dlRotation
  ]);
  if (!tackler) return null;
  const solo = rng.chance(0.62) ? 1 : 0;
  const ast = solo ? 0 : 1;
  addDelta(deltaMap, tackler.id, { defense: { tackles: 1, solo, ast } });
  return tackler;
}

function maybeRecordPassDefended(deltaMap, rng, defenseContext, chance = 0.62) {
  if (!rng.chance(chance)) return;
  const nickelRate = defenseContext.usageProfile?.sharesByPosition?.DB?.[4] || 0.4;
  const lbCoverageWeight = clamp(0.24 + (1 - nickelRate) * 0.22, 0.18, 0.38);
  const defender = chooseWeightedEntity(rng, [
    ...defenseContext.dbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 1.2 })),
    ...defenseContext.lbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * lbCoverageWeight }))
  ]);
  if (!defender) return;
  addDelta(deltaMap, defender.id, { defense: { passDefended: 1 } });
}

function simulateDrive(offenseContext, defenseContext, rng, mode) {
  const driveDeltas = new Map();
  const plays = mode === "play" ? rng.int(6, 10) : rng.int(3, 7);
  let driveYards = 0;
  let turnover = false;
  let turnoverType = null;
  let passPlays = 0;
  let rushPlays = 0;
  const playLog = [];
  let lastReceiver = null;
  let lastRunner = offenseContext.rb;

  const qb = offenseContext.qb;
  const qbAccuracy = mean([rating(qb, "throwAccuracy"), rating(qb, "awareness"), rating(qb, "playRecognition")]);
  const qbArm = mean([rating(qb, "throwPower"), rating(qb, "throwOnRun"), rating(qb, "discipline")]);
  const linePass = offenseContext.unitRatings?.passBlocking || 70;
  const lineRun = offenseContext.unitRatings?.runBlocking || 70;
  const passRush = defenseContext.unitRatings?.passRush || 70;
  const runDefense = defenseContext.unitRatings?.runDefense || 70;
  const coverage = defenseContext.unitRatings?.coverage || 70;
  const tackling = defenseContext.unitRatings?.tackling || 70;

  const addPlay = (entry) => {
    playLog.push({
      offenseTeamId: offenseContext.team.id,
      defenseTeamId: defenseContext.team.id,
      ...entry
    });
  };

  for (let i = 0; i < plays; i += 1) {
    if (turnover) break;
    const playType = rng.chance(offenseContext.passLean) ? "pass" : "run";
    if (playType === "pass") {
      passPlays += 1;
      const qbSpeed = rating(qb, "speed");
      const scrambleChance = clamp(0.055 + (qbSpeed - 70) / 520, 0.03, 0.12);
      if (rng.chance(scrambleChance)) {
        const scrambleYards = clamp(
          rng.int(-1, 12) + Math.round((qbSpeed - defenseContext.team.defenseRating) / 18),
          -2,
          18
        );
        driveYards += scrambleYards;
        addDelta(driveDeltas, offenseContext.qb.id, {
          rushing: { att: 1, yards: scrambleYards, firstDowns: scrambleYards >= 10 ? 1 : 0 }
        });
        if (scrambleYards > 0) addDelta(driveDeltas, offenseContext.qb.id, { rushing: { long: scrambleYards } });
        if (scrambleYards < 0) {
          const tackler = recordTeamTackle(driveDeltas, rng, defenseContext);
          if (tackler) addDelta(driveDeltas, tackler.id, { defense: { tfl: 1 } });
        } else {
          recordTeamTackle(driveDeltas, rng, defenseContext);
        }
        addPlay({
          type: "scramble",
          yards: scrambleYards,
          playerId: qb.id,
          player: qb.name,
          description: `${qb.name} scrambles for ${scrambleYards} yards`
        });
        continue;
      }
      const completionChance = clamp(
        0.47 +
          (qbAccuracy - 70) / 240 +
          (linePass - passRush) / 360 +
          (offenseContext.team.offenseRating - defenseContext.team.defenseRating) / 420 -
          (coverage - 70) / 340,
        0.38,
        0.79
      );
      addDelta(driveDeltas, qb.id, { passing: { att: 1 } });

      if (rng.chance(completionChance)) {
        const receiver = chooseReceiver(rng, offenseContext);
        const receiverSkill = mean([
          rating(receiver, "catching"),
          rating(receiver, "routeRunning"),
          rating(receiver, "release"),
          rating(receiver, "spectacularCatch")
        ]);
        const airYards = clamp(
          rng.int(0, 13) +
            Math.round((qbArm - 70) / 7) +
            Math.round((receiverSkill - 70) / 9) +
            Math.round((receiverSkill - coverage) / 16),
          0,
          32
        );
        const yac = clamp(
          rng.int(-1, 9) +
            Math.round((rating(receiver, "elusiveness", rating(receiver, "agility")) - tackling) / 10) +
            Math.round((rating(receiver, "speed") - 70) / 10),
          -1,
          24
        );
        const yards = Math.max(0, airYards + yac);
        const firstDown = yards >= 10 ? 1 : 0;
        driveYards += yards;
        addDelta(driveDeltas, qb.id, {
          passing: {
            cmp: 1,
            yards,
            firstDowns: firstDown,
            long: yards
          }
        });
        if (receiver) {
          lastReceiver = receiver;
          addDelta(driveDeltas, receiver.id, {
            receiving: { targets: 1, rec: 1, yards, yac, firstDowns: firstDown, long: yards }
          });
        }
        recordTeamTackle(driveDeltas, rng, defenseContext);
        addPlay({
          type: "pass",
          yards,
          playerId: qb.id,
          targetId: receiver?.id || null,
          player: qb.name,
          target: receiver?.name || "receiver",
          description: `${qb.name} to ${receiver?.name || "receiver"} for ${yards} yards`
        });
      } else {
        const sackChance = clamp(
          0.07 + (passRush - linePass) / 310 + (defenseContext.team.defenseRating - offenseContext.team.offenseRating) / 520,
          0.05,
          0.24
        );
        const intChance = clamp(
          0.018 + (coverage - qbAccuracy) / 360 + (defenseContext.team.defenseRating - qb.overall) / 640,
          0.01,
          0.07
        );
        if (rng.chance(intChance)) {
          turnover = true;
          turnoverType = "INT";
          const defender = chooseWeightedEntity(rng, [
            ...defenseContext.dbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 1.18 })),
            ...defenseContext.lbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 0.45 }))
          ]);
          addDelta(driveDeltas, qb.id, { passing: { int: 1 } });
          if (defender) {
            addDelta(driveDeltas, defender.id, { defense: { int: 1, passDefended: 1 } });
          }
          addPlay({
            type: "interception",
            yards: 0,
            playerId: qb.id,
            targetId: defender?.id || null,
            player: qb.name,
            target: defender?.name || "defense",
            description: `${qb.name} is intercepted by ${defender?.name || "the defense"}`
          });
        } else if (rng.chance(sackChance)) {
          const sackYards = rng.int(5, 11);
          driveYards -= sackYards;
          addDelta(driveDeltas, qb.id, { passing: { sacks: 1, sackYards } });
          const sacker = chooseWeightedEntity(rng, [
            ...defenseContext.dlRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 1.18 })),
            ...defenseContext.lbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 0.76 })),
            ...defenseContext.dbRotation.map((row) => ({ player: row.player, weight: row.usageWeight * 0.12 }))
          ]);
          if (sacker) addDelta(driveDeltas, sacker.id, { defense: { sacks: 1, tackles: 1, qbHits: 1, tfl: 1 } });
          const pressureLinemen = offenseContext.olRotation.slice(0, 5).map((row) => row.player);
          const beaten = choosePlayer(rng, pressureLinemen);
          if (beaten) addDelta(driveDeltas, beaten.id, { blocking: { sacksAllowed: 1, pressuresAllowed: 1 } });
          addPlay({
            type: "sack",
            yards: -sackYards,
            playerId: sacker?.id || null,
            player: sacker?.name || "Defense",
            description: `${sacker?.name || "Defense"} sacks ${qb.name} for ${sackYards} yards`
          });
        } else {
          const receiver = chooseReceiver(rng, offenseContext);
          if (receiver) {
            addDelta(driveDeltas, receiver.id, { receiving: { targets: 1 } });
            if (rng.chance(0.035)) addDelta(driveDeltas, receiver.id, { receiving: { drops: 1 } });
          }
          maybeRecordPassDefended(driveDeltas, rng, defenseContext);
          addPlay({
            type: "incomplete",
            yards: 0,
            playerId: qb.id,
            targetId: receiver?.id || null,
            player: qb.name,
            target: receiver?.name || "receiver",
            description: `${qb.name} incomplete to ${receiver?.name || "receiver"}`
          });
        }
      }
    } else {
      rushPlays += 1;
      const runner = chooseFromRotation(rng, offenseContext.rbRotation) || offenseContext.rb;
      lastRunner = runner;
      const runnerVision = mean([
        rating(runner, "speed"),
        rating(runner, "acceleration"),
        rating(runner, "elusiveness"),
        rating(runner, "breakTackle"),
        rating(runner, "trucking")
      ]);
      const yards = clamp(
        rng.int(-3, 8) +
          Math.round((runnerVision - 70) / 7) +
          Math.round((lineRun - runDefense) / 9) -
          Math.round((tackling - 70) / 18),
        -4,
        27
      );
      const brokenTackleChance = clamp(
        0.08 + (mean([rating(runner, "breakTackle"), rating(runner, "trucking"), rating(runner, "elusiveness")]) - tackling) / 260,
        0.04,
        0.42
      );
      const brokenTackles = yards > 2 && rng.chance(brokenTackleChance) ? 1 : 0;
      const firstDown = yards >= 10 ? 1 : 0;
      driveYards += yards;
      addDelta(driveDeltas, runner.id, {
        rushing: { att: 1, yards, firstDowns: firstDown, brokenTackles, long: yards }
      });
      const tackler = recordTeamTackle(driveDeltas, rng, defenseContext);
      if (yards < 0 && tackler) addDelta(driveDeltas, tackler.id, { defense: { tfl: 1 } });

      const fumbleChance = clamp(0.018 - (rating(runner, "carrying") - 70) / 520, 0.004, 0.028);
      if (rng.chance(fumbleChance)) {
        turnover = true;
        turnoverType = "FUMBLE";
        addDelta(driveDeltas, runner.id, { rushing: { fumbles: 1 } });
        const recoverer = chooseFromRotation(rng, [
          ...defenseContext.dlRotation,
          ...defenseContext.lbRotation,
          ...defenseContext.dbRotation
        ]);
        if (recoverer) addDelta(driveDeltas, recoverer.id, { defense: { ff: 1, fr: 1 } });
        addPlay({
          type: "fumble",
          yards,
          playerId: runner.id,
          targetId: recoverer?.id || null,
          player: runner.name,
          target: recoverer?.name || "defense",
          description: `${runner.name} runs for ${yards} yards and fumbles`
        });
      } else {
        addPlay({
          type: "run",
          yards,
          playerId: runner.id,
          player: runner.name,
          description: `${runner.name} rushes for ${yards} yards`
        });
      }
    }
  }

  driveYards = Math.max(-12, driveYards);
  const offensePower = offenseContext.team.offenseRating + driveYards * 0.15 + rng.int(-6, 6);
  const offenseCoachBoost = ((offenseContext.team.coaching?.offense || 72) - 72) * 0.12;
  const defenseCoachBoost = ((defenseContext.team.coaching?.defense || 72) - 72) * 0.12;
  const offenseMorale = clamp(
    offenseContext.roster.slice(0, 22).reduce((sum, p) => sum + (p.morale || 70), 0) / 22,
    45,
    98
  );
  const defenseMorale = clamp(
    defenseContext.roster.slice(0, 22).reduce((sum, p) => sum + (p.morale || 70), 0) / 22,
    45,
    98
  );
  const moraleOffset = (offenseMorale - defenseMorale) * 0.06;
  const fitOffset = ((offenseContext.schemeFit || 70) - (defenseContext.schemeFit || 70)) * 0.035;
  const chemistryOffset = ((offenseContext.chemistry || 70) - (defenseContext.chemistry || 70)) * 0.03;
  const defensePower = defenseContext.team.defenseRating + rng.int(-5, 5);
  const adjustedOffensePower = offensePower + offenseCoachBoost + moraleOffset + fitOffset + chemistryOffset;
  const adjustedDefensePower = defensePower + defenseCoachBoost;

  if (turnover) {
    return {
      outcome: DRIVE_OUTCOMES.TURNOVER,
      points: 0,
      yards: driveYards,
      turnover: true,
      turnoverType,
      seconds: rng.int(70, 185),
      deltas: driveDeltas,
      plays,
      passPlays,
      rushPlays,
      playLog,
      scoringEvent: null
    };
  }

  if (adjustedOffensePower > adjustedDefensePower + 12 || driveYards >= 66) {
    const passingTd = passPlays >= rushPlays ? rng.chance(offenseContext.passLean) : rng.chance(0.35);
    let description = "";
    if (passingTd) {
      const receiver = lastReceiver || chooseReceiver(rng, offenseContext);
      addDelta(driveDeltas, qb.id, { passing: { td: 1 } });
      if (receiver) addDelta(driveDeltas, receiver.id, { receiving: { td: 1 } });
      description = `${qb.name} finds ${receiver?.name || "a receiver"} for the touchdown`;
    } else {
      const runner = lastRunner || offenseContext.rb;
      addDelta(driveDeltas, runner.id, { rushing: { td: 1 } });
      description = `${runner.name} punches in the touchdown`;
    }
    addDelta(driveDeltas, offenseContext.k.id, { kicking: { xpa: 1 } });
    const xpGood = rng.chance(clamp(0.93 + (offenseContext.k.overall - 75) / 320, 0.86, 0.99));
    if (xpGood) addDelta(driveDeltas, offenseContext.k.id, { kicking: { xpm: 1 } });
    addPlay({
      type: "score",
      yards: 0,
      playerId: passingTd ? qb.id : (lastRunner || offenseContext.rb)?.id || null,
      player: passingTd ? qb.name : (lastRunner || offenseContext.rb)?.name || offenseContext.rb.name,
      description
    });
    return {
      outcome: DRIVE_OUTCOMES.TOUCHDOWN,
      points: xpGood ? 7 : 6,
      yards: driveYards,
      turnover: false,
      turnoverType: null,
      seconds: rng.int(95, 225),
      deltas: driveDeltas,
      plays,
      passPlays,
      rushPlays,
      playLog,
      scoringEvent: {
        teamId: offenseContext.team.id,
        type: "TD",
        points: xpGood ? 7 : 6,
        description: xpGood ? `${description} (XP good)` : `${description} (XP missed)`
      }
    };
  }

  if (adjustedOffensePower > adjustedDefensePower + 2 || driveYards >= 42) {
    const distance = clamp(22 + rng.int(0, 36), 18, 58);
    addDelta(driveDeltas, offenseContext.k.id, { kicking: { fga: 1 } });
    const fgGood = rng.chance(clamp(0.75 - Math.max(0, distance - 35) * 0.013 + (offenseContext.k.overall - 75) / 360, 0.3, 0.95));
    if (fgGood) {
      const short = distance < 40 ? 1 : 0;
      const deep = distance >= 50 ? 1 : 0;
      addDelta(driveDeltas, offenseContext.k.id, {
        kicking: { fgm: 1, long: distance, fgM40: short, fgA40: short, fgM50: deep, fgA50: deep }
      });
      addPlay({
        type: "field-goal",
        yards: 0,
        playerId: offenseContext.k.id,
        player: offenseContext.k.name,
        description: `${offenseContext.k.name} hits a ${distance}-yard field goal`
      });
      return {
        outcome: DRIVE_OUTCOMES.FIELD_GOAL,
        points: 3,
        yards: driveYards,
        turnover: false,
        turnoverType: null,
        seconds: rng.int(70, 180),
        deltas: driveDeltas,
        plays,
        passPlays,
        rushPlays,
        playLog,
        scoringEvent: {
          teamId: offenseContext.team.id,
          type: "FG",
          points: 3,
          description: `${offenseContext.k.name} makes a ${distance}-yard field goal`
        }
      };
    }
    const short = distance < 40 ? 1 : 0;
    const deep = distance >= 50 ? 1 : 0;
    addDelta(driveDeltas, offenseContext.k.id, { kicking: { fgA40: short, fgA50: deep } });
    addPlay({
      type: "missed-field-goal",
      yards: 0,
      playerId: offenseContext.k.id,
      player: offenseContext.k.name,
      description: `${offenseContext.k.name} misses from ${distance} yards`
    });
    return {
      outcome: DRIVE_OUTCOMES.TURNOVER,
      points: 0,
      yards: driveYards,
      turnover: true,
      turnoverType: "MISSED_FG",
      seconds: rng.int(70, 180),
      deltas: driveDeltas,
      plays,
      passPlays,
      rushPlays,
      playLog,
      scoringEvent: null
    };
  }

  const puntYards = rng.int(38, 53);
  addDelta(driveDeltas, offenseContext.p.id, { punting: { punts: 1, yards: puntYards } });
  if (rng.chance(0.37)) addDelta(driveDeltas, offenseContext.p.id, { punting: { in20: 1 } });
  if (rng.chance(0.08)) addDelta(driveDeltas, offenseContext.p.id, { punting: { touchbacks: 1 } });
  addPlay({
    type: "punt",
    yards: puntYards,
    playerId: offenseContext.p.id,
    player: offenseContext.p.name,
    description: `${offenseContext.p.name} punts ${puntYards} yards`
  });

  return {
    outcome: DRIVE_OUTCOMES.PUNT,
    points: 0,
    yards: driveYards,
    turnover: false,
    turnoverType: null,
    seconds: rng.int(65, 165),
    deltas: driveDeltas,
    plays,
    passPlays,
    rushPlays,
    playLog,
    scoringEvent: null
  };
}

function collectStarters(teamContext) {
  const dbStarterCount = (teamContext.usageProfile?.sharesByPosition?.DB || []).filter((share) => share >= 0.55).length;
  const lbStarterCount = Math.max(
    2,
    (teamContext.usageProfile?.sharesByPosition?.LB || []).filter((share) => share >= 0.52).length
  );
  const wrStarterCount = Math.max(
    2,
    (teamContext.usageProfile?.sharesByPosition?.WR || []).filter((share) => share >= 0.58).length
  );
  return [
    ...(teamContext.qbRotation.slice(0, 1).map((row) => row.player)),
    ...(teamContext.olRotation.slice(0, 5).map((row) => row.player)),
    ...(teamContext.rbRotation.slice(0, 1).map((row) => row.player)),
    ...(teamContext.wrRotation.slice(0, wrStarterCount).map((row) => row.player)),
    ...(teamContext.teRotation.slice(0, 1).map((row) => row.player)),
    ...(teamContext.dlRotation.slice(0, 4).map((row) => row.player)),
    ...(teamContext.lbRotation.slice(0, lbStarterCount).map((row) => row.player)),
    ...(teamContext.dbRotation.slice(0, Math.max(4, dbStarterCount)).map((row) => row.player)),
    teamContext.k,
    teamContext.p
  ].filter(Boolean);
}

function applyDriveDeltas(statBook, year, deltaMap, seasonType = "regular") {
  for (const [playerId, delta] of deltaMap.entries()) {
    const player = statBook.getPlayerById(playerId);
    statBook.applyStatDelta(
      playerId,
      year,
      delta,
      player ? { teamId: player.teamId, position: player.position, seasonType } : { seasonType }
    );
  }
}

function buildGameId({ year, week = 0, seasonType = "regular", homeTeamId, awayTeamId, label = "game" }) {
  return `${year}-${seasonType}-${label}-${week}-${awayTeamId}-${homeTeamId}`;
}

function resolveClock(elapsedSeconds) {
  if (elapsedSeconds < 3600) {
    const quarter = Math.min(4, Math.floor(elapsedSeconds / 900) + 1);
    const quarterElapsed = elapsedSeconds % 900;
    const remaining = Math.max(0, 900 - quarterElapsed);
    return {
      quarter,
      clock: `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
      label: `Q${quarter}`
    };
  }
  const overtimeElapsed = elapsedSeconds - 3600;
  const remaining = Math.max(0, 600 - overtimeElapsed);
  return {
    quarter: 5,
    clock: `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
    label: "OT"
  };
}

function stampDriveLog(playLog, elapsedStart, driveSeconds) {
  if (!playLog?.length) return [];
  return playLog.map((entry, index) => {
    const elapsedAtPlay = elapsedStart + Math.round(((index + 1) / (playLog.length + 1)) * driveSeconds);
    const clock = resolveClock(elapsedAtPlay);
    return {
      ...entry,
      quarter: clock.quarter,
      quarterLabel: clock.label,
      clock: clock.clock
    };
  });
}

function collectGamePlayerStats(playerGameStats, statBook, deltaMap) {
  for (const [playerId, delta] of deltaMap.entries()) {
    const player = statBook.getPlayerById(playerId);
    if (!player) continue;
    if (!playerGameStats.has(playerId)) {
      playerGameStats.set(playerId, {
        playerId,
        player: player.name,
        teamId: player.teamId,
        pos: player.position,
        stats: createZeroedSeasonStats()
      });
    }
    mergeStats(playerGameStats.get(playerId).stats, delta);
  }
}

function teamGameSummary(teamId, score, totalYards, turnovers, passPlays, rushPlays, playerEntries) {
  const teamPlayers = playerEntries.filter((entry) => entry.teamId === teamId);
  const passingYards = teamPlayers.reduce((sum, entry) => sum + (entry.stats.passing?.yards || 0), 0);
  const rushingYards = teamPlayers.reduce((sum, entry) => sum + (entry.stats.rushing?.yards || 0), 0);
  const firstDowns = teamPlayers.reduce(
    (sum, entry) => sum + (entry.stats.passing?.firstDowns || 0) + (entry.stats.rushing?.firstDowns || 0),
    0
  );
  return {
    teamId,
    score,
    totalYards,
    passingYards,
    rushingYards,
    firstDowns,
    turnovers,
    passPlays,
    rushPlays,
    thirdDowns: Math.max(1, Math.round((passPlays + rushPlays) * 0.23)),
    thirdDownConversions: Math.max(0, Math.round(firstDowns * 0.38))
  };
}

function buildPlayerStatGroups(entries) {
  return {
    passing: entries
      .filter((entry) => (entry.stats.passing?.att || 0) > 0)
      .map((entry) => ({
        playerId: entry.playerId,
        player: entry.player,
        pos: entry.pos,
        cmp: entry.stats.passing.cmp,
        att: entry.stats.passing.att,
        yds: entry.stats.passing.yards,
        td: entry.stats.passing.td,
        int: entry.stats.passing.int,
        sacks: entry.stats.passing.sacks
      }))
      .sort((a, b) => b.yds - a.yds || b.att - a.att),
    rushing: entries
      .filter((entry) => (entry.stats.rushing?.att || 0) > 0)
      .map((entry) => ({
        playerId: entry.playerId,
        player: entry.player,
        pos: entry.pos,
        att: entry.stats.rushing.att,
        yds: entry.stats.rushing.yards,
        td: entry.stats.rushing.td,
        ypa: Number((entry.stats.rushing.yards / Math.max(1, entry.stats.rushing.att)).toFixed(1)),
        lng: entry.stats.rushing.long
      }))
      .sort((a, b) => b.yds - a.yds || b.att - a.att),
    receiving: entries
      .filter((entry) => (entry.stats.receiving?.targets || 0) > 0)
      .map((entry) => ({
        playerId: entry.playerId,
        player: entry.player,
        pos: entry.pos,
        tgt: entry.stats.receiving.targets,
        rec: entry.stats.receiving.rec,
        yds: entry.stats.receiving.yards,
        td: entry.stats.receiving.td,
        ypr: Number((entry.stats.receiving.yards / Math.max(1, entry.stats.receiving.rec)).toFixed(1))
      }))
      .sort((a, b) => b.yds - a.yds || b.rec - a.rec),
    defense: entries
      .filter(
        (entry) =>
          (entry.stats.defense?.tackles || 0) > 0 ||
          (entry.stats.defense?.sacks || 0) > 0 ||
          (entry.stats.defense?.int || 0) > 0
      )
      .map((entry) => ({
        playerId: entry.playerId,
        player: entry.player,
        pos: entry.pos,
        tkl: entry.stats.defense.tackles,
        sacks: entry.stats.defense.sacks,
        int: entry.stats.defense.int,
        pd: entry.stats.defense.passDefended
      }))
      .sort((a, b) => b.tkl - a.tkl || b.sacks - a.sacks),
    kicking: entries
      .filter((entry) => (entry.stats.kicking?.fga || 0) + (entry.stats.kicking?.xpa || 0) > 0)
      .map((entry) => ({
        playerId: entry.playerId,
        player: entry.player,
        pos: entry.pos,
        fgm: entry.stats.kicking.fgm,
        fga: entry.stats.kicking.fga,
        xpm: entry.stats.kicking.xpm,
        xpa: entry.stats.kicking.xpa
      }))
  };
}

export function simulateGame({
  league,
  statBook,
  homeTeamId,
  awayTeamId,
  year,
  week = 0,
  rng,
  mode = "drive",
  allowTie = true,
  seasonType = "regular",
  label = "game"
}) {
  const homeContext = buildTeamContext(league, homeTeamId, rng);
  const awayContext = buildTeamContext(league, awayTeamId, rng);
  const homeTeam = homeContext.team;
  const awayTeam = awayContext.team;
  const gameId = buildGameId({ year, week, seasonType, homeTeamId, awayTeamId, label });

  const homeStarters = collectStarters(homeContext);
  const awayStarters = collectStarters(awayContext);
  const starterIds = new Set([...homeStarters, ...awayStarters].map((player) => player.id));
  const playerGameStats = new Map();
  const scoringSummary = [];
  const playByPlay = [];
  const homeByQuarter = [0, 0, 0, 0, 0];
  const awayByQuarter = [0, 0, 0, 0, 0];
  let elapsedSeconds = 0;

  for (const player of homeStarters) statBook.registerGameAppearance(player.id, year, true, homeTeamId, player.position, seasonType);
  for (const player of awayStarters) statBook.registerGameAppearance(player.id, year, true, awayTeamId, player.position, seasonType);

  const homePossessions = rng.int(...NFL_STRUCTURE.possessionsPerTeamRange);
  const awayPossessions = rng.int(...NFL_STRUCTURE.possessionsPerTeamRange);
  let homeScore = 0;
  let awayScore = 0;
  let homeYards = 0;
  let awayYards = 0;
  let homeTurnovers = 0;
  let awayTurnovers = 0;
  let homeDrives = 0;
  let awayDrives = 0;
  let homeOffSnaps = 0;
  let awayOffSnaps = 0;
  let homePassPlays = 0;
  let awayPassPlays = 0;
  let homeRushPlays = 0;
  let awayRushPlays = 0;
  let homeKOps = 0;
  let awayKOps = 0;
  let homePOps = 0;
  let awayPOps = 0;
  const snappedPlayerIds = new Set();
  let homeBall = rng.chance(0.5);

  const finalizeDrive = (drive, offenseTeamId) => {
    collectGamePlayerStats(playerGameStats, statBook, drive.deltas);
    const stampedLog = stampDriveLog(drive.playLog || [], elapsedSeconds, drive.seconds || 0);
    playByPlay.push(...stampedLog);
    elapsedSeconds += drive.seconds || 0;
    if (drive.scoringEvent) {
      const clock = resolveClock(Math.max(0, elapsedSeconds - 1));
      const summary = {
        teamId: offenseTeamId,
        quarter: clock.quarter,
        quarterLabel: clock.label,
        clock: clock.clock,
        type: drive.scoringEvent.type,
        points: drive.scoringEvent.points,
        description: drive.scoringEvent.description
      };
      if (offenseTeamId === homeTeamId) {
        homeByQuarter[Math.min(homeByQuarter.length - 1, clock.quarter - 1)] += drive.points;
      } else {
        awayByQuarter[Math.min(awayByQuarter.length - 1, clock.quarter - 1)] += drive.points;
      }
      scoringSummary.push(summary);
    }
  };

  while (homeDrives < homePossessions || awayDrives < awayPossessions) {
    if (homeBall && homeDrives < homePossessions) {
      const drive = simulateDrive(homeContext, awayContext, rng, mode);
      homeDrives += 1;
      homeScore += drive.points;
      homeYards += drive.yards;
      if (drive.turnover) homeTurnovers += 1;
      homeOffSnaps += drive.plays || 0;
      homePassPlays += drive.passPlays || 0;
      homeRushPlays += drive.rushPlays || 0;
      if (drive.outcome === DRIVE_OUTCOMES.PUNT) homePOps += 1;
      if (drive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || drive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) homeKOps += 1;
      applyDriveDeltas(statBook, year, drive.deltas, seasonType);
      finalizeDrive(drive, homeTeamId);
      homeBall = false;
      continue;
    }
    if (!homeBall && awayDrives < awayPossessions) {
      const drive = simulateDrive(awayContext, homeContext, rng, mode);
      awayDrives += 1;
      awayScore += drive.points;
      awayYards += drive.yards;
      if (drive.turnover) awayTurnovers += 1;
      awayOffSnaps += drive.plays || 0;
      awayPassPlays += drive.passPlays || 0;
      awayRushPlays += drive.rushPlays || 0;
      if (drive.outcome === DRIVE_OUTCOMES.PUNT) awayPOps += 1;
      if (drive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || drive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) awayKOps += 1;
      applyDriveDeltas(statBook, year, drive.deltas, seasonType);
      finalizeDrive(drive, awayTeamId);
      homeBall = true;
      continue;
    }
    if (homeDrives >= homePossessions) homeBall = false;
    if (awayDrives >= awayPossessions) homeBall = true;
  }

  if (homeScore === awayScore) {
    let overtimeRounds = 0;
    while (homeScore === awayScore && overtimeRounds < (allowTie ? 1 : 10)) {
      const firstHome = rng.chance(0.5);
      const firstDrive = firstHome
        ? simulateDrive(homeContext, awayContext, rng, mode)
        : simulateDrive(awayContext, homeContext, rng, mode);
      applyDriveDeltas(statBook, year, firstDrive.deltas, seasonType);
      finalizeDrive(firstDrive, firstHome ? homeTeamId : awayTeamId);
      if (firstHome) {
        homeScore += firstDrive.points;
        homeYards += firstDrive.yards;
        if (firstDrive.turnover) homeTurnovers += 1;
        homeOffSnaps += firstDrive.plays || 0;
        homePassPlays += firstDrive.passPlays || 0;
        homeRushPlays += firstDrive.rushPlays || 0;
        if (firstDrive.outcome === DRIVE_OUTCOMES.PUNT) homePOps += 1;
        if (firstDrive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || firstDrive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) homeKOps += 1;
      } else {
        awayScore += firstDrive.points;
        awayYards += firstDrive.yards;
        if (firstDrive.turnover) awayTurnovers += 1;
        awayOffSnaps += firstDrive.plays || 0;
        awayPassPlays += firstDrive.passPlays || 0;
        awayRushPlays += firstDrive.rushPlays || 0;
        if (firstDrive.outcome === DRIVE_OUTCOMES.PUNT) awayPOps += 1;
        if (firstDrive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || firstDrive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) awayKOps += 1;
      }

      const secondDrive = firstHome
        ? simulateDrive(awayContext, homeContext, rng, mode)
        : simulateDrive(homeContext, awayContext, rng, mode);
      applyDriveDeltas(statBook, year, secondDrive.deltas, seasonType);
      finalizeDrive(secondDrive, firstHome ? awayTeamId : homeTeamId);
      if (firstHome) {
        awayScore += secondDrive.points;
        awayYards += secondDrive.yards;
        if (secondDrive.turnover) awayTurnovers += 1;
        awayOffSnaps += secondDrive.plays || 0;
        awayPassPlays += secondDrive.passPlays || 0;
        awayRushPlays += secondDrive.rushPlays || 0;
        if (secondDrive.outcome === DRIVE_OUTCOMES.PUNT) awayPOps += 1;
        if (secondDrive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || secondDrive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) awayKOps += 1;
      } else {
        homeScore += secondDrive.points;
        homeYards += secondDrive.yards;
        if (secondDrive.turnover) homeTurnovers += 1;
        homeOffSnaps += secondDrive.plays || 0;
        homePassPlays += secondDrive.passPlays || 0;
        homeRushPlays += secondDrive.rushPlays || 0;
        if (secondDrive.outcome === DRIVE_OUTCOMES.PUNT) homePOps += 1;
        if (secondDrive.outcome === DRIVE_OUTCOMES.FIELD_GOAL || secondDrive.outcome === DRIVE_OUTCOMES.TOUCHDOWN) homeKOps += 1;
      }
      overtimeRounds += 1;
      if (allowTie && overtimeRounds >= 1) break;
    }
  }

  const trackSnaps = (set) => {
    for (const playerId of set) snappedPlayerIds.add(playerId);
  };
  trackSnaps(applySnapCounts(statBook, year, homeContext.qbRotation, homeOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.rbRotation, homeOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.wrRotation, homeOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.teRotation, homeOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.olRotation, homeOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.qbRotation, awayOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.rbRotation, awayOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.wrRotation, awayOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.teRotation, awayOffSnaps, "offense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.olRotation, awayOffSnaps, "offense", seasonType));

  trackSnaps(applySnapCounts(statBook, year, homeContext.dlRotation, awayOffSnaps, "defense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.lbRotation, awayOffSnaps, "defense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.dbRotation, awayOffSnaps, "defense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.dlRotation, homeOffSnaps, "defense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.lbRotation, homeOffSnaps, "defense", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.dbRotation, homeOffSnaps, "defense", seasonType));

  const homeSpecialSnaps = homeKOps + homePOps + awayKOps;
  const awaySpecialSnaps = awayKOps + awayPOps + homeKOps;
  trackSnaps(applySnapCounts(statBook, year, homeContext.kRotation, homeSpecialSnaps, "special", seasonType));
  trackSnaps(applySnapCounts(statBook, year, homeContext.pRotation, homeSpecialSnaps, "special", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.kRotation, awaySpecialSnaps, "special", seasonType));
  trackSnaps(applySnapCounts(statBook, year, awayContext.pRotation, awaySpecialSnaps, "special", seasonType));
  applyBlockingNoise(statBook, year, homeContext.olRotation, homeOffSnaps, rng, seasonType);
  applyBlockingNoise(statBook, year, awayContext.olRotation, awayOffSnaps, rng, seasonType);

  for (const playerId of snappedPlayerIds) {
    if (starterIds.has(playerId)) continue;
    const player = statBook.getPlayerById(playerId);
    if (!player) continue;
    statBook.registerGameAppearance(playerId, year, false, player.teamId, player.position, seasonType);
  }

  const playerEntries = [...playerGameStats.values()];
  const boxScore = {
    gameId,
    year,
    week,
    seasonType,
    label,
    homeTeam: teamGameSummary(homeTeamId, homeScore, homeYards, homeTurnovers, homePassPlays, homeRushPlays, playerEntries),
    awayTeam: teamGameSummary(awayTeamId, awayScore, awayYards, awayTurnovers, awayPassPlays, awayRushPlays, playerEntries),
    quarterScores: {
      home: homeByQuarter,
      away: awayByQuarter
    },
    scoringSummary,
    playByPlay,
    playerStats: {
      home: buildPlayerStatGroups(playerEntries.filter((entry) => entry.teamId === homeTeamId)),
      away: buildPlayerStatGroups(playerEntries.filter((entry) => entry.teamId === awayTeamId))
    }
  };

  return {
    gameId,
    year,
    week,
    seasonType,
    label,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    homeYards,
    awayYards,
    homePassPlays,
    homeRushPlays,
    awayPassPlays,
    awayRushPlays,
    homeOffSnaps,
    awayOffSnaps,
    homeTurnovers,
    awayTurnovers,
    isTie: homeScore === awayScore,
    winnerId: homeScore === awayScore ? null : homeScore > awayScore ? homeTeamId : awayTeamId,
    boxScore
  };
}
