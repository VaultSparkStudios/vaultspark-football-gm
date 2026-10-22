import test from 'node:test';
import assert from 'node:assert/strict';
import {nonActiveMinimumSalaryForSeason,regularElevationSalaryForSeason} from '../src/data/nflElevationSalary.js';

test('Article26 down schedule retains early nonlinear changes and every2026 credited-service band',()=>{
  // Independently transcribed source anchors; using a25k/year shortcut from
  //2020 would overpay early years even though its2026 value looked plausible.
  for(const [year,minimum]of [[2020,400000],[2021,415000],[2022,430000],[2023,450000],[2024,470000],[2025,490000],[2026,515000],[2030,615000]])assert.equal(nonActiveMinimumSalaryForSeason(year,0).salary,minimum);
  for(const [service,minimum]of [[0,515000],[1,540000],[2,565000],[3,590000],[4,615000],[5,615000],[6,615000],[7,665000],[20,665000]])assert.equal(nonActiveMinimumSalaryForSeason(2026,service).salary,minimum);
});

test('up earnings use salary-credited minimum and one18th with explicit cents; injury down rate is separate',()=>{
  for(const [service,annual]of [[0,885000],[1,1005000],[2,1075000],[3,1145000],[4,1215000],[6,1215000],[7,1300000]]){
    const up=regularElevationSalaryForSeason(2026,service),down=regularElevationSalaryForSeason(2026,service,{rate:'injury-continuation-down'});
    assert.equal(up.annualMinimum,annual);assert.equal(up.payWeeks,18);
    assert.ok(Math.abs(up.weeklyAmountCents/100-annual/18)<=.005);
    assert.ok(down.weeklyAmountCents<up.weeklyAmountCents);
    assert.equal(down.weeklyAmountCents,Math.round(nonActiveMinimumSalaryForSeason(2026,service).salary*100/18));
  }
  assert.equal(regularElevationSalaryForSeason(2020,0).payWeeks,17);
  assert.equal(regularElevationSalaryForSeason(2021,0).payWeeks,18);
});

test('unknown/invalid inputs cannot invent salary history; future compensation stays labeled projected',()=>{
  for(const args of [[2019,0],[2026,-1],[2026,1.5],[NaN,0],[2026,Infinity],['2026',0],[2026,'3'],[2201,0]]){
    assert.throws(()=>nonActiveMinimumSalaryForSeason(...args),TypeError);
    assert.throws(()=>regularElevationSalaryForSeason(...args),TypeError);
  }
  assert.throws(()=>regularElevationSalaryForSeason(2026,0,{rate:'postseason'}),TypeError);
  const projected=regularElevationSalaryForSeason(2055,7,{rate:'injury-continuation-down'});
  assert.equal(projected.scheduleKind,'simulation-projection');assert.equal(projected.calendarKind,'simulation-projected-current-calendar');
  assert.ok(Number.isSafeInteger(projected.weeklyAmountCents));
  assert.equal(nonActiveMinimumSalaryForSeason(2031,0).salary,Math.round(615000*1.045));
});
