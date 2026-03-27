/**
 * ContractService — Domain Service Scaffold
 *
 * Owns all contract lifecycle logic currently spread across GameSession.js.
 * Migration path: extract GameSession contract methods here, then delegate
 * from GameSession → ContractService to maintain API compatibility.
 *
 * Responsibilities:
 *   - Cap accounting (capUsed, deadCap, capRemaining per team)
 *   - Contract CRUD (sign, release, restructure, tag, option)
 *   - Validation (roster limits, cap compliance, challenge flags)
 *   - Expiry and rollover at season end
 *
 * GameSession currently owns: signFreeAgent, releasePlayer, restructureContract,
 *   applyFranchiseTag, applyFifthYearOption, rollContracts, capSummary
 */

import {
  applyFifthYearOption,
  applyFranchiseTag,
  buildContract,
  computeReleaseDeadCap,
  normalizeContract,
  restructureContract
} from "../../domain/contracts.js";
import { clamp } from "../../utils/rng.js";

export class ContractService {
  constructor(league) {
    this.league = league;
  }

  // ── Cap accounting ─────────────────────────────────────────────────────────

  getCapSummary(teamId) {
    const team = this._team(teamId);
    if (!team) return null;
    const players = this._teamPlayers(teamId);
    const capUsed = players
      .filter((p) => p.rosterSlot === "active" || !p.rosterSlot)
      .reduce((s, p) => s + (p.contract?.capHit || 0), 0);
    const deadCap = team.deadCap || 0;
    const capLimit = this.league.settings?.capHardLimit || 224_800_000;
    return {
      teamId,
      capUsed,
      deadCap,
      capLimit,
      capRemaining: capLimit - capUsed - deadCap,
      percentUsed: capLimit > 0 ? Math.round(((capUsed + deadCap) / capLimit) * 100) : 0
    };
  }

  // ── Release ────────────────────────────────────────────────────────────────

  releasePlayer(playerId) {
    const player = this._player(playerId);
    if (!player) return { ok: false, error: "Player not found." };

    const deadCap = computeReleaseDeadCap(player.contract);
    const team = this._team(player.teamId);
    if (team) team.deadCap = (team.deadCap || 0) + deadCap;

    player.teamId = "FA";
    player.rosterSlot = "free-agent";
    player.contract = normalizeContract({ ...player.contract, yearsRemaining: 0 });

    return { ok: true, deadCapAdded: deadCap };
  }

  // ── Restructure ────────────────────────────────────────────────────────────

  restructurePlayerContract(playerId) {
    const player = this._player(playerId);
    if (!player) return { ok: false, error: "Player not found." };
    if (!player.contract?.yearsRemaining) return { ok: false, error: "No active contract." };
    if ((player.contract.restructureCount || 0) >= 2) {
      return { ok: false, error: "Contract already restructured maximum times." };
    }
    const result = restructureContract(player.contract);
    player.contract = result.contract;
    return { ok: true, newContract: result.contract, capSavings: result.capSavings };
  }

  // ── Franchise tag ──────────────────────────────────────────────────────────

  applyTag(playerId, year) {
    const player = this._player(playerId);
    if (!player) return { ok: false, error: "Player not found." };
    const result = applyFranchiseTag(player.contract, player.overall, year);
    player.contract = result;
    return { ok: true, contract: result };
  }

  // ── Fifth-year option ──────────────────────────────────────────────────────

  applyOption(playerId) {
    const player = this._player(playerId);
    if (!player) return { ok: false, error: "Player not found." };
    const result = applyFifthYearOption(player.contract, player.overall);
    player.contract = result;
    return { ok: true, contract: result };
  }

  // ── Rollover (season end) ──────────────────────────────────────────────────

  rollContracts() {
    const expired = [];
    for (const player of this.league.players) {
      if (!player.contract) continue;
      player.contract.yearsRemaining = Math.max(0, (player.contract.yearsRemaining || 0) - 1);
      if (player.contract.yearsRemaining === 0) {
        expired.push(player.id);
        player.teamId = "FA";
        player.rosterSlot = "free-agent";
      }
    }
    return expired;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _team(teamId) { return this.league.teams.find((t) => t.id === teamId) || null; }
  _player(playerId) { return this.league.players.find((p) => p.id === playerId) || null; }
  _teamPlayers(teamId) { return this.league.players.filter((p) => p.teamId === teamId); }
}
