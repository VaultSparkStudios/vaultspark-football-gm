import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { computeGoldenMaster, diffGoldenMaster, GOLDEN_MASTER_FIXTURE, HISTORICAL_GOLDEN_MASTER_FIXTURE, S118_GOLDEN_MASTER_FIXTURE, S119_GOLDEN_MASTER_FIXTURE, S131_GOLDEN_MASTER_FIXTURE, S132_V5_GOLDEN_MASTER_FIXTURE, S132_V6_GOLDEN_MASTER_FIXTURE, S132_V7_GOLDEN_MASTER_FIXTURE, S133_V8_GOLDEN_MASTER_FIXTURE, GOLDEN_MASTER_SCENARIOS } from "../scripts/golden-master.mjs";

// S116 Phase 0: every multi-sport extraction step must leave football byte-identical.
// A mismatch names the drifted sections. Regenerate the fixture only for an
// intentional, separately justified behavior change: node scripts/golden-master.mjs --write
test("football is byte-identical to the committed golden master", async () => {
  const expected = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE, "utf8"));
  const actual = await computeGoldenMaster();
  const differences = diffGoldenMaster(expected, actual);
  assert.equal(actual.schemaVersion, expected.schemaVersion);
  for (const id of Object.keys(expected.scenarios)) assert.deepEqual(actual.scenarios[id]?.summary, expected.scenarios[id].summary);
  assert.deepEqual(differences, [], `golden master drifted:\n${differences.join("\n")}`);
});

test("versioned intentional behavior baseline preserves S116 and every original scenario and section", () => {
  const historicalBytes = fs.readFileSync(HISTORICAL_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(historicalBytes).digest('hex'), '4901d3487f119b9fc7485e139135a663738c32062668f7eaa66dc32517de1190');
  const historical = JSON.parse(historicalBytes), current = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE));
  assert.equal(historical.schemaVersion, 1); assert.equal(current.schemaVersion, 1);
  assert.deepEqual(GOLDEN_MASTER_SCENARIOS, [
    {id:'drive-20260306-BUF',seed:20260306,mode:'drive',controlledTeamId:'BUF',seasons:3},
    {id:'play-4113-CHI',seed:4113,mode:'play',controlledTeamId:'CHI',seasons:3}
  ]);
  assert.deepEqual(Object.keys(current.scenarios).sort(), Object.keys(historical.scenarios).sort());
  for (const [id, scenario] of Object.entries(historical.scenarios)) {
    const next = current.scenarios[id];
    assert.equal(next.summary.year, 2029); assert.equal(next.summary.phase, 'regular-season');
    assert.equal(next.summary.champions.length, 3);
    for (const key of Object.keys(scenario.sections)) assert.ok(Object.hasOwn(next.sections, key), `historical section removed: ${id}: ${key}`);
    assert.ok(Object.values(next.sections).every(value=>/^[a-f0-9]{64}$/.test(value)), 'every current section retains a SHA-256 identity');
  }
});

test("S119 passer-rating baseline preserves S118 and moves only the season passing tables", () => {
  const s118Bytes = fs.readFileSync(S118_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(s118Bytes).digest('hex'), 'd9b95a052a21e85b789a42d0d7320d55e7b50427f58f923fb5bc8ef832066b26');
  const s118 = JSON.parse(s118Bytes), s119 = JSON.parse(fs.readFileSync(S119_GOLDEN_MASTER_FIXTURE));
  // The passer rating now scales each term before clamping it. Nothing reads
  // the season rate except award tie-breaks, so every other section, including
  // awards, standings and champions, must be byte-identical to S118.
  assert.deepEqual(diffGoldenMaster(s118, s119).sort(), [
    'drive-20260306-BUF: seasonTable.passing changed',
    'play-4113-CHI: seasonTable.passing changed'
  ]);
  for (const id of Object.keys(s118.scenarios)) assert.deepEqual(s119.scenarios[id].summary, s118.scenarios[id].summary);
});

