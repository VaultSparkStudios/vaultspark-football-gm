import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyMentorshipBonuses,
  assignMentorshipCovenant,
  clearMentorshipCovenant,
  getMentorshipState
} from "../src/engine/veteranMentorship.js";

function player(id, { teamId = "BUF", position = "QB", age = 23, seasonsPlayed = 1, overall = 70 } = {}) {
  return { id, name: id, teamId, position, age, seasonsPlayed, overall, status: "active" };
}

function fixture() {
  return {
    teams: [{ id: "BUF" }, { id: "MIA" }],
    players: [
      player("mentor-a", { age: 31, seasonsPlayed: 9, overall: 90 }),
      player("mentor-b", { age: 29, seasonsPlayed: 6, overall: 80 }),
      player("mentee-a", { age: 22, seasonsPlayed: 0, overall: 68 }),
      player("mentee-b", { age: 24, seasonsPlayed: 2, overall: 71 })
    ]
  };
}

function assign(league, state, overrides = {}) {
  return assignMentorshipCovenant(league, {
    teamId: "BUF",
    mentorId: "mentor-b",
    menteeId: "mentee-a",
    focus: "film-study",
    expectedRevision: state.revision,
    expectedFingerprint: state.fingerprint,
    year: 2026,
    week: 1,
    ...overrides
  });
}

test("explicit covenants preserve automatic pair slots and total OVR budget", () => {
  const league = fixture();
  const before = getMentorshipState(league, "BUF");
  assert.equal(before.budget.maximumPairs, 2);
  assert.equal(before.budget.totalOvr, 3);
  const result = assign(league, before);
  assert.equal(result.ok, true);
  assert.equal(result.state.assignments.length, 1);
  assert.equal(result.state.pairs.length, 2);
  assert.equal(result.state.pairs.filter((pair) => pair.source === "explicit").length, 1);
  assert.equal(result.state.pairs.reduce((sum, pair) => sum + pair.projectedBonus, 0), before.budget.totalOvr);
  assert.match(result.state.budget.disclosure, /does not increase/i);
});

test("revision and roster fingerprint reject stale writes before mutation", () => {
  const league = fixture();
  const staleAuthority = getMentorshipState(league, "BUF");
  league.players.find((entry) => entry.id === "mentor-b").overall = 81;
  const result = assign(league, staleAuthority);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.reasonCode, "stale-mentorship-plan");
  assert.equal(result.state.assignments.length, 0);
});

test("clear and traded-player dissolution are explicit, idempotent receipts", () => {
  const league = fixture();
  const assigned = assign(league, getMentorshipState(league, "BUF"));
  const cleared = clearMentorshipCovenant(league, {
    teamId: "BUF",
    assignmentId: assigned.assignment.id,
    expectedRevision: assigned.state.revision,
    expectedFingerprint: assigned.state.fingerprint,
    year: 2026,
    week: 2
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.assignments.length, 0);

  const reassigned = assign(league, cleared.state);
  league.players.find((entry) => entry.id === "mentee-a").teamId = "MIA";
  const reconciled = getMentorshipState(league, "BUF", { year: 2026, week: 3 });
  assert.equal(reconciled.assignments.length, 0);
  assert.equal(reconciled.dissolutions.at(-1).assignmentId, reassigned.assignment.id);
  assert.equal(reconciled.dissolutions.at(-1).reasonCode, "mentee-left-franchise");
  assert.equal(getMentorshipState(league, "BUF", { year: 2026, week: 4 }).dissolutions.length, 1);
});

test("offseason mentorship applies exactly once per team and year", () => {
  const league = fixture();
  assign(league, getMentorshipState(league, "BUF"));
  const before = new Map(league.players.map((entry) => [entry.id, entry.overall]));
  const first = applyMentorshipBonuses(league, 2027).find((entry) => entry.teamId === "BUF");
  const afterFirst = new Map(league.players.map((entry) => [entry.id, entry.overall]));
  const second = applyMentorshipBonuses(league, 2027).find((entry) => entry.teamId === "BUF");
  assert.equal(first.id, second.id);
  assert.equal(first.totalBonusApplied, 3);
  assert.equal(league.mentorshipLog.filter((entry) => entry.teamId === "BUF" && entry.year === 2027).length, 1);
  assert.ok([...afterFirst].some(([id, overall]) => overall > before.get(id)));
  assert.deepEqual(new Map(league.players.map((entry) => [entry.id, entry.overall])), afterFirst);
});

test("Roster UI exposes assign, focus, clear, and authority-bound payload wiring", () => {
  const roster = readFileSync(new URL("../public/lib/tabRoster.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../public/lib/mentorshipPanel.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(roster, /import\("\.\/mentorshipPanel\.js"\)/);
  assert.match(panel, /data-mentorship-assign/);
  assert.match(panel, /mentorshipFocusSelect/);
  assert.match(panel, /expectedFingerprint: mentorshipAuthority\.fingerprint/);
  assert.match(panel, /data-mentorship-clear/);
  assert.match(app, /assignMentorshipFromPanel/);
  assert.match(app, /clearMentorshipFromPanel/);
});
