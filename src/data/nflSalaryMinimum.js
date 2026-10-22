export const NFL_MINIMUM_SALARY_SOURCE = 'https://operations.nfl.com/calendar-events/nfl-free-agency/types-of-free-agents';
export const NFL_CBA_SOURCE = 'https://nflpaweb.blob.core.windows.net/website/PDFs/CBA/March-15-2020-NFL-NFLPA-Collective-Bargaining-Agreement-Final-Executed-Copy.pdf';
// Article26, Section1(a), amounts in dollars. This is base salary, not cap hit.
const bases2020 = [610000, 675000, 750000, 825000, 910000, 1050000];
const bases2021 = [660000, 780000, 850000, 920000, 990000, 1075000];
export function minimumSalaryForSeason(year, creditedSeasons = 0) {
  if (!Number.isInteger(year) || !Number.isInteger(creditedSeasons) || creditedSeasons < 0) throw new TypeError('Salary minimum requires a season and nonnegative integer credited seasons');
  const band = Math.min(creditedSeasons, creditedSeasons >= 7 ? 5 : creditedSeasons >= 4 ? 4 : 3);
  if (year < 2020) return { salary: 850000, kind: 'fictional-unmodeled-minimum', sourceUrl: null };
  const observed = year <= 2030;
  const salary = year === 2020 ? bases2020[band] : bases2021[band] + 45000 * (Math.min(year, 2030) - 2021);
  return { salary: observed ? salary : Math.round(salary * 1.045 ** (year - 2030)),
    kind: observed ? 'cba-scheduled-base-minimum' : 'simulation-projection', sourceUrl: NFL_CBA_SOURCE };
}
