/**
 * coachingMarket.js — hiring a coach becomes a choice between people (S63).
 *
 * The Coaching Staff panel was the last raw dev tool left in a game that had
 * otherwise become a serious franchise sim: a team dropdown, a role dropdown, and
 * number inputs for `playcalling`, `development` and `discipline` posted straight
 * to `POST /api/staff`, clamped 40–99 and applied to the simulation. The GM typed
 * `99` into three boxes, for free, for any team. Those numbers are live inputs —
 * staff quality and staff budget feed development, discipline and on-field
 * coaching — so the panel was not cosmetic. It was a god-mode surface shipped to
 * players.
 *
 * Meanwhile `coachingTree.js` already modelled the coaching-career world the
 * hiring surface bypassed entirely: coordinators with lineage, promotions,
 * mentors, and a carousel that moves coaches between teams every offseason.
 *
 * This module replaces the number boxes with a market of named people.
 *
 * ── Why the market is derived rather than rolled ────────────────────────────
 *
 * Candidates are computed from a deterministic hash of (league identity, year,
 * team, role) plus live league state — never from a mutable RNG stream. A market
 * that rerolled on every fetch would be its own cheat: refresh until a 95-rated
 * coordinator appears. Derived candidates are stable across reloads, saves, and
 * both adapters, and they cost nothing to store.
 *
 * ── Why salary needs no save migration ──────────────────────────────────────
 *
 * Existing saves have staff with ratings but no salary. Rather than migrate, a
 * staffer's salary is a pure function of their ratings, so every coach in every
 * existing franchise already has a well-defined, consistent price. That is what
 * finally makes `owner.staffBudget` bind: you cannot hire a coach your budget
 * does not cover, and the budget was already a live simulation input.
 */

const ROLE_LABELS = Object.freeze({
  headCoach: "Head Coach",
  offensiveCoordinator: "Offensive Coordinator",
  defensiveCoordinator: "Defensive Coordinator",
  scoutingDirector: "Scouting Director",
  capAnalyst: "Cap Analyst",
  strengthCoach: "Strength Coach",
  medicalDirector: "Medical Director"
});

export const MARKET_ROLE_KEYS = Object.freeze(Object.keys(ROLE_LABELS));

/** Salary weight per role — a head coach costs far more than a cap analyst. */
const ROLE_SALARY_WEIGHT = Object.freeze({
  headCoach: 1,
  offensiveCoordinator: 0.44,
  defensiveCoordinator: 0.44,
  scoutingDirector: 0.2,
  capAnalyst: 0.16,
  strengthCoach: 0.14,
  medicalDirector: 0.16
});

const CANDIDATES_PER_ROLE = 4;
const MIN_SALARY = 400_000;
const RECEIPT_LIMIT = 20;

