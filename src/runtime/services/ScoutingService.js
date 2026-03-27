/**
 * ScoutingService — Domain Service Scaffold
 *
 * Owns all scouting and draft-board logic currently in GameSession.js.
 *
 * Responsibilities:
 *   - Weekly scouting point allocation and spending
 *   - Draft board management (lock, rank, reveal quality)
 *   - Prospect scouting confidence calculation
 *   - Scheme-fit evaluation for board targets
 *   - Board state serialization for save/load
 */

import { clamp } from "../../utils/rng.js";

export class ScoutingService {
  constructor(league) {
    this.league = league;
  }

  // ── Weekly point allocation ─────────────────────────────────────────────────

  getWeeklyPoints(teamId) {
    const team = this._team(teamId);
    if (!team) return 0;
    const base = 5;
    const directorBonus = Math.floor((team.staff?.scoutingDirector?.development || 50) / 10);
    const analyticsBonus = Math.floor((team.worldState?.owner?.facilities?.analytics || 50) / 20);
    return base + directorBonus + analyticsBonus;
  }

  spendPoints(teamId, points) {
    const team = this._team(teamId);
    if (!team) return { ok: false, error: "Team not found." };
    if (!team.scouting) team.scouting = { pointsAvailable: 0, pointsSpentTotal: 0, board: [] };
    const available = team.scouting.pointsAvailable || 0;
    const toSpend = Math.min(points, available);
    team.scouting.pointsAvailable = available - toSpend;
    team.scouting.pointsSpentTotal = (team.scouting.pointsSpentTotal || 0) + toSpend;
    return { ok: true, spent: toSpend, remaining: team.scouting.pointsAvailable };
  }

  addWeeklyPoints(teamId) {
    const team = this._team(teamId);
    if (!team) return;
    if (!team.scouting) team.scouting = { pointsAvailable: 0, pointsSpentTotal: 0, board: [] };
    const earned = this.getWeeklyPoints(teamId);
    team.scouting.pointsAvailable = (team.scouting.pointsAvailable || 0) + earned;
  }

  // ── Board management ────────────────────────────────────────────────────────

  getBoardForTeam(teamId) {
    const team = this._team(teamId);
    if (!team?.scouting?.board) return [];
    return team.scouting.board;
  }

  lockProspect(teamId, prospectId) {
    const board = this.getBoardForTeam(teamId);
    const entry = board.find((e) => e.prospectId === prospectId);
    if (!entry) return { ok: false, error: "Prospect not on board." };
    entry.locked = true;
    return { ok: true };
  }

  setProspectRank(teamId, prospectId, rank) {
    const board = this.getBoardForTeam(teamId);
    const entry = board.find((e) => e.prospectId === prospectId);
    if (!entry) {
      const team = this._team(teamId);
      if (team?.scouting) {
        team.scouting.board = team.scouting.board || [];
        team.scouting.board.push({ prospectId, rank, locked: false, confidence: 50 });
      }
      return { ok: true };
    }
    entry.rank = rank;
    return { ok: true };
  }

  // ── Scouting confidence ─────────────────────────────────────────────────────

  getProspectConfidence(teamId, prospectId) {
    const team = this._team(teamId);
    if (!team?.scouting?.board) return 50;
    const entry = team.scouting.board.find((e) => e.prospectId === prospectId);
    if (!entry) return 50;

    const pointsSpent = entry.pointsInvested || 0;
    const directorSkill = team.staff?.scoutingDirector?.development || 50;
    const analyticsSupport = team.worldState?.owner?.facilities?.analytics || 50;

    const baseConf = clamp(Math.round(30 + pointsSpent * 4 + directorSkill * 0.3 + analyticsSupport * 0.1), 30, 99);
    return baseConf;
  }

  // ── Scheme fit evaluation ───────────────────────────────────────────────────

  evaluateSchemeFit(teamId, player) {
    const team = this._team(teamId);
    if (!team?.scheme) return { fit: "unknown", score: 65 };

    const offenseScheme = team.scheme.offense || "balanced";
    const defenseScheme = team.scheme.defense || "multiple";

    let score = 65;
    const position = player.position;
    const archetype = player.archetype || "Balanced";

    // Offense scheme fit
    if (offenseScheme === "air-raid") {
      if (position === "QB" && archetype === "FieldGeneral") score += 15;
      if (position === "WR" && (archetype === "RouteRunner" || archetype === "DeepThreat")) score += 12;
      if (position === "TE" && archetype === "Vertical") score += 8;
    }
    if (offenseScheme === "ground-control") {
      if (position === "RB" && archetype === "Power") score += 14;
      if (position === "OL" && archetype === "PowerRun") score += 12;
      if (position === "TE" && archetype === "Blocking") score += 10;
    }
    if (offenseScheme === "vertical-spread") {
      if (position === "WR" && archetype === "DeepThreat") score += 16;
      if (position === "QB" && archetype === "Scrambler") score += 10;
    }

    // Defense scheme fit
    if (defenseScheme === "pressure-front") {
      if (position === "DL" && archetype === "PassRush") score += 14;
      if (position === "LB" && archetype === "Edge") score += 12;
    }
    if (defenseScheme === "contain-shell") {
      if (position === "DB" && archetype === "Zone") score += 12;
      if (position === "LB" && archetype === "Mike") score += 10;
    }

    const clamped = clamp(score, 40, 99);
    const fit = clamped >= 80 ? "high" : clamped >= 65 ? "medium" : "low";
    return { fit, score: clamped };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _team(teamId) { return this.league.teams.find((t) => t.id === teamId) || null; }
}
