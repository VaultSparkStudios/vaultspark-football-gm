import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffTeamRecord, findTeamStanding, formatTeamRecord, teamRecordWinPct } from "../public/lib/teamRecord.js";
import { formatRecord, recordWinPct } from "../src/stats/teamRecord.js";

test("team record authority preserves ties and resolves supported standing shapes", () => {
  const standings = [
    { team: "BUF", wins: 8, losses: 7, ties: 2 },
    { team: { id: "DAL", abbrev: "DAL" }, wins: 10, losses: 7, ties: 0 }
  ];
  assert.equal(findTeamStanding(standings, { id: "BUF" }), standings[0]);
  assert.equal(findTeamStanding(standings, "DAL"), standings[1]);
  assert.equal(formatTeamRecord(standings[0]), "8–7–2");
  assert.equal(formatTeamRecord(standings[1]), "10–7");
  assert.deepEqual(diffTeamRecord(standings[0], { wins: 8, losses: 7 }), { wins: 0, losses: 0, ties: 2 });
});

test("browser and engine win percentage authorities count a tie as half a win", () => {
  const record = { wins: 8, losses: 7, ties: 2 };
  assert.equal(teamRecordWinPct(record), 0.5294117647058824);
  assert.equal(recordWinPct(record), 0.5294117647058824);
  assert.equal(formatRecord(record), "8-7-2");
  assert.equal(teamRecordWinPct(null), 0.5);
});

test("engine-authored record narratives consume the tie-aware authority", () => {
  for (const file of ["beatReporter.js", "gmDecisionAuthority.js", "narrativeEvents.js"]) {
    const source = readFileSync(new URL(`../src/engine/${file}`, import.meta.url), "utf8");
    assert.match(source, /from "\.\.\/stats\/teamRecord\.js"/);
  }
});

test("all player-facing record surfaces use the shared browser authority", () => {
  const consumers = [
    "mobileLoop.js", "betaFeedback.js", "franchiseNewsletter.js", "rewardBeats.js",
    "gameFlow.js", "tabOverview.js", "seasonEpilogue.js", "returnDigest.js", "achievements.js"
  ];
  for (const file of consumers) {
    const source = readFileSync(new URL(`../public/lib/${file}`, import.meta.url), "utf8");
    assert.match(source, /from "\.\/teamRecord\.js"/, `${file} must consume shared team-record truth`);
  }
});
