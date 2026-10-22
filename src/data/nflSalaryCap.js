// NFL Football Operations, checked2026-10-06. Limited verified modern seasons;
// projected/unmodeled seasons must never be labeled official historical caps.
export const NFL_SALARY_CAP_SOURCE = "https://operations.nfl.com/calendar-events/nfl-free-agency/nfl-salary-cap";
export const NFL_SALARY_CAPS = Object.freeze({ 2024: 255_400_000, 2025: 279_200_000, 2026: 301_200_000 });
export const LEGACY_SALARY_CAP_BASE = 255_000_000;

export function createSalaryCapModel(year, growthRate = .045) {
  const baseYear = Number(year);
  if (!Number.isInteger(baseYear) || !Number.isFinite(growthRate) || growthRate < 0 || growthRate > .2) {
    throw new TypeError("Salary cap model requires an integer season and finite growth rate in[0,.2]");
  }
  const observed = NFL_SALARY_CAPS[baseYear];
  const projected = baseYear > 2026;
  return { version: "nfl-modern-cap-v1", baseYear,
    baseCap: observed ?? (projected ? Math.round(NFL_SALARY_CAPS[2026] * (1 + growthRate) ** (baseYear - 2026)) : LEGACY_SALARY_CAP_BASE),
    kind: observed ? "official-season-base" : projected ? "simulation-projection" : "fictional-unmodeled-season-base",
    referenceYear: projected ? 2026 : observed ? baseYear : null,
    sourceUrl: observed || projected ? NFL_SALARY_CAP_SOURCE : null };
}

export function legacySalaryCapModel(startYear) {
  return { version: "legacy-fixed-cap-v1", baseYear: Number(startYear), baseCap: LEGACY_SALARY_CAP_BASE,
    kind: "legacy-save-base", referenceYear: null, sourceUrl: null };
}

export function salaryCapForSeason(model, year, growthRate) {
  if (!Number.isFinite(model?.baseCap) || model.baseCap <= 0 || !Number.isInteger(model?.baseYear)
    || !Number.isInteger(Number(year)) || !Number.isFinite(growthRate) || growthRate < 0 || growthRate > .2) {
    throw new TypeError("Invalid persisted salary cap model or season growth rate");
  }
  // A league grows from its chosen, persisted economic basis. Later official
  // seasons do not retroactively reprice a game or erase its settings.
  return Math.round(model.baseCap * (1 + growthRate) ** Math.max(0, Number(year) - model.baseYear));
}

// Season history keeps its completed-season label through the offseason.
// Financial terms advance independently before the new free-agent market.
export function financialYearForLeague(league) {
  const year = league?.financialYear ?? league?.year;
  if (!Number.isInteger(year) || (league?.financialYear != null &&
    year !== league.year && year !== league.year + 1)) throw new TypeError('Invalid league financial year');
  return year;
}

export function openNextFinancialYear(league, completedYear) {
  if (league.capModel?.version !== 'nfl-modern-cap-v1') return;
  if (!Number.isInteger(completedYear) || completedYear !== league.year) throw new TypeError('Financial boundary requires the completed season');
  financialYearForLeague(league);
  const year = completedYear + 1;
  const cap = salaryCapForSeason(league.capModel, year, league.settings.capGrowthRate);
  league.teamCapOverride ||= {};
  for (const team of league.teams) league.teamCapOverride[team.id] = cap;
  league.financialYear = year;
}
