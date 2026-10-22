/**
 * ContractService — Exact Delegated Cap Authority
 *
 * This class exposes only the production method GameSession delegates today.
 * Contract mutations remain GameSession authorities until a characterization
 * test proves response and mutation parity and the manifest is updated atomically.
 */

import { getSportRules } from "../../sport/registry.js";
import { normalizeContract } from "../../domain/contracts.js";
import { getAllTeamPlayers } from "../../domain/teamFactory.js";
import { projectCapCarryover } from '../../domain/capCarryover.js';
import { retainedRosterCompensationCap } from '../../domain/earnedPracticeCap.js';
import { financialYearForLeague } from '../../data/nflSalaryCap.js';

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
      retainedRosterCompensationCap(capLedger)
    );
    const salaryCapBase = this.league.teamCapOverride?.[teamId] || getSportRules(this.league.sportId).structure.salaryCap;
    const salaryCap = salaryCapBase + (capLedger.rollover || 0);
    const deadCap = capLedger.deadCapCurrentYear || 0;
    const capSpace = salaryCap - usedCap - deadCap;
    const carryover = projectCapCarryover(this.league, capSpace);
    return {
      salaryCap,
      usedCap,
      deadCap,
      capSpace,
      deadCapNextYear: capLedger.deadCapNextYear || 0,
      rolloverCurrentYear: capLedger.rollover || 0,
      rolloverNextYearEstimate: carryover.amount,
      rolloverPolicy: carryover.policy,
      capProvenance: this.league.capModel ? {
        ...this.league.capModel,
        year: financialYearForLeague(this.league),
        kind: financialYearForLeague(this.league) > this.league.capModel.baseYear ? "simulation-projection" : this.league.capModel.kind
      } : null
    };
  }

}
