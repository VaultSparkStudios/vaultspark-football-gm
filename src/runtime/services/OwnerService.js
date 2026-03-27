/**
 * OwnerService — Domain Service Scaffold
 *
 * Owns owner, culture, and world-state logic currently in GameSession.js.
 *
 * Responsibilities:
 *   - Owner hot-seat pressure calculation
 *   - Culture profile derivation
 *   - Morale swing application
 *   - Facilities effect calculation
 *   - Owner mandate expectation tracking
 */

import { clamp } from "../../utils/rng.js";

const CULTURE_IDENTITIES = ["disciplined", "developmental", "urgent", "confident", "balanced"];

export class OwnerService {
  constructor(league) {
    this.league = league;
  }

  // ── Hot-seat pressure ───────────────────────────────────────────────────────

  calculateHotSeat(teamId, week) {
    const team = this._team(teamId);
    if (!team) return 0;

    const owner = team.worldState?.owner || team.owner || {};
    const patience = clamp(owner.patience || 0.5, 0.2, 0.9);
    const mandate = owner.mandate || {};
    const targetWins = mandate.targetWins || 9;
    const currentWins = team.season?.wins || 0;
    const currentLosses = team.season?.losses || 0;
    const gamesPlayed = currentWins + currentLosses;

    if (gamesPlayed < 4) return 0;

    // Project season wins based on current pace
    const pace = gamesPlayed > 0 ? (currentWins / gamesPlayed) * 17 : 8;
    const deficitVsTarget = targetWins - pace;

    // Base pressure from deficit
    let pressure = 0;
    if (deficitVsTarget >= 5) pressure = 90;
    else if (deficitVsTarget >= 3) pressure = 65;
    else if (deficitVsTarget >= 1) pressure = 40;
    else if (deficitVsTarget <= -3) pressure = 5; // over-achieving
    else pressure = 20;

    // Patience modifier: low patience → amplify pressure
    pressure *= 1 + (0.5 - patience) * 1.2;

    // Week modifier: pressure ramps in second half of season
    if (week > 12) pressure *= 1.2;
    else if (week > 8) pressure *= 1.1;

    return clamp(Math.round(pressure), 0, 100);
  }

  updateHotSeat(teamId, week) {
    const team = this._team(teamId);
    if (!team) return 0;
    const hotSeat = this.calculateHotSeat(teamId, week);
    if (!team.worldState) team.worldState = {};
    if (!team.worldState.owner) team.worldState.owner = {};
    team.worldState.owner.hotSeat = hotSeat;
    return hotSeat;
  }

  // ── Culture profile ─────────────────────────────────────────────────────────

  deriveCultureProfile(teamId) {
    const team = this._team(teamId);
    if (!team) return { identity: "balanced", chemistry: 60, avgMorale: 60 };

    const players = this.league.players.filter((p) => p.teamId === teamId && p.status === "active");
    const avgMorale = players.length
      ? Math.round(players.reduce((s, p) => s + (p.morale || 60), 0) / players.length)
      : 60;

    const avgAge = players.length
      ? Math.round(players.reduce((s, p) => s + (p.age || 25), 0) / players.length)
      : 25;

    const chemistry = clamp(
      Math.round(avgMorale * 0.6 + (100 - avgAge * 1.5) * 0.2 + (team.worldState?.owner?.patience || 0.5) * 30 * 0.2),
      10, 99
    );

    const ownerPatience = team.worldState?.owner?.patience || 0.5;
    const hotSeat = team.worldState?.owner?.hotSeat || 0;

    let identity;
    if (chemistry >= 75 && ownerPatience >= 0.7) identity = "disciplined";
    else if (avgAge <= 25 && chemistry >= 60) identity = "developmental";
    else if (hotSeat >= 70 || ownerPatience <= 0.35) identity = "urgent";
    else if (chemistry >= 70 && team.season?.wins >= 9) identity = "confident";
    else identity = "balanced";

    return { identity, chemistry, avgMorale, avgAge };
  }

  updateCultureProfile(teamId) {
    const team = this._team(teamId);
    if (!team) return;
    const profile = this.deriveCultureProfile(teamId);
    if (!team.worldState) team.worldState = {};
    team.worldState.culture = profile;
    return profile;
  }

  // ── Morale swings ───────────────────────────────────────────────────────────

  applyMoraleSwing(teamId, delta) {
    const team = this._team(teamId);
    if (!team) return;
    const players = this.league.players.filter((p) => p.teamId === teamId && p.status === "active");
    const culture = team.worldState?.culture?.identity || "balanced";

    const amplifier = culture === "urgent" ? 1.4 : culture === "disciplined" ? 0.7 : 1.0;
    const adjustedDelta = Math.round(delta * amplifier);

    for (const player of players) {
      player.morale = clamp((player.morale || 65) + adjustedDelta, 10, 99);
    }
  }

  // ── Facilities effects ──────────────────────────────────────────────────────

  getFacilitiesModifiers(teamId) {
    const team = this._team(teamId);
    if (!team?.worldState?.owner?.facilities) return { injuryDelta: 0, developmentBonus: 0, scoutingBonus: 0 };

    const f = team.worldState.owner.facilities;
    const medicalQuality = (f.rehab || 50) / 100;
    const trainingQuality = (f.training || 50) / 100;
    const analyticsQuality = (f.analytics || 50) / 100;

    return {
      injuryDelta: (medicalQuality - 0.5) * -0.02,        // better medical → lower injury chance
      developmentBonus: Math.round((trainingQuality - 0.5) * 6), // better training → +dev
      scoutingBonus: Math.round((analyticsQuality - 0.5) * 8)    // better analytics → +scout points
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _team(teamId) { return this.league.teams.find((t) => t.id === teamId) || null; }
}
