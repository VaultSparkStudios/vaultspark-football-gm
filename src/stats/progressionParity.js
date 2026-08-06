const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

export const LEAGUE_PROGRESSION_PARITY_TARGET = Object.freeze({
  version: "2026-s73-rooms",
  metric: "active-player mean overall annual drift",
  onTargetMaxAbs: 0.15,
  watchMaxAbs: 0.3,
  roomOnTargetMaxAbs: 0.35,
  roomWatchMaxAbs: 0.6,
  minimumRoomSample: 20
});

export const POSITION_ROOMS = Object.freeze([
  Object.freeze({ room: "Quarterback", positions: Object.freeze(["QB"]) }),
  Object.freeze({ room: "Backfield", positions: Object.freeze(["RB"]) }),
  Object.freeze({ room: "Receivers", positions: Object.freeze(["WR", "TE"]) }),
  Object.freeze({ room: "Offensive Line", positions: Object.freeze(["OL"]) }),
  Object.freeze({ room: "Front Seven", positions: Object.freeze(["DL", "LB"]) }),
  Object.freeze({ room: "Secondary", positions: Object.freeze(["DB"]) }),
  Object.freeze({ room: "Specialists", positions: Object.freeze(["K", "P"]) })
]);

function expectedDevelopment(player, developmentProfile) {
  const age = Number(player?.age || 0);
  const ageFactor = age <= 25
    ? developmentProfile.ageFactors.developing25AndUnder
    : age <= 29
      ? developmentProfile.ageFactors.prime26To29
      : developmentProfile.ageFactors.veteran30Plus;
  return Number(ageFactor) + (Number(player?.potential || developmentProfile.potentialCenter) - developmentProfile.potentialCenter) / 20;
}

