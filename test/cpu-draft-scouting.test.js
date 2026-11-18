import test from "node:test";
import assert from "node:assert/strict";
import {
  CPU_DRAFT_SCOUTING,
  clubScoutedRead,
  clubScoutingAccuracy,
  draftReadValue,
  prospectScoutingConfidence,
  scoutingConvergence
} from "../src/engine/cpuDraftScouting.js";
import { createSession } from "../src/runtime/bootstrap.js";

const TEAMS = Array.from({ length: 32 }, (_, index) => `T${String(index).padStart(2, "0")}`);
const LEAGUE = "Lunit-test-league";

function prospect(index, { round = 1, overall = 70, potential = 80, publicOverall = overall } = {}) {
  return {
    id: `P2027-FA-WR-${1000 + index}`,
    overall,
    potential,
    age: 22,
    scouting: { projectedRound: round, scoutedOverall: publicOverall }
  };
}

const meanAbsOverallError = ({ round, accuracy, publicMiss = 6, count = 400 }) => {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    // The public board is wrong by `publicMiss` in alternating directions.
    const miss = index % 2 ? publicMiss : -publicMiss;
    const subject = prospect(index, { round, overall: 70, publicOverall: 70 + miss });
    const read = clubScoutedRead({ prospect: subject, leagueKey: LEAGUE, teamId: "T01", draftYear: 2027, accuracy, publicPotential: 80 });
    total += Math.abs(read.overall - subject.overall);
  }
  return total / count;
};

test("every read and every score is finite and inside the rating bounds", () => {
  const { min, max } = CPU_DRAFT_SCOUTING.ratingBounds;
  for (const teamId of TEAMS) {
    const accuracy = clubScoutingAccuracy({ leagueKey: LEAGUE, teamId, scoutingWeeklyBonus: 0 });
    assert.ok(Number.isFinite(accuracy) && accuracy >= 0.1 && accuracy <= 0.92, `accuracy ${accuracy}`);
    for (let index = 0; index < 40; index += 1) {
      const subject = prospect(index, { round: (index % 7) + 1, overall: 50 + index, potential: 60 + index, publicOverall: 45 + index });
      const read = clubScoutedRead({ prospect: subject, leagueKey: LEAGUE, teamId, draftYear: 2027, accuracy, publicPotential: 55 + index });
      for (const value of [read.overall, read.potential, read.confidence, read.convergence]) assert.ok(Number.isFinite(value));
      assert.ok(read.overall >= min && read.overall <= max);
      assert.ok(read.potential >= min && read.potential <= max);
      for (const archetypeLabel of [null, "Win-Now", "Gut-Feel", "Loyalty", "Moneyball", "Unknown"]) {
        assert.ok(Number.isFinite(draftReadValue({ read, age: subject.age, archetypeLabel })));
      }
    }
  }
});

test("a read is derived, not drawn: same inputs give the same read in any call order", () => {
  const args = (teamId, index) => ({ prospect: prospect(index, { publicOverall: 76 }), leagueKey: LEAGUE, teamId, draftYear: 2027, accuracy: 0.5, publicPotential: 84 });
  const forward = TEAMS.flatMap((teamId) => [0, 1, 2].map((index) => clubScoutedRead(args(teamId, index))));
  const backward = [...TEAMS].reverse().flatMap((teamId) => [2, 1, 0].map((index) => clubScoutedRead(args(teamId, index)))).reverse();
  assert.deepEqual(forward, backward);
  // Another league, another draft year and another club are all different reads of the same player.
  const base = clubScoutedRead(args("T01", 0));
  assert.notEqual(clubScoutedRead({ ...args("T01", 0), leagueKey: "Lother" }).overall, base.overall);
  assert.notEqual(clubScoutedRead({ ...args("T01", 0), draftYear: 2028 }).overall, base.overall);
  assert.notEqual(clubScoutedRead(args("T02", 0)).overall, base.overall);
});

test("clubs are not one constant scout: accuracy is spread across the league and rises with the scouting environment", () => {
  const values = TEAMS.map((teamId) => clubScoutingAccuracy({ leagueKey: LEAGUE, teamId }));
  assert.ok(new Set(values.map((value) => value.toFixed(3))).size >= 28, "32 clubs must not collapse onto a few values");
  assert.ok(Math.max(...values) - Math.min(...values) >= 0.3, `spread ${Math.max(...values) - Math.min(...values)}`);
  assert.deepEqual(values, TEAMS.map((teamId) => clubScoutingAccuracy({ leagueKey: LEAGUE, teamId })), "persistent for the life of the league");
  for (const teamId of TEAMS.slice(0, 6)) {
    assert.ok(
      clubScoutingAccuracy({ leagueKey: LEAGUE, teamId, scoutingWeeklyBonus: 6 }) > clubScoutingAccuracy({ leagueKey: LEAGUE, teamId, scoutingWeeklyBonus: -2 })
    );
  }
});

