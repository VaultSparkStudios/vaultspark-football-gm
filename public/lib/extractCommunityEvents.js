import { band, normalizeCommunityEvent } from "./communityEventContract.js";

function token(value, fallback = null) {
  if (value == null || value === "") return fallback;
  return String(value);
}

function id(factory) {
  return factory?.() || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function event(type, dimensions, metrics, context) {
  return normalizeCommunityEvent({
    schemaVersion: "1.0",
    eventId: id(context.idFactory),
    type,
    occurredAt: context.now?.() || new Date().toISOString(),
    dimensions: { runtime: context.runtime, ...dimensions },
    metrics,
    evidenceTier: context.runtime === "server" ? "server-runtime" : "browser-receipt"
  }, { now: Date.parse(context.now?.() || new Date().toISOString()) });
}

function contractBand(years, salary) {
  const annual = Number(salary || 0) / Math.max(1, Number(years || 1));
  if (annual >= 30_000_000) return "elite";
  if (annual >= 15_000_000) return "starter";
  if (annual >= 5_000_000) return "rotation";
  return "value";
}

function rosterDelta(body = {}) {
  const aPlayers = body.teamAPlayers || body.playersA || body.playerIdsA || [];
  const bPlayers = body.teamBPlayers || body.playersB || body.playerIdsB || [];
  const aPicks = body.teamAPicks || body.picksA || [];
  const bPicks = body.teamBPicks || body.picksB || [];
  return {
    playersSent: Array.isArray(aPlayers) ? aPlayers.length : 0,
    playersReceived: Array.isArray(bPlayers) ? bPlayers.length : 0,
    picksSent: Array.isArray(aPicks) ? aPicks.length : 0,
    picksReceived: Array.isArray(bPicks) ? bPicks.length : 0
  };
}

function controlledRecord(state = {}) {
  const teamId = state.controlledTeamId;
  const row = (state.latestStandings || []).find((entry) => entry.team === teamId || entry.teamId === teamId) || {};
  return { wins: Number(row.wins ?? row.w ?? 0), losses: Number(row.losses ?? row.l ?? 0), ties: Number(row.ties ?? row.t ?? 0) };
}

export function extractCommunityEvents({ method = "GET", path = "", body = {}, response = {}, runtime = "client", idFactory, now } = {}) {
  if (String(method).toUpperCase() !== "POST" || response?.ok === false) return [];
  const route = String(path).split("?")[0].replace(/\/+$/, "");
  const context = { runtime, idFactory, now };
  const state = response.state || {};
  const rows = [];

  if (route === "/api/new-league") {
    rows.push(event("league_started", {
      mode: token(body.mode, "drive"), team: token(body.controlledTeamId || state.controlledTeamId, "random"),
      era: token(body.eraProfile || state.settings?.eraProfile, "balanced"),
      archetype: token(body.franchiseArchetype || state.settings?.franchiseArchetype, "balanced"),
      rules: token(body.rulesPreset || state.settings?.rulesPreset, "standard"),
      difficulty: token(body.difficultyPreset || state.settings?.difficultyPreset, "standard"),
      challenge: token(body.challengeMode || state.settings?.challengeMode, "none")
    }, {
      ownerMode: body.enableOwnerMode ? 1 : 0,
      narratives: body.enableNarratives === false ? 0 : 1,
      compPicks: body.enableCompPicks === false ? 0 : 1,
      chemistry: body.enableChemistry === false ? 0 : 1
    }, context));
  }

  if (route === "/api/advance-week") {
    const receipt = response.commandReceipt || {};
    const before = response.architectEntry?.teamBefore || {};
    const after = response.architectEntry?.teamAfter || controlledRecord(state);
    const seasonsCompleted = Math.max(0, Number(receipt.completed?.year || 0) - Number(receipt.started?.year || 0));
    const champions = (state.champions || []).filter((entry) => Number(entry.year) >= Number(receipt.started?.year || Infinity) && (entry.championTeamId || entry.teamId) === state.controlledTeamId).length;
    const playoffBerths = seasonsCompleted > 0 && Number(before.wins || 0) >= 9 ? 1 : 0;
    rows.push(event("weeks_managed", {
      phase: token(receipt.started?.phase || state.phase, "unknown"),
      tactic: token(receipt.tactic, "none"),
      difficulty: token(state.settings?.difficultyPreset, "unknown"),
      decision: receipt.gmDecisionApplied ? token(body.gmDecisionChoice?.choiceId, "applied") : "none"
    }, {
      weeks: Number(receipt.count || response.count || body.count || 1),
      wins: Math.max(0, Number(after.wins || 0) - Number(before.wins || 0)),
      losses: Math.max(0, Number(after.losses || 0) - Number(before.losses || 0)),
      ties: Math.max(0, Number(after.ties || 0) - Number(before.ties || 0)),
      seasonsCompleted,
      playoffBerths,
      championships: champions
    }, context));
    if (champions > 0) rows.push(event("rare_feat", { feat: "championship" }, { count: champions }, context));
    if (seasonsCompleted > 0 && Number(after.losses || 0) === 0) rows.push(event("rare_feat", { feat: "undefeated-season" }, { count: 1 }, context));
  }

  if (route === "/api/trade") {
    const movement = rosterDelta(body);
    rows.push(event("trade_completed", {
      counterparty: token(body.teamB, "unknown"),
      balance: movement.playersSent + movement.picksSent === movement.playersReceived + movement.picksReceived ? "even-assets" : "asymmetric"
    }, movement, context));
  }

  if (route === "/api/draft/user-pick") {
    const pick = response.selection || response.pick || response.result || {};
    const player = pick.player || pick;
    rows.push(event("draft_pick", {
      position: token(player.position || player.pos, "unknown"),
      round: token(pick.round || state.draft?.round, "unknown"),
      verdict: token(pick.verdict?.grade || pick.grade, "ungraded")
    }, {
      pickNumber: Number(pick.overallPick || pick.pick || state.draft?.overallPick || 1),
      overallBand: band(player.overall, 10, 10),
      potentialBand: band(player.potential, 10, 10)
    }, context));
  }

  if (route === "/api/sign" || route === "/api/free-agency/offer") {
    const result = response.result || response;
    if (route === "/api/sign" || result.signed === true || result.status === "accepted") {
      const player = result.player || {};
      const years = Number(body.years || result.contract?.years || 1);
      const salary = Number(body.salary || result.contract?.salary || result.contract?.annualSalary || 0);
      rows.push(event("free_agent_signed", {
        position: token(player.position || player.pos, "unknown"), contractBand: contractBand(years, salary)
      }, { years, annualValueBand: band(salary / Math.max(1, years), 2_500_000, 20) }, context));
    }
  }

  const contractAction = {
    "/api/contracts/resign": "re-sign", "/api/contracts/negotiate": "negotiate", "/api/contracts/restructure": "restructure",
    "/api/contracts/franchise-tag": "franchise-tag", "/api/contracts/fifth-year-option": "fifth-year-option"
  }[route];
  if (contractAction) {
    const result = response.result || response;
    const years = Number(body.years || result.contract?.years || 1);
    const salary = Number(body.salary || result.contract?.salary || result.contract?.annualSalary || 0);
    rows.push(event("contract_completed", {
      action: contractAction, position: token(result.player?.position || result.player?.pos, "unknown"), contractBand: contractBand(years, salary)
    }, { years, annualValueBand: band(salary / Math.max(1, years), 2_500_000, 20) }, context));
  }

  if (route === "/api/coaching-market" && body.action) {
    rows.push(event("staff_changed", { role: token(body.role, "unknown"), action: token(body.action, "unknown") }, {}, context));
  }

  if (route === "/api/settings") {
    rows.push(event("settings_changed", {
      difficulty: token(body.difficultyPreset || response.settings?.difficultyPreset, "unchanged"),
      adaptive: body.adaptiveDifficulty === true ? "on" : body.adaptiveDifficulty === false ? "off" : "unchanged",
      era: token(body.eraProfile, "unchanged"), mode: token(body.mode, "unchanged")
    }, {}, context));
  }

  if (route === "/api/speedrun/submit") {
    const entry = response.entry || {};
    rows.push(event("challenge_completed", {
      challenge: token(entry.challengeId || entry.challenge || "speedrun"), resultBand: token(entry.tier || response.rank, "complete")
    }, { weeks: Number(entry.weeks || entry.completedWeeks || 0), score: Number(entry.score || 0) }, context));
  }

  return rows.filter(Boolean);
}
