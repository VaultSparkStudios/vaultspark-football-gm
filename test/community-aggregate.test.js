import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";

const NOW = "2026-08-08T12:00:00.000Z";
function row(participant, type, dimensions = {}, metrics = {}, hoursAgo = 1) {
  const occurred = new Date(Date.parse(NOW) - hoursAgo * 60 * 60 * 1000).toISOString();
  return { participant_hash: participant.padEnd(64, "0"), type, dimensions, metrics, occurred_at: occurred, received_at: occurred };
}

test("snapshot emits honest warming state when no receipts exist", () => {
  const snapshot = aggregateCommunitySnapshot([], { now: NOW });
  assert.equal(snapshot.status, "warming");
  assert.equal(snapshot.periods["30d"].headline[0].value, 0);
  assert.equal(snapshot.periods["30d"].headline[1].value, null);
  assert.match(snapshot.periods["30d"].insights[0], /warming/i);
});

test("behavioral totals and choices remain suppressed below five participants", () => {
  const rows = [1, 2, 3, 4].flatMap((id) => [row(`p${id}`, "league_started", { team: "buf", tactic: "balanced" }), row(`p${id}`, "weeks_managed", { tactic: "aggressive-pass", decision: "hold-course" }, { weeks: 3, wins: 2 })]);
  const period = aggregateCommunitySnapshot(rows, { now: NOW }).periods["30d"];
  assert.equal(period.status, "suppressed");
  assert.equal(period.headline[0].value, 4);
  assert.equal(period.headline[2].value, null);
  assert.equal(period.categories.find((entry) => entry.id === "strategy").stats[0].status, "suppressed");
});

test("eligible cohort receives totals, deterministic insights, periods and local-comparison percentiles", () => {
  const rows = [];
  for (let id = 1; id <= 6; id += 1) {
    rows.push(row(`p${id}`, "league_started", { team: id <= 5 ? "buf" : "mia", era: "modern-pass", archetype: "rebuild", difficulty: "architect", mode: "play" }));
    rows.push(row(`p${id}`, "weeks_managed", { tactic: "aggressive-pass", decision: "hold-course", difficulty: "architect" }, { weeks: id, wins: id - 1, seasonsCompleted: id === 6 ? 1 : 0, championships: id === 6 ? 1 : 0 }));
    rows.push(row(`p${id}`, "draft_pick", { position: "qb", round: "1" }, { pickNumber: id }));
  }
  const snapshot = aggregateCommunitySnapshot(rows, { now: NOW });
  const period = snapshot.periods["30d"];
  assert.equal(snapshot.schemaVersion, "1.0");
  assert.equal(period.status, "live");
  assert.equal(period.headline[0].value, 6);
  assert.equal(period.headline[2].value, 21);
  assert.equal(period.categories.find((entry) => entry.id === "team-loyalty").stats[0].value, "buf");
  assert.equal(period.comparisons.weeks.p50, 4);
  assert.match(period.insights[0], /Aggressive Pass/);
  assert.equal(snapshot.periods["24h"].sampleSize, 6);
});

test("period windows exclude old rows and partial snapshots announce truncation", () => {
  const rows = [row("recent", "league_started", { team: "buf" }, {}, 12), row("old", "league_started", { team: "mia" }, {}, 48)];
  const snapshot = aggregateCommunitySnapshot(rows, { now: NOW, truncated: true });
  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.periods["24h"].sampleSize, 1);
  assert.equal(snapshot.periods["7d"].sampleSize, 2);
});