test("S131 injury-clock baseline preserves S119 byte-identical and keeps every section", () => {
  const s119Bytes = fs.readFileSync(S119_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(s119Bytes).digest('hex'), 'd1230f6155dfcfc115d2960edc0f6e45be61eda611951f1a435ffe0cdb56a0bb');
  const s119 = JSON.parse(s119Bytes), current = JSON.parse(fs.readFileSync(S131_GOLDEN_MASTER_FIXTURE));
  // An injury now costs the games its label states, which changes who plays
  // every week and so moves results league-wide. The new baseline may differ
  // in values, never in shape: no scenario or section is removed. The one
  // added section is the elevation-injury continuation ledger, which first
  // appears because an injured elevated player now serves his labelled week.
  for (const line of diffGoldenMaster(s119, current)) {
    if (/ added$/.test(line)) assert.equal(line, 'play-4113-CHI: league.admittedInjuryContinuations added');
    else assert.match(line, / changed$/, line);
  }
  assert.notDeepEqual(diffGoldenMaster(s119, current), [], 'the S131 baseline records an actual behavior change');
});

test("S132 rival-scouting baseline preserves S131 byte-identical and keeps every scenario", () => {
  const s131Bytes = fs.readFileSync(S131_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(s131Bytes).digest('hex'), 'e507876912facc646026c29141496fb2309acc29fd170d5554eac79fe35b8ab4');
  const s131 = JSON.parse(s131Bytes), current = JSON.parse(fs.readFileSync(S132_V5_GOLDEN_MASTER_FIXTURE));
  // Rival clubs now draft on a per-club scouted read, so who is drafted where
  // changes from the first draft on and results move league-wide. A section
  // may appear or disappear only where it is a ledger that exists once its
  // first event happens; every other difference is a changed value.
  const eventLedgers = [
    'drive-20260306-BUF: league.gmCareer added',
    'drive-20260306-BUF: league.rivalGmMemory changed (removed)',
    'play-4113-CHI: league.admittedInjuryContinuations changed (removed)',
    'play-4113-CHI: league.gmCareer added',
    'play-4113-CHI: league.rivalGmMemory added'
  ];
  const lines = diffGoldenMaster(s131, current);
  for (const line of lines) {
    if (!/ changed$/.test(line)) assert.ok(eventLedgers.includes(line), `unexpected shape change: ${line}`);
    else assert.match(line, / changed$/, line);
  }
  assert.notDeepEqual(lines, [], 'the S132 baseline records an actual behavior change');
  for (const id of Object.keys(s131.scenarios)) assert.deepEqual(current.scenarios[id].summary.champions[0], s131.scenarios[id].summary.champions[0], 'the season before the first changed draft is untouched');
});

test("S132 challenge-score baseline preserves v5 byte-identical and moves only the GM history sections", () => {
  const v5Bytes = fs.readFileSync(S132_V5_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(v5Bytes).digest('hex'), 'b57decefff6fe62573635582e015496be9e4575932545b75e64902c04c94c292');
  const v5 = JSON.parse(v5Bytes), current = JSON.parse(fs.readFileSync(S132_V6_GOLDEN_MASTER_FIXTURE));
  // The GM season history gained three recorded totals. Nothing that is
  // simulated may move: results, rosters, awards and champions are identical.
  assert.deepEqual(diffGoldenMaster(v5, current).sort(), [
    'drive-20260306-BUF: dashboard changed',
    'drive-20260306-BUF: league.gmLegacy changed',
    'play-4113-CHI: dashboard changed',
    'play-4113-CHI: league.gmLegacy changed'
  ]);
  for (const id of Object.keys(v5.scenarios)) assert.deepEqual(current.scenarios[id].summary, v5.scenarios[id].summary);
});

