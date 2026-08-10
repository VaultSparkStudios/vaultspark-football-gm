import assert from "node:assert/strict";
import test from "node:test";

import { deriveMarqueeBadge } from "../public/lib/marqueeBadge.js";

// deriveMarqueeBadge is deterministic and derives purely from standings state
// (no randomness, no fabricated broadcast data) — verified against
// constructed standings fixtures, per S78 audit item primetime-marquee-badge.

function row(team, { conference, division, wins, losses, ties = 0 }) {
  const games = wins + losses + ties;
  return { team, conference, division, wins, losses, ties, winPct: games ? wins / games : 0 };
}

const standings = [
  // AFC East — BUF leads, NYJ is a weak divisional rival
  row("BUF", { conference: "AFC", division: "East", wins: 10, losses: 2 }),
  row("NYJ", { conference: "AFC", division: "East", wins: 5, losses: 7 }),
  // AFC North — BAL leads, CIN is weak
  row("BAL", { conference: "AFC", division: "North", wins: 9, losses: 3 }),
  row("CIN", { conference: "AFC", division: "North", wins: 6, losses: 6 }),
  // AFC West — extra strong teams so NYJ/CIN fall outside the AFC's top 4
  row("KC", { conference: "AFC", division: "West", wins: 12, losses: 0 }),
  row("LAC", { conference: "AFC", division: "West", wins: 11, losses: 1 }),
  // NFC West — SF leads; SEA is a strong non-leading second-place team
  row("SF", { conference: "NFC", division: "West", wins: 12, losses: 0 }),
  row("SEA", { conference: "NFC", division: "West", wins: 10, losses: 2 }),
  // NFC North — GB leads; MIN is a strong non-leading second-place team
  row("GB", { conference: "NFC", division: "North", wins: 11, losses: 1 }),
  row("MIN", { conference: "NFC", division: "North", wins: 9, losses: 3 }),
  // NFC East — weak division, no strong records anywhere
  row("DAL", { conference: "NFC", division: "East", wins: 3, losses: 9 }),
  row("PHI", { conference: "NFC", division: "East", wins: 2, losses: 10 })
];

test("a divisional rival facing the division leader qualifies as Division Showdown", () => {
  // Only one team can lead a given division, so a real "both leaders" case
  // is impossible within one division — the marquee signal for a
  // same-division game is instead "a rival is playing the team currently
  // leading their division".
  const badge = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "NYJ" }, standings, 8);
  assert.deepEqual(badge, { label: "Division Showdown", reason: "A divisional rival is taking on the team currently leading their division." });
});

test("division leaders of two different divisions: Playoff Preview", () => {
  const badge = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, standings, 8);
  assert.deepEqual(badge, { label: "Playoff Preview", reason: "Both teams lead their divisions — a likely playoff-seeding preview." });
});

test("two top-4 conference records, neither a division leader, meeting cross-division: Statement Game", () => {
  // SEA (NFC West 2nd) and MIN (NFC North 2nd) are both NFC top-4 records
  // but neither leads its own division and they are not divisional rivals.
  const badge = deriveMarqueeBadge({ awayTeamId: "SEA", homeTeamId: "MIN" }, standings, 8);
  assert.deepEqual(badge, { label: "Statement Game", reason: "Two of the conference's top-4 records meet." });
});

test("two non-leader, non-top-4, different-division teams render no badge", () => {
  const badge = deriveMarqueeBadge({ awayTeamId: "NYJ", homeTeamId: "CIN" }, standings, 8);
  assert.equal(badge, null);
});

test("a top-4 division leader against an unrelated non-leader, non-top-4 team does not qualify", () => {
  const badge = deriveMarqueeBadge({ awayTeamId: "SF", homeTeamId: "NYJ" }, standings, 8);
  assert.equal(badge, null);
});

test("even the weaker of two divisional rivals still leads a weak division, so it still qualifies as Division Showdown", () => {
  // DAL (3-9) is nonetheless the best record in a weak NFC East, so it is
  // that division's leader — confirming leadership is relative to the
  // division, not an absolute record threshold.
  const badge = deriveMarqueeBadge({ awayTeamId: "DAL", homeTeamId: "PHI" }, standings, 8);
  assert.deepEqual(badge, { label: "Division Showdown", reason: "A divisional rival is taking on the team currently leading their division." });
});

test("cross-conference pairing (not both division leaders) does not qualify", () => {
  const badge = deriveMarqueeBadge({ awayTeamId: "SEA", homeTeamId: "BAL" }, standings, 8);
  assert.equal(badge, null);
});

test("weeks before 6 never qualify, even with two division leaders", () => {
  for (const week of [1, 2, 3, 4, 5]) {
    const badge = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, standings, week);
    assert.equal(badge, null, `week ${week} should not qualify`);
  }
});

test("week 6 exactly is the first qualifying week", () => {
  const badge = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, standings, 6);
  assert.ok(badge);
});

test("is deterministic across repeated calls with identical inputs", () => {
  const first = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, standings, 8);
  const second = deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, standings, 8);
  assert.deepEqual(first, second);
});

test("missing standings data for a team renders no badge instead of throwing", () => {
  assert.doesNotThrow(() => deriveMarqueeBadge({ awayTeamId: "XXX", homeTeamId: "BUF" }, standings, 8));
  assert.equal(deriveMarqueeBadge({ awayTeamId: "XXX", homeTeamId: "BUF" }, standings, 8), null);
});

test("empty/missing standings and game inputs are handled safely", () => {
  assert.equal(deriveMarqueeBadge(null, standings, 8), null);
  assert.equal(deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, [], 8), null);
  assert.equal(deriveMarqueeBadge({ awayTeamId: "BUF", homeTeamId: "BAL" }, null, 8), null);
});
