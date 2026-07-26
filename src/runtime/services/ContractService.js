/**
 * ContractService — Exact Delegated Cap Authority
 *
 * This class exposes only the production method GameSession delegates today.
 * Contract mutations remain GameSession authorities until a characterization
 * test proves response and mutation parity and the manifest is updated atomically.
 */

import { NFL_STRUCTURE } from "../../config.js";
import { normalizeContract } from "../../domain/contracts.js";
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

}
