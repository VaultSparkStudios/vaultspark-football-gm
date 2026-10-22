import {minimumSalaryForSeason,NFL_CBA_SOURCE} from './nflSalaryMinimum.js';

// Article26 §1(b), in thousands of dollars, credited-season bands0/1/2/3/4–6/7+.
// This is the non-Active/Inactive minimum. Ordinary practice-squad pay is
// excluded by §1(b); Article33 §5(k/l) specifically invokes it for qualifying
// football injury continuation after an elevation. It is not every reserve
// player's negotiated salary. Early annual increments are deliberately NOT
// replaced with a linear trend.
const nonActiveMinimumThousands = Object.freeze([
  [400,425,450,475,500,550],
  [415,440,465,490,515,565],
  [430,455,480,505,530,580],
  [450,475,500,525,550,600],
  [470,495,520,545,570,620],
  [490,515,540,565,590,640],
  [515,540,565,590,615,665],
  [540,565,590,615,640,690],
  [565,590,615,640,665,715],
  [590,615,640,665,690,740],
  [615,640,665,690,715,765]
].map(row=>Object.freeze(row)));

export const NFL_ELEVATION_SALARY_VERSION='nfl-elevation-salary-2026-v1';
export const NFL_ELEVATION_PAY_WEEK_SOURCE='https://operations.nfl.com/calendar-events/nfl-free-agency/contract-language';
function validate(year,creditedSeasons) {
  if(!Number.isSafeInteger(year)||year<2020||year>2200||!Number.isSafeInteger(creditedSeasons)||creditedSeasons<0)throw new TypeError('Elevation salary requires a modeled year and nonnegative salary-credited seasons');
}
export function nonActiveMinimumSalaryForSeason(year,creditedSeasons=0) {
  validate(year,creditedSeasons);
  const band=creditedSeasons>=7?5:creditedSeasons>=4?4:creditedSeasons;
  const scheduled=nonActiveMinimumThousands[Math.min(year,2030)-2020][band]*1000;
  return {salary:year<=2030?scheduled:Math.round(scheduled*1.045**(year-2030)),
    kind:year<=2030?'cba-scheduled-non-active-minimum':'simulation-projection',sourceUrl:NFL_CBA_SOURCE};
}

// A regular-season earning rate, not the cash-payment calendar, playoff pay,
// an automatic contract or a determination of medical/legal entitlement.
// The17-game calendar has18 regular-season pay weeks, including the bye.
// Cents are kept explicit for later payroll/cap integration; do not repeatedly
// round a weekly rate to dollars and treat it as an exact annual amount.
export function regularElevationSalaryForSeason(year,creditedSeasons=0,{rate='up'}={}) {
  validate(year,creditedSeasons);
  if(!['up','injury-continuation-down'].includes(rate))throw new TypeError('Unknown elevation salary rate');
  const schedule=rate==='up'?minimumSalaryForSeason(year,creditedSeasons):nonActiveMinimumSalaryForSeason(year,creditedSeasons);
  const payWeeks=year===2020?17:18;
  return {version:NFL_ELEVATION_SALARY_VERSION,rate,year,creditedSeasons,
    annualMinimum: schedule.salary,payWeeks,weeklyAmountCents:Math.round(schedule.salary*100/payWeeks),
    scheduleKind:schedule.kind,sourceUrl:schedule.sourceUrl,payWeekSourceUrl:NFL_ELEVATION_PAY_WEEK_SOURCE,
    calendarKind:year<=2030?'cba-calendar':'simulation-projected-current-calendar'};
}
