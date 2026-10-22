import {NFL_CBA_SOURCE} from './nflSalaryMinimum.js';

// CBA Article37 §2, dollars. These are benefits, not regular-season cap salary.
const schedules=Object.freeze({
  divisionWinner:Object.freeze([33000,42500,46500,50500,54500,58500,64500,70500,76500,82500,88500]),
  otherWildcard:Object.freeze([30000,37500,41500,45500,49500,53500,59500,65500,71500,77500,83500]),
  conference:Object.freeze([59000,65000,69000,73000,77000,81000,87000,93000,99000,105000,111000]),
  finalWinner:Object.freeze([130000,150000,157000,164000,171000,178000,188000,198000,208000,218000,228000]),
  finalLoser:Object.freeze([65000,75000,82000,89000,96000,103000,113000,123000,133000,143000,153000])
});
export const NFL_POSTSEASON_PAY_VERSION='postseason-elevation-current-list-v1';

// This narrow entitlement applies to a currently elevated Active/Inactive
// player, including one who does not dress. It does not decide IR, former-club,
// preseason injury or bye entitlement. Those have different Article37 tests.
export function postseasonElevationSalaryForSeason(year,{round,divisionWinner=false,won=false,priorClubListGames}={}) {
  if(!Number.isSafeInteger(year)||year<2020||year>2200
    ||!Number.isSafeInteger(priorClubListGames)||priorClubListGames<0
    ||typeof divisionWinner!=='boolean'||typeof won!=='boolean'
    ||!['wildcard','divisional','conference','super-bowl'].includes(round))throw new TypeError('Invalid elevated-player postseason entitlement');
  const band=round==='wildcard'?(divisionWinner?'divisionWinner':'otherWildcard')
    :round==='divisional'?'divisionWinner':round==='conference'?'conference':won?'finalWinner':'finalLoser';
  const scheduled=schedules[band][Math.min(year,2030)-2020];
  const fullAmountCents=year<=2030?scheduled*100:Math.round(scheduled*100*1.045**(year-2030));
  const fraction=['conference','super-bowl'].includes(round)&&priorClubListGames<3?.5:1;
  return {version:NFL_POSTSEASON_PAY_VERSION,year,round,fullAmountCents,fraction,
    amountCents:Math.round(fullAmountCents*fraction),priorClubListGames,capChargeCents:0,
    kind:year<=2030?'cba-scheduled-postseason-benefit':'simulation-projected-postseason-benefit',sourceUrl:NFL_CBA_SOURCE};
}