test("S132 wording baseline preserves v6 byte-identical and moves only the sections that carry engine-written text", () => {
  const v6Bytes = fs.readFileSync(S132_V6_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(v6Bytes).digest('hex'), '58e0e9acf054574d1d39093b0fe2f1269f366f77cb58754530aa88dbdd25f42e');
  const v6 = JSON.parse(v6Bytes), current = JSON.parse(fs.readFileSync(S132_V7_GOLDEN_MASTER_FIXTURE));
  // Engine-written copy dropped the process words ("receipt", "ledger" ...).
  // That text lives in the news feed, the event log, the stewardship reports
  // and the dashboard. Nothing simulated may move: players, teams, results,
  // stat tables, the draw position of the random stream and champions are
  // identical.
  assert.deepEqual(diffGoldenMaster(v6, current).sort(), [
    'drive-20260306-BUF: dashboard changed',
    'drive-20260306-BUF: league.eventLog changed',
    'drive-20260306-BUF: league.gmStewardshipReports changed',
    'drive-20260306-BUF: league.newsFeed changed',
    'play-4113-CHI: dashboard changed',
    'play-4113-CHI: league.eventLog changed',
    'play-4113-CHI: league.gmStewardshipReports changed',
    'play-4113-CHI: league.newsFeed changed'
  ]);
  for (const id of Object.keys(v6.scenarios)) {
    assert.deepEqual(current.scenarios[id].summary, v6.scenarios[id].summary);
    assert.equal(current.scenarios[id].sections['session.position'], v6.scenarios[id].sections['session.position'], 'the random stream is at the same draw');
  }
});

test("S133 Frame Matters baseline preserves v7 byte-identical and moves the simulation from the first game", () => {
  const v7Bytes = fs.readFileSync(S132_V7_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(v7Bytes).digest('hex'), '9f109807151189f5c0c4262aaba5d71e581d66f1979bcfd99f1bd51549a0a752');
  const v7 = JSON.parse(v7Bytes), current = JSON.parse(fs.readFileSync(S133_V8_GOLDEN_MASTER_FIXTURE));
  const lines = diffGoldenMaster(v7, current);
  // Sections appear and empty out where different games create or clear them
  // (an admitted injury continuation, a rival GM's memory). Scenarios may not
  // appear or go missing.
  for (const line of lines) assert.doesNotMatch(line, /scenario missing|unexpected scenario/, line);
  // Bodies now edge blocking, rushing, coverage, catches, tackles, fumbles and
  // injuries, so results, rosters and the stat tables all move.
  for (const id of Object.keys(v7.scenarios)) {
    assert.ok(lines.includes(`${id}: league.players changed`), `${id}: rosters moved`);
    assert.ok(lines.includes(`${id}: league.schedule changed`) || lines.some((line) => line.startsWith(`${id}: `) && /stat|season/i.test(line)), `${id}: results moved`);
    assert.notDeepEqual(current.scenarios[id].summary.champions, v7.scenarios[id].summary.champions, "the change reaches who wins");
    assert.equal(current.scenarios[id].sections['league.settings'], v7.scenarios[id].sections['league.settings'], 'league settings are untouched');
  }
});

test("S133 aging baseline preserves v8 byte-identical and moves only from the first offseason", () => {
  const v8Bytes = fs.readFileSync(S133_V8_GOLDEN_MASTER_FIXTURE);
  assert.equal(createHash('sha256').update(v8Bytes).digest('hex'), '0404689fe13411fddf1e4af3ee4a109853249f45e5fbd341b272df227a9f589d');
  const v8 = JSON.parse(v8Bytes), current = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE));
  const lines = diffGoldenMaster(v8, current);
  assert.notDeepEqual(lines, [], 'the aging rule records an actual behavior change');
  for (const line of lines) assert.doesNotMatch(line, /scenario missing|unexpected scenario/, line);
  for (const id of Object.keys(v8.scenarios)) {
    assert.ok(lines.includes(`${id}: league.players changed`), `${id}: rosters moved`);
    assert.deepEqual(current.scenarios[id].summary.champions[0], v8.scenarios[id].summary.champions[0], 'the first season, before any offseason, is untouched');
  }
});

test("the diff names changed, added and missing sections", () => {
  const base = { scenarios: { a: { sections: { x: "1", y: "2" } } } };
  assert.deepEqual(diffGoldenMaster(base, base), []);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: { a: { sections: { x: "9", y: "2", z: "3" } } } }), ["a: x changed", "a: z added"]);
  assert.deepEqual(diffGoldenMaster(base, { scenarios: {} }), ["a: scenario missing"]);
  assert.deepEqual(diffGoldenMaster({ scenarios: {} }, base), ["a: unexpected scenario"],
    "deleting a fixture scenario must not turn an unverified career into a pass");
  assert.deepEqual(diffGoldenMaster(base, { scenarios: { ...base.scenarios, b: { sections: { x: "1" } } } }), ["b: unexpected scenario"]);
});