const FIRST_NAMES = Object.freeze([
  "Marcus", "Dean", "Curtis", "Elias", "Roman", "Vince", "Terrence", "Gus",
  "Hollis", "Rashad", "Emmett", "Sterling", "Dominic", "Wes", "Cyrus", "Bo",
  "Alvin", "Nate", "Corey", "Franklin", "Isaiah", "Duke", "Simon", "Reggie"
]);
const LAST_NAMES = Object.freeze([
  "Braddock", "Whitfield", "Okonkwo", "Salazar", "Devane", "Kowalski", "Prieto",
  "Hargrove", "Nakamura", "Ellery", "Vaccaro", "Mbeki", "Lindqvist", "Ferraro",
  "Boone", "Ashford", "Delgado", "Ruiz", "Castellanos", "Turnbull", "Amari",
  "Steadman", "Vogel", "Pruitt"
]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** FNV-1a — the same deterministic hash the press room uses for quote keys. */
function hash(key) {
  let value = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    value ^= key.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** A stable stream of derived numbers from one seed key. */
function derivedInt(key, index, min, max) {
  const span = Math.max(1, max - min + 1);
  return min + (hash(`${key}#${index}`) % span);
}

/**
 * What a staffer is worth, from their ratings alone.
 *
 * Pure and total, so every coach in every existing save has a price without a
 * migration. Quality is superlinear: the gap between an 88 and a 94 coordinator
 * costs far more than the gap between a 62 and a 68.
 */
export function coachSalary(staffer, role = "headCoach") {
  const quality =
    (Number(staffer?.playcalling) || 70) * 0.45 +
    (Number(staffer?.development) || 70) * 0.33 +
    (Number(staffer?.discipline) || 70) * 0.22;
  const normalized = clamp((quality - 40) / 59, 0, 1);
  const weight = ROLE_SALARY_WEIGHT[role] ?? 0.3;
  const base = 1_200_000 + Math.pow(normalized, 2.1) * 13_500_000;
  return Math.max(MIN_SALARY, Math.round((base * weight) / 50_000) * 50_000);
}

/** Total committed staff salary for a team, derived from its current staff. */
export function staffPayroll(team) {
  if (!team?.staff) return 0;
  return MARKET_ROLE_KEYS.reduce(
    (sum, role) => sum + (team.staff[role] ? coachSalary(team.staff[role], role) : 0),
    0
  );
}

/**
 * Budget headroom after paying the current staff.
 * Negative headroom means the franchise is already over its staff budget.
 */
export function staffBudgetSummary(team) {
  const budget = Number(team?.owner?.staffBudget) || 0;
  const payroll = staffPayroll(team);
  return {
    budget,
    payroll,
    headroom: budget - payroll,
    overBudget: payroll > budget
  };
}

/**
 * Firing a coach costs the remainder of their deal, discounted.
 * A coach with one year left is cheap to move on from; a fresh five-year hire
 * is not — which is what makes a hire a commitment rather than a menu pick.
 */
export function firingCost(staffer, role = "headCoach") {
  const years = clamp(Number(staffer?.yearsRemaining) || 1, 1, 7);
  return Math.round((coachSalary(staffer, role) * years * 0.55) / 50_000) * 50_000;
}

function leagueSeed(league, teamId, role) {
  const year = league?.currentYear ?? 0;
  const identity = league?.leagueId || league?.franchiseId || `y${league?.year ?? year}`;
  return `coach-market|${identity}|${year}|${teamId}|${role}`;
}

function candidateName(seed, index) {
  const first = FIRST_NAMES[derivedInt(seed, index * 3 + 1, 0, FIRST_NAMES.length - 1)];
  const last = LAST_NAMES[derivedInt(seed, index * 3 + 2, 0, LAST_NAMES.length - 1)];
  return `${first} ${last}`;
}

/**
 * Coordinators elsewhere in the league who are plausible head-coach hires.
 * These are real people already in the world, so poaching one is visible.
 */
function promotionCandidates(league, teamId, role) {
  if (role !== "headCoach") return [];
  const rows = [];
  for (const team of league?.teams || []) {
    if (team.id === teamId) continue;
    for (const source of ["offensiveCoordinator", "defensiveCoordinator"]) {
      const staffer = team.staff?.[source];
      if (!staffer) continue;
      const quality = (staffer.playcalling || 70) * 0.5 + (staffer.development || 70) * 0.5;
      if (quality < 78) continue;
      rows.push({
        origin: "coordinator",
        currentTeamId: team.id,
        sourceRole: source,
        name: staffer.name || `${team.id} ${ROLE_LABELS[source]}`,
        // A coordinator stepping up is a bet: play-calling carries, but running a
        // building is a different job, so leadership discipline regresses.
        playcalling: clamp(Math.round((staffer.playcalling || 70) + 1), 40, 99),
        development: clamp(Math.round(staffer.development || 70), 40, 99),
        discipline: clamp(Math.round((staffer.discipline || 70) - 3), 40, 99),
        note: `${ROLE_LABELS[source]} at ${team.id} — ready for a building of his own.`
      });
    }
  }
  return rows
    .sort((a, b) => b.playcalling + b.development - (a.playcalling + a.development))
    .slice(0, 2);
}

function externalCandidates(league, teamId, role, count) {
  const seed = leagueSeed(league, teamId, role);
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const centre = derivedInt(seed, index * 7, 58, 88);
    rows.push({
      origin: "external",
      currentTeamId: null,
      sourceRole: null,
      name: candidateName(seed, index),
      playcalling: clamp(centre + derivedInt(seed, index * 7 + 3, -5, 6), 40, 99),
      development: clamp(centre + derivedInt(seed, index * 7 + 4, -6, 6), 40, 99),
      discipline: clamp(centre + derivedInt(seed, index * 7 + 5, -6, 6), 40, 99),
      note: null
    });
  }
  return rows;
}

const EXTERNAL_NOTES = Object.freeze([
  "Available after a front-office reshuffle elsewhere.",
  "Coming off a year in the booth — hungry to get back on a sideline.",
  "College coordinator with a reputation for developing young players.",
  "Long-time position coach the league has overlooked twice already."
]);

/**
 * The market for one role, on one team, this year.
 *
 * Deterministic: the same league, year, team and role always produce the same
 * candidates, so the market cannot be rerolled by refreshing.
 */
export function buildCoachingMarket(league, teamId, role) {
  const team = league?.teams?.find((entry) => entry.id === teamId);
  if (!team) return { ok: false, error: "Team not found.", reasonCode: "market-no-team" };
  if (!ROLE_LABELS[role]) {
    return { ok: false, error: `Unknown staff role "${role}".`, reasonCode: "market-unknown-role" };
  }

  const seed = leagueSeed(league, teamId, role);
  const promotions = promotionCandidates(league, teamId, role);
  const externals = externalCandidates(league, teamId, role, CANDIDATES_PER_ROLE - promotions.length);
  const incumbent = team.staff?.[role] || null;
  const summary = staffBudgetSummary(team);

  const candidates = [...promotions, ...externals].map((row, index) => {
    const years = derivedInt(seed, index * 11 + 9, 2, 5);
    const salary = coachSalary(row, role);
    const outgoing = incumbent ? coachSalary(incumbent, role) : 0;
    const projectedPayroll = summary.payroll - outgoing + salary;
    return {
      id: `${role}-${index}-${hash(`${seed}|${row.name}`).toString(36)}`,
      role,
      roleLabel: ROLE_LABELS[role],
      name: row.name,
      origin: row.origin,
      currentTeamId: row.currentTeamId,
      sourceRole: row.sourceRole,
      playcalling: row.playcalling,
      development: row.development,
      discipline: row.discipline,
      yearsRequested: years,
      salary,
      note: row.note || EXTERNAL_NOTES[index % EXTERNAL_NOTES.length],
      projectedPayroll,
      affordable: projectedPayroll <= summary.budget,
      // Say plainly why an unaffordable hire is unaffordable, rather than just
      // disabling the button.
      blockedReason:
        projectedPayroll <= summary.budget
          ? null
          : `Hiring him puts staff payroll at ${formatMoney(projectedPayroll)} against a ${formatMoney(summary.budget)} budget.`
    };
  });

  return {
    ok: true,
    teamId,
    role,
    roleLabel: ROLE_LABELS[role],
    incumbent: incumbent
      ? {
          name: incumbent.name,
          playcalling: incumbent.playcalling,
          development: incumbent.development,
          discipline: incumbent.discipline,
          yearsRemaining: incumbent.yearsRemaining,
          salary: coachSalary(incumbent, role),
          firingCost: firingCost(incumbent, role)
        }
      : null,
    ...summary,
    candidates
  };
}

function formatMoney(value) {
  const millions = Number(value || 0) / 1_000_000;
  return `$${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
}

function ensureLedger(league) {
  if (!Array.isArray(league.coachingMarketLedger)) league.coachingMarketLedger = [];
  return league.coachingMarketLedger;
}

function pushReceipt(league, receipt) {
  const ledger = ensureLedger(league);
  ledger.unshift(receipt);
  ledger.length = Math.min(ledger.length, RECEIPT_LIMIT);
  return receipt;
}

/**
 * Hire a candidate into a role.
 *
 * Priced against `owner.staffBudget`; the outgoing coach's remaining deal is
 * charged to `owner.cash` as dead money. Both are stated in the receipt.
 */
export function hireCoach(league, { teamId, role, candidateId } = {}) {
  const market = buildCoachingMarket(league, teamId, role);
  if (!market.ok) return market;

  const candidate = market.candidates.find((entry) => entry.id === candidateId);
  if (!candidate) {
    return { ok: false, error: "That candidate is no longer on the market.", reasonCode: "market-unknown-candidate" };
  }
  if (!candidate.affordable) {
    return { ok: false, error: candidate.blockedReason, reasonCode: "market-over-budget" };
  }

  const team = league.teams.find((entry) => entry.id === teamId);
  const outgoing = team.staff?.[role] || null;
  const deadMoney = outgoing ? firingCost(outgoing, role) : 0;

  if (!team.staff) team.staff = {};
  team.staff[role] = {
    name: candidate.name,
    playcalling: candidate.playcalling,
    development: candidate.development,
    discipline: candidate.discipline,
    yearsRemaining: candidate.yearsRequested,
    specialty: outgoing?.specialty || null
  };

  if (team.owner) {
    team.owner.cash = Math.round((Number(team.owner.cash) || 0) - deadMoney);
  }

  // Poaching a coordinator leaves a real hole on the team he came from, so the
  // league keeps moving rather than quietly cloning him.
  if (candidate.origin === "coordinator" && candidate.currentTeamId) {
    const source = league.teams.find((entry) => entry.id === candidate.currentTeamId);
    const vacated = source?.staff?.[candidate.sourceRole || "offensiveCoordinator"];
    if (vacated) {
      vacated.name = `${candidate.currentTeamId} Interim`;
      vacated.playcalling = clamp(vacated.playcalling - 6, 40, 99);
      vacated.development = clamp(vacated.development - 4, 40, 99);
      vacated.discipline = clamp(vacated.discipline - 3, 40, 99);
      vacated.yearsRemaining = 1;
    }
  }

  return {
    ok: true,
    receipt: pushReceipt(league, {
      type: "hire",
      teamId,
      role,
      roleLabel: market.roleLabel,
      year: league.currentYear ?? null,
      name: candidate.name,
      origin: candidate.origin,
      fromTeamId: candidate.currentTeamId,
      salary: candidate.salary,
      years: candidate.yearsRequested,
      replaced: outgoing?.name || null,
      deadMoney,
      reasons: [
        `hired ${candidate.name} as ${market.roleLabel} at ${formatMoney(candidate.salary)} for ${candidate.yearsRequested} years`,
        outgoing ? `${outgoing.name} moved on — ${formatMoney(deadMoney)} dead money` : "filled a vacant role"
      ]
    })
  };
}

/**
 * Fire a coach without a replacement lined up.
 *
 * The role is filled by an interim at a real competence cost, dead money is
 * charged, and the owner notices — firing a coach you hired is a decision the
 * owner reads as instability.
 */
export function fireCoach(league, { teamId, role } = {}) {
  const team = league?.teams?.find((entry) => entry.id === teamId);
  if (!team) return { ok: false, error: "Team not found.", reasonCode: "market-no-team" };
  if (!ROLE_LABELS[role]) {
    return { ok: false, error: `Unknown staff role "${role}".`, reasonCode: "market-unknown-role" };
  }
  const outgoing = team.staff?.[role];
  if (!outgoing) {
    return { ok: false, error: "That role is already vacant.", reasonCode: "market-already-vacant" };
  }

  const deadMoney = firingCost(outgoing, role);
  team.staff[role] = {
    name: `Interim ${ROLE_LABELS[role]}`,
    playcalling: clamp(Math.round(outgoing.playcalling - 9), 40, 99),
    development: clamp(Math.round(outgoing.development - 7), 40, 99),
    discipline: clamp(Math.round(outgoing.discipline - 6), 40, 99),
    yearsRemaining: 1,
    specialty: outgoing.specialty || null
  };

  const reasons = [`fired ${outgoing.name} — ${formatMoney(deadMoney)} dead money`];
  if (team.owner) {
    team.owner.cash = Math.round((Number(team.owner.cash) || 0) - deadMoney);
    const before = Number(team.owner.patience ?? 0.55);
    team.owner.patience = Number(Math.max(0.05, Math.min(0.95, before - 0.015)).toFixed(4));
    reasons.push("owner patience -1.5 — the building reads a firing as instability");
  }

  return {
    ok: true,
    receipt: pushReceipt(league, {
      type: "fire",
      teamId,
      role,
      roleLabel: ROLE_LABELS[role],
      year: league.currentYear ?? null,
      name: outgoing.name,
      deadMoney,
      reasons
    })
  };
}

export function getCoachingMarketReceipts(league, { limit = 10 } = {}) {
  return ensureLedger(league).slice(0, limit);
}
