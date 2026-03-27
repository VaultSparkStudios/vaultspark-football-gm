/**
 * DraftService — Domain Service Scaffold
 *
 * Owns draft-day execution and pick-asset management currently in GameSession.js.
 *
 * Responsibilities:
 *   - Pick asset ledger (team picks, traded picks, future picks)
 *   - Draft order resolution (reverse standings, compensatory picks)
 *   - Pick submission and validation
 *   - CPU auto-pick logic
 *   - Draft class management
 */

import { clamp } from "../../utils/rng.js";

export class DraftService {
  constructor(league) {
    this.league = league;
  }

  // ── Pick asset ledger ───────────────────────────────────────────────────────

  getPicksForTeam(teamId, year) {
    const picks = this.league.draftPicks || [];
    return picks.filter((p) => p.ownerTeamId === teamId && (!year || p.year === year));
  }

  transferPick(pickId, fromTeamId, toTeamId) {
    const picks = this.league.draftPicks || [];
    const pick = picks.find((p) => p.id === pickId && p.ownerTeamId === fromTeamId);
    if (!pick) return { ok: false, error: "Pick not found or not owned by specified team." };
    pick.ownerTeamId = toTeamId;
    pick.tradedFrom = fromTeamId;
    return { ok: true, pick };
  }

  // ── Draft order ─────────────────────────────────────────────────────────────

  buildDraftOrder(year) {
    // Sort teams by reverse standings: worst record picks first
    const standings = [...this.league.teams].sort((a, b) => {
      const winsA = a.season?.wins || 0;
      const winsB = b.season?.wins || 0;
      const pctA = winsA / Math.max(1, winsA + (a.season?.losses || 0));
      const pctB = winsB / Math.max(1, winsB + (b.season?.losses || 0));
      if (pctA !== pctB) return pctA - pctB; // lower win pct picks first
      // Tiebreak: points differential
      const pfA = a.season?.pointsFor || 0;
      const pfB = b.season?.pointsFor || 0;
      return pfA - pfB;
    });

    const rounds = this.league.settings?.draftRounds || 7;
    const picks = [];
    let overallPick = 1;

    for (let round = 1; round <= rounds; round++) {
      for (let slotIdx = 0; slotIdx < standings.length; slotIdx++) {
        const team = standings[slotIdx];
        // Check if this pick was traded
        const existingPick = (this.league.draftPicks || []).find(
          (p) => p.year === year && p.round === round && p.originalTeamId === team.id
        );
        const ownerTeamId = existingPick?.ownerTeamId || team.id;

        picks.push({
          id: existingPick?.id || `pick-${year}-${round}-${slotIdx + 1}`,
          year,
          round,
          roundPick: slotIdx + 1,
          overall: overallPick++,
          originalTeamId: team.id,
          ownerTeamId
        });
      }
    }

    this.league.draftOrder = picks;
    return picks;
  }

  // ── Pick submission ─────────────────────────────────────────────────────────

  submitPick(teamId, prospectId, pickId) {
    const draftOrder = this.league.draftOrder || [];
    const currentPick = draftOrder.find((p) => !p.selectedPlayerId);
    if (!currentPick) return { ok: false, error: "No picks remaining." };
    if (currentPick.ownerTeamId !== teamId) {
      return { ok: false, error: `It is ${currentPick.ownerTeamId}'s pick, not ${teamId}'s.` };
    }

    const draftClass = this.league.draftClass || [];
    const prospect = draftClass.find((p) => p.id === prospectId);
    if (!prospect) return { ok: false, error: "Prospect not in draft class." };
    if (prospect.teamId !== "FA") return { ok: false, error: "Prospect already selected." };

    // Assign to team
    prospect.teamId = teamId;
    prospect.rosterSlot = "active";
    prospect.contract = {
      salary: this._rookieSalaryForPick(currentPick.overall),
      yearsRemaining: 4,
      capHit: this._rookieSalaryForPick(currentPick.overall),
      baseSalary: this._rookieSalaryForPick(currentPick.overall),
      signingBonus: 0,
      guaranteed: this._rookieSalaryForPick(currentPick.overall),
      deadCapRemaining: 0,
      restructureCount: 0
    };

    currentPick.selectedPlayerId = prospectId;
    currentPick.selectedPlayerName = prospect.name;
    currentPick.selectedPosition = prospect.position;

    return { ok: true, pick: currentPick, prospect };
  }

  // ── CPU auto-pick ────────────────────────────────────────────────────────────

  autoPick(teamId) {
    const draftClass = this.league.draftClass || [];
    const available = draftClass.filter((p) => p.teamId === "FA");
    if (!available.length) return { ok: false, error: "No available prospects." };

    // Simple best-available by potential, with slight position-need weighting
    const team = this.league.teams.find((t) => t.id === teamId);
    const teamPlayers = this.league.players.filter((p) => p.teamId === teamId);
    const positionCounts = {};
    for (const p of teamPlayers) positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;

    const scored = available.map((prospect) => {
      const need = 1 / Math.max(1, positionCounts[prospect.position] || 0);
      return { prospect, score: (prospect.potential || 70) + need * 5 };
    });
    scored.sort((a, b) => b.score - a.score);

    return this.submitPick(teamId, scored[0].prospect.id, null);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _rookieSalaryForPick(overall) {
    if (overall <= 10) return 9_500_000;
    if (overall <= 32) return 5_000_000;
    if (overall <= 64) return 2_500_000;
    if (overall <= 100) return 1_500_000;
    return 900_000;
  }
}
