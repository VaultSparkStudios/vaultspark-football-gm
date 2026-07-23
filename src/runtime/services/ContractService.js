/**
 * ContractService — Domain Service Extraction Target
 *
 * GameSession still owns production contract mutations today. This service is bound on every GameSession instance and acts as the parity target for the incremental extraction; do not claim full delegation until callers move.
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

import { NFL_STRUCTURE } from "../../config.js";
import {
  applyFifthYearOption,
  applyFranchiseTag,
  computeReleaseDeadCap,
  normalizeContract,
  restructureContract
} from "../../domain/contracts.js";
import { getAllTeamPlayers } from "../../domain/teamFactory.js";

export class ContractService {
  constructor(sessionOrLeague) {
    this.session = sessionOrLeague?.league ? sessionOrLeague : null;
    this.league = sessionOrLeague?.league || sessionOrLeague;
  }

  // ── Cap accounting ─────────────────────────────────────────────────────────

  getCapSummary(teamId) {
    const capLedger = this.league.capLedger?.[teamId] || {
      rollover: 0,
      deadCapCurrentYear: 0,
      deadCapNextYear: 0
    };
    const usedCap = getAllTeamPlayers(this.league, teamId).reduce(
      (sum, player) => sum + normalizeContract(player.contract).capHit,
      0
    );
    const salaryCapBase = this.league.teamCapOverride?.[teamId] || NFL_STRUCTURE.salaryCap;
    const salaryCap = salaryCapBase + (capLedger.rollover || 0);
    const deadCap = capLedger.deadCapCurrentYear || 0;
    return {
      salaryCap,
      usedCap,
      deadCap,
      capSpace: salaryCap - usedCap - deadCap,
      deadCapNextYear: capLedger.deadCapNextYear || 0,
      rolloverNextYearEstimate: capLedger.rollover || 0
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
