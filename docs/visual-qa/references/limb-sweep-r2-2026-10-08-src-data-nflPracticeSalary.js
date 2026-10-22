import { NFL_CBA_SOURCE } from './nflSalaryMinimum.js';
// Article33 §3; weekly dollars. Later years are explicitly fictional projections.
const fixed=[8400,9200,11500,12000,12500,13000,13750,14500,15250,16000,16750];
const veteranMin=[12000,14000,15400,16100,16800,17500,18350,19200,20050,20900,21750];
const veteranMax=[12000,14000,19900,20600,21300,22000,22850,23700,24550,25400,26250];
export function practiceSalaryForSeason(year, group='inexperienced') {
  if(!Number.isInteger(year)||!['inexperienced','restricted','unrestricted'].includes(group)) throw new TypeError('Practice pay requires a year and eligibility group');
  const index=Math.max(0,Math.min(10,year-2020));
  const scale=year>2030?1.045**(year-2030):1;
  const veteran=group==='unrestricted';
  return {minimum:Math.round((veteran?veteranMin:fixed)[index]*scale),
    maximum:Math.round((veteran?veteranMax:fixed)[index]*scale),
    kind:year>=2020&&year<=2030?'cba-scheduled-weekly-pay':'simulation-projection',sourceUrl:year>=2020?NFL_CBA_SOURCE:null};
}