test("the error shrinks with scouting confidence and with club accuracy", () => {
  assert.ok(prospectScoutingConfidence(prospect(0, { round: 1 })) > prospectScoutingConfidence(prospect(0, { round: 4 })));
  assert.ok(prospectScoutingConfidence(prospect(0, { round: 4 })) > prospectScoutingConfidence(prospect(0, { round: 7 })));
  assert.ok(scoutingConvergence(0.6, 1) > scoutingConvergence(0.6, 0.25));
  // Population: 400 synthetic prospects per cell, public board off by 6 points, one club.
  const early = meanAbsOverallError({ round: 1, accuracy: 0.6 });
  const late = meanAbsOverallError({ round: 7, accuracy: 0.6 });
  assert.ok(early < late - 0.5, `round 1 error ${early} must be clearly below round 7 error ${late}`);
  const sharp = meanAbsOverallError({ round: 3, accuracy: 0.9 });
  const dull = meanAbsOverallError({ round: 3, accuracy: 0.2 });
  assert.ok(sharp < dull - 1, `an accurate club's error ${sharp} must be clearly below a poor club's ${dull}`);
  assert.ok(dull > 3, `a poor club must actually miss (${dull})`);
});

test("rebuilding fronts pay for the younger ceiling and win-now fronts for the finished player", () => {
  const youngCeiling = { read: { overall: 70, potential: 86 }, age: 21 };
  const finished = { read: { overall: 73, potential: 74 }, age: 23 };
  const value = (subject, archetypeLabel) => draftReadValue({ ...subject, archetypeLabel });
  assert.ok(value(youngCeiling, "Moneyball") > value(finished, "Moneyball"), "Moneyball takes the ceiling");
  assert.ok(value(youngCeiling, "Loyalty") > value(finished, "Loyalty"), "Loyalty takes the ceiling");
  assert.ok(value(finished, "Win-Now") > value(youngCeiling, "Win-Now"), "Win-Now takes the finished player");
  assert.ok(value(finished, "Gut-Feel") > value(youngCeiling, "Gut-Feel"), "Gut-Feel takes the finished player");
  // Age alone moves the two ends in opposite directions.
  const same = { overall: 72, potential: 78 };
  assert.ok(value({ read: same, age: 21 }, "Moneyball") > value({ read: same, age: 23 }, "Moneyball"));
  assert.ok(value({ read: same, age: 21 }, "Win-Now") < value({ read: same, age: 23 }, "Win-Now"));
  // Believed overall still leads: no persona prefers a clearly worse player for his age or ceiling alone.
  for (const archetypeLabel of [null, "Win-Now", "Gut-Feel", "Loyalty", "Moneyball"]) {
    assert.ok(value({ read: { overall: 82, potential: 83 }, age: 23 }, archetypeLabel) > value({ read: { overall: 70, potential: 80 }, age: 21 }, archetypeLabel));
  }
});

test("missing scouting fields fall back to declared defaults; a corrupt truth throws instead of scoring NaN", () => {
  const bare = { id: "bare", overall: 71, potential: 79, age: 22 };
  const read = clubScoutedRead({ prospect: bare, leagueKey: LEAGUE, teamId: "T03", draftYear: 2027, accuracy: 0.5 });
  assert.ok(Number.isFinite(read.overall) && Number.isFinite(read.potential));
  assert.equal(read.confidence, CPU_DRAFT_SCOUTING.confidenceFloor, "an unprojected prospect is the least-known kind");
  const noPotential = clubScoutedRead({ prospect: { id: "np", overall: 71, scouting: {} }, leagueKey: LEAGUE, teamId: "T03", draftYear: 2027, accuracy: 0.5 });
  assert.ok(Number.isFinite(noPotential.potential));
  const odd = clubScoutedRead({
    prospect: { id: "odd", overall: 71, potential: 80, scouting: { projectedRound: "x", scoutedOverall: NaN } },
    leagueKey: undefined, teamId: undefined, draftYear: undefined, accuracy: undefined, publicPotential: NaN
  });
  assert.ok(Number.isFinite(odd.overall) && Number.isFinite(odd.potential));
  assert.ok(Number.isFinite(draftReadValue({ read: { overall: 70 }, age: undefined, archetypeLabel: undefined })));
  assert.throws(() => clubScoutedRead({ prospect: { id: "nan", overall: NaN, potential: 80 }, leagueKey: LEAGUE, teamId: "T03", draftYear: 2027, accuracy: 0.5 }), TypeError);
  assert.throws(() => draftReadValue({ read: { overall: NaN, potential: 80 }, age: 22 }), TypeError);
});