export function buildRosterWindowMap(roster = [], developmentProfile) {
  if (!developmentProfile?.ageFactors) throw new TypeError("A declared development profile is required.");
  const groups = POSITION_ROOMS.map(({ room, positions }) => {
    const players = roster.filter((player) => positions.includes(player.pos || player.position));
    const average = (selector) => players.length ? players.reduce((sum, player) => sum + selector(player), 0) / players.length : 0;
    const projectedDelta = round(average((player) => expectedDevelopment(player, developmentProfile)), 2);
    const expiring = players.filter((player) => Number(player.contract?.yearsRemaining || 0) <= 1).length;
    const window = projectedDelta >= 0.25 ? "ascending" : projectedDelta <= -0.5 ? "aging" : "balanced";
    const priority = window === "aging"
      ? expiring ? "Succession + contract decision" : "Draft a successor"
      : window === "ascending"
        ? "Protect the runway"
        : expiring >= 2
          ? "Contract decisions"
          : "Stable room";
    const standardBearer = players.slice().sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0))[0] || null;
    return {
      room,
      positions: positions.join("/"),
      count: players.length,
      meanOverall: round(average((player) => Number(player.overall || 0)), 1),
      meanPotential: round(average((player) => Number(player.potential || 0)), 1),
      meanAge: round(average((player) => Number(player.age || 0)), 1),
      projectedDelta,
      window,
      expiring,
      developing: players.filter((player) => Number(player.age) <= 25).length,
      prime: players.filter((player) => Number(player.age) >= 26 && Number(player.age) <= 29).length,
      veteran: players.filter((player) => Number(player.age) >= 30).length,
      standardBearer: standardBearer ? `${standardBearer.name} (${standardBearer.overall})` : "—",
      priority
    };
  }).filter((group) => group.count > 0);
  return {
    profileVersion: developmentProfile.version,
    generatedFromPlayers: roster.length,
    groups,
    agingRooms: groups.filter((group) => group.window === "aging").map((group) => group.room),
    ascendingRooms: groups.filter((group) => group.window === "ascending").map((group) => group.room)
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cohort(players, predicate) {
  const rows = players.filter(predicate);
  return {
    count: rows.length,
    sharePct: players.length ? round((rows.length / players.length) * 100, 1) : 0,
    meanOverall: rows.length ? round(rows.reduce((sum, player) => sum + Number(player.overall), 0) / rows.length) : 0
  };
}

function summarizePlayers(players) {
  const overalls = players.map((player) => Number(player.overall));
  return {
    count: players.length,
    meanOverall: overalls.length ? round(overalls.reduce((sum, value) => sum + value, 0) / overalls.length) : 0,
    medianOverall: round(median(overalls)),
    elite90Plus: overalls.filter((value) => value >= 90).length,
    elite90PlusPct: overalls.length ? round((overalls.filter((value) => value >= 90).length / overalls.length) * 100, 1) : 0
  };
}

export function summarizeLeagueProgression(league) {
  const players = (league?.players || []).filter(
    (player) => player?.status !== "retired" && Number.isFinite(Number(player?.overall)) && Number.isFinite(Number(player?.age))
  );
  const summary = summarizePlayers(players);
  return {
    playerCount: summary.count,
    meanOverall: summary.meanOverall,
    medianOverall: summary.medianOverall,
    elite90Plus: summary.elite90Plus,
    elite90PlusPct: summary.elite90PlusPct,
    meanAge: players.length ? round(players.reduce((sum, player) => sum + Number(player.age), 0) / players.length) : 0,
    rooms: POSITION_ROOMS.map(({ room, positions }) => ({
      room,
      positions: positions.join("/"),
      ...summarizePlayers(players.filter((player) => positions.includes(player.pos || player.position)))
    })),
    cohorts: {
      developing25AndUnder: cohort(players, (player) => Number(player.age) <= 25),
      prime26To29: cohort(players, (player) => Number(player.age) >= 26 && Number(player.age) <= 29),
      veteran30Plus: cohort(players, (player) => Number(player.age) >= 30)
    }
  };
}

function classifyDrift(absoluteDrift, onTargetMaxAbs, watchMaxAbs) {
  return absoluteDrift <= onTargetMaxAbs
    ? "on-target"
    : absoluteDrift <= watchMaxAbs
      ? "watch"
      : "out-of-range";
}

export function buildProgressionParityReceipt({ start, end, seasons, seed, developmentProfile }) {
  const observedSeasons = Math.max(1, Number(seasons) || 1);
  const annualMeanOverallDrift = round((Number(end?.meanOverall || 0) - Number(start?.meanOverall || 0)) / observedSeasons, 3);
  const globalStatus = classifyDrift(
    Math.abs(annualMeanOverallDrift),
    LEAGUE_PROGRESSION_PARITY_TARGET.onTargetMaxAbs,
    LEAGUE_PROGRESSION_PARITY_TARGET.watchMaxAbs
  );
  const startRooms = new Map((start?.rooms || []).map((room) => [room.room, room]));
  const endRooms = new Map((end?.rooms || []).map((room) => [room.room, room]));
  const rooms = POSITION_ROOMS.map(({ room, positions }) => {
    const startRoom = startRooms.get(room) || null;
    const endRoom = endRooms.get(room) || null;
    const minimumSample = LEAGUE_PROGRESSION_PARITY_TARGET.minimumRoomSample;
    const adequateSample = Number(startRoom?.count || 0) >= minimumSample && Number(endRoom?.count || 0) >= minimumSample;
    const annualRoomDrift = adequateSample
      ? round((Number(endRoom.meanOverall) - Number(startRoom.meanOverall)) / observedSeasons, 3)
      : null;
    return {
      room,
      positions: positions.join("/"),
      status: adequateSample
        ? classifyDrift(
            Math.abs(annualRoomDrift),
            LEAGUE_PROGRESSION_PARITY_TARGET.roomOnTargetMaxAbs,
            LEAGUE_PROGRESSION_PARITY_TARGET.roomWatchMaxAbs
          )
        : "incomplete",
      adequateSample,
      minimumSample,
      annualMeanOverallDrift: annualRoomDrift,
      annualMedianOverallDrift: adequateSample
        ? round((Number(endRoom.medianOverall) - Number(startRoom.medianOverall)) / observedSeasons, 3)
        : null,
      elite90PlusChange: adequateSample ? Number(endRoom.elite90Plus) - Number(startRoom.elite90Plus) : null,
      start: startRoom,
      end: endRoom
    };
  });
  const roomStatuses = rooms.map((room) => room.status);
  const status = roomStatuses.includes("out-of-range") || globalStatus === "out-of-range"
    ? "out-of-range"
    : roomStatuses.includes("incomplete")
      ? "incomplete"
      : roomStatuses.includes("watch") || globalStatus === "watch"
        ? "watch"
        : "on-target";
  return {
    status,
    globalStatus,
    observedSeasons,
    seed: Number(seed),
    annualMeanOverallDrift,
    target: LEAGUE_PROGRESSION_PARITY_TARGET,
    developmentProfile,
    start,
    end,
    rooms,
    roomSummary: {
      onTarget: roomStatuses.filter((value) => value === "on-target").length,
      watch: roomStatuses.filter((value) => value === "watch").length,
      outOfRange: roomStatuses.filter((value) => value === "out-of-range").length,
      incomplete: roomStatuses.filter((value) => value === "incomplete").length
    },
    roomAlerts: rooms
      .filter((room) => room.status !== "on-target")
      .map((room) => ({ room: room.room, status: room.status, annualMeanOverallDrift: room.annualMeanOverallDrift }))
  };
}
export function appendProgressionHistory(history = [], progression, generatedAt = Date.now()) {
  if (!progression || !Number.isFinite(Number(progression.seed))) {
    throw new TypeError("A progression receipt with a finite seed is required.");
  }
  const entry = {
    generatedAt: Number(generatedAt),
    seed: Number(progression.seed),
    observedSeasons: Number(progression.observedSeasons),
    status: progression.status,
    globalStatus: progression.globalStatus,
    annualMeanOverallDrift: progression.annualMeanOverallDrift,
    rooms: (progression.rooms || []).map((room) => ({
      room: room.room,
      status: room.status,
      annualMeanOverallDrift: room.annualMeanOverallDrift
    }))
  };
  return [...(Array.isArray(history) ? history : []), entry].slice(-5);
}
/**
 * Scan numeric simulation state without laundering NaN/Infinity into zero.
 * Traversal is bounded and cycle-safe; a truncated scan is never called a pass.
 */
export function scanFiniteSimulationState({ league, statBook }, { maxNodes = 4_000_000, maxIssues = 12 } = {}) {
  const issues = [];
  const seen = new WeakSet();
  let inspectedNodes = 0;
  let inspectedNumbers = 0;
  let truncated = false;

  const visit = (value, path) => {
    if (truncated || issues.length >= maxIssues) return;
    inspectedNodes += 1;
    if (inspectedNodes > maxNodes) {
      truncated = true;
      return;
    }
    if (typeof value === "number") {
      inspectedNumbers += 1;
      if (!Number.isFinite(value)) issues.push({ path, kind: Number.isNaN(value) ? "NaN" : "Infinity" });
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, `${path}.${key}`);
  };

  const criticalLeagueState = {
    players: league?.players,
    retiredPlayers: league?.retiredPlayers,
    teams: league?.teams,
    schedule: league?.schedule,
    champions: league?.champions,
    awards: league?.awards,
    hallOfFame: league?.hallOfFame,
    draftHistory: league?.draftHistory
  };
  visit(criticalLeagueState, "league");
  visit(
    {
      teamSeasonArchive: statBook?.teamSeasonArchive,
      warehouse: statBook?.warehouse
    },
    "statBook"
  );

  return {
    status: issues.length ? "fail" : truncated ? "incomplete" : "pass",
    scannedRoots: [
      "league.players",
      "league.retiredPlayers",
      "league.teams",
      "league.schedule",
      "league.champions",
      "league.awards",
      "league.hallOfFame",
      "league.draftHistory",
      "statBook.teamSeasonArchive",
      "statBook.warehouse"
    ],
    inspectedNodes,
    inspectedNumbers,
    truncated,
    issueCount: issues.length,
    issues
  };
}