// ── Through the real draft path ───────────────────────────────────────────────
//
// One league, one two-man board, every CPU club put on the clock in turn. Both
// prospects play the same position, are the same age and have the same
// projection, so need, depth, projection and age are equal and only the read
// separates them. The public board has them backwards: the true 80 is listed
// at 68 and the true 70 at 80.
//
// Negative control (run against the pre-change scoring, restored from a file
// copy): every club took the true 80, because the score read `prospect.overall`
// and a 20-point score gap is beyond the +/-4 jitter. `fooled` was 0 and the
// first assertion below failed.
function consensusMissBoard() {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const draft = session.prepareDraft();
  const source = draft.available.find((entry) => entry.position === "WR");
  const cpuClubs = session.league.teams.map((team) => team.id).filter((teamId) => teamId !== "BUF");
  const outcomes = [];
  for (const teamId of cpuClubs) {
    const make = (suffix, overall, publicOverall) => ({
      ...structuredClone(source),
      id: `${suffix}-${teamId}`,
      overall,
      potential: overall,
      age: 22,
      scouting: { ...source.scouting, projectedRound: 1, scoutedOverall: publicOverall }
    });
    const better = make("true80", 80, 68);
    const worse = make("true70", 70, 80);
    draft.available = [worse, better];
    draft.selections = [];
    draft.completed = false;
    draft.currentPick = 1;
    draft.order[0] = teamId;
    if (draft.slots?.[0]) draft.slots[0].teamId = teamId;
    const result = session.runCpuDraft({ picks: 1, untilUserPick: false });
    assert.equal(result.ok, true);
    outcomes.push({ teamId, tookBetter: draft.selections[0].playerId === better.id });
  }
  return outcomes;
}

test("CPU clubs draft on what their scouts believe: a consensus miss fools some front offices and not others", () => {
  const outcomes = consensusMissBoard();
  const fooled = outcomes.filter((row) => !row.tookBetter).length;
  const sawThrough = outcomes.length - fooled;
  assert.equal(outcomes.length, 31);
  assert.ok(fooled >= 3, `the old scoring took the true 80 every time; now ${fooled} of 31 clubs are fooled`);
  assert.ok(sawThrough >= 3, `clubs must differ: ${sawThrough} of 31 saw through the public board`);
  assert.deepEqual(consensusMissBoard(), outcomes, "the same league makes the same picks");
});

test("a delegated pick for the user's club reads the user's own board, not the true rating", () => {
  // Same two-man board, user's club on the clock. Untouched, the board says
  // the true 70 is the better player, so the delegated pick takes him: handing
  // the pick to the CPU is not a way around the fog. Once the user's scouts
  // have evaluated the true 80 (a private evaluation), the delegated pick uses it.
  for (const scouted of [false, true]) {
    const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
    session.phase = "offseason";
    const draft = session.prepareDraft();
    const source = draft.available.find((entry) => entry.position === "WR");
    const make = (id, overall, publicOverall) => ({
      ...structuredClone(source), id, overall, potential: overall, age: 22,
      scouting: { ...source.scouting, projectedRound: 1, scoutedOverall: publicOverall }
    });
    const better = make("user-true80", 80, 68);
    const worse = make("user-true70", 70, 80);
    draft.available = [worse, better];
    draft.currentPick = 1;
    draft.order[0] = "BUF";
    if (draft.slots?.[0]) draft.slots[0].teamId = "BUF";
    // 88, not 81: the gap has to clear the +/-4 event-day jitter on each score.
    if (scouted) session.ensureScoutingTeamState("BUF").evaluations[better.id] = 88;
    session.runCpuDraft({ picks: 1, untilUserPick: false });
    assert.equal(draft.selections[0].playerId, scouted ? better.id : worse.id);
  }
});

test("the league still drafts on quality: pick order tracks true overall in a full draft", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const draft = session.prepareDraft();
  session.runCpuDraft({ untilUserPick: false });
  // Population: every selection by a non-user club in this one draft, rounds 1-7.
  const picks = draft.selections.filter((row) => row.teamId !== "BUF");
  assert.ok(picks.length > 200);
  const mean = (rows) => rows.reduce((sum, row) => sum + row.overall, 0) / rows.length;
  const firstRound = mean(picks.filter((row) => row.round === 1));
  const thirdRound = mean(picks.filter((row) => row.round === 3));
  const lateRounds = mean(picks.filter((row) => row.round >= 6));
  assert.ok(firstRound > thirdRound + 2, `round 1 (${firstRound}) must clearly beat round 3 (${thirdRound})`);
  assert.ok(thirdRound > lateRounds + 2, `round 3 (${thirdRound}) must clearly beat rounds 6-7 (${lateRounds})`);
  for (const row of picks) assert.ok(Number.isFinite(row.overall) && Number.isFinite(row.potential));
});
