import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { derivedRng, fnv1a } from "../src/utils/rng.js";
import { composeWeeklyPlan, describeWeeklyPlanReceipt, BYE_WEEK_BEAT } from "../public/lib/weeklyPlanComposer.js";

// ── the derived source itself ─────────────────────────────────────────────────
//
// The reason coaches were indistinguishable survived the naming fix: `pick` and
// `int` reduced their range with `hash % n`, keeping only FNV-1a's low bits.
// For a power-of-two `n` that is a bit mask, and near-identical seed keys —
// which is precisely what per-team, per-role keys are — collide badly in it.

const TEAM_KEYS = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB",
  "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
  "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"
];
const POOL_16 = Array.from({ length: 16 }, (unused, i) => `option-${i}`);

const NAME_KEY = (team) => `staff|y2026|${team}|name|headCoach`;

// The statistic that matters is the one a name actually uses: TWO draws off the
// same key's stream. 32 keys drawing a pair from a 16-item pool have 256
// combinations available, so an uncorrelated source yields about 30 distinct
// pairs. This is the measurement that exposed the defect.
function distinctPairs(pick) {
  return new Set(TEAM_KEYS.map((team) => pick(team))).size;
}

test("two draws off sibling keys produce nearly independent pairs", () => {
  const distinct = distinctPairs((team) => {
    const rng = derivedRng(NAME_KEY(team));
    return `${rng.pick(POOL_16)}/${rng.pick(POOL_16)}`;
  });
  assert.ok(
    distinct >= 26,
    `only ${distinct} of 32 sibling keys produced a distinct pair; about 30 is what independence predicts`
  );
});

// NEGATIVE CONTROL — the pre-S102 reduction, written out rather than restored
// in the source, so this control cannot decay into a copy of the current code.
test("negative control: modulo range reduction clusters these keys badly", () => {
  const distinct = distinctPairs((team) => {
    const first = fnv1a(`${NAME_KEY(team)}#0`) % POOL_16.length;
    const second = fnv1a(`${NAME_KEY(team)}#1`) % POOL_16.length;
    return `${POOL_16[first]}/${POOL_16[second]}`;
  });
  assert.ok(
    distinct <= 20,
    `the low-bit reduction must demonstrably cluster (measured 13/32), or the test above proves nothing — got ${distinct}`
  );
});

test("the derived source stays deterministic and inside its bounds", () => {
  const a = derivedRng("determinism-probe");
  const b = derivedRng("determinism-probe");
  for (let i = 0; i < 50; i += 1) {
    const value = a.int(3, 9);
    assert.equal(value, b.int(3, 9), "the same key must replay the same sequence");
    assert.ok(value >= 3 && value <= 9, `int escaped its declared bounds: ${value}`);
  }
  assert.equal(derivedRng("k").int(5, 5), 5, "a degenerate range must return its only value");
  assert.equal(derivedRng("k").pick([]), undefined);
});

// ── S102 · coaches are people, and a bye is a week ────────────────────────────

const ROLE_LABELS = {
  headCoach: "Head Coach",
  offensiveCoordinator: "Offensive Coordinator",
  defensiveCoordinator: "Defensive Coordinator",
  scoutingDirector: "Scouting Director",
  capAnalyst: "Cap Analyst",
  strengthCoach: "Strength Coach",
  medicalDirector: "Medical Director"
};

test("no coach in the league is named after his job", () => {
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const offenders = [];
  for (const team of session.league.teams) {
    for (const [role, label] of Object.entries(ROLE_LABELS)) {
      const name = team.staff?.[role]?.name;
      assert.ok(name, `${team.id} ${role} has no name at all`);
      if (name === label) offenders.push(`${team.id}.${role}`);
    }
  }
  assert.deepEqual(offenders, [], "these coaches are still carrying their role label as a name");
});

test("head coaches are distinguishable from one another", () => {
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const names = session.league.teams.map((team) => team.staff.headCoach.name);
  const distinct = new Set(names);
  // Names come from a finite pool, so the odd collision is legitimate. The bar
  // is set from measurement, not taste: this reads 31/32 on three separate
  // seeds, and the pre-S102 derived source read 13/32. A threshold of 24 sits
  // clear of both — it cannot be met by a regression to the clustered source,
  // and it does not fail on an honest birthday collision or two.
  assert.ok(
    distinct.size >= 24,
    `only ${distinct.size} distinct head-coach names across ${names.length} teams: ${[...distinct].join(", ")}`
  );
});

test("coordinators get real names too, not only the head coach", () => {
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const coordinators = session.league.teams.flatMap((team) => [
    team.staff.offensiveCoordinator.name,
    team.staff.defensiveCoordinator.name
  ]);
  assert.ok(new Set(coordinators).size > 8, "coordinators are still sharing a handful of names");
});

test("staff identity is deterministic — the same league regenerates the same staff", () => {
  const names = () =>
    createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" }).league.teams.map(
      (team) => `${team.id}:${team.staff.headCoach.name}`
    );
  assert.deepEqual(names(), names(), "staff names must replay identically or a save cannot be reloaded");
});

test("a coaching name identifies a coach, which is what nodeForStaff assumes", () => {
  // `nodeForStaff` keys a coaching-tree node on (teamId, role, name). While the
  // name was a per-role constant it carried no information, so the identity was
  // really just (teamId, role).
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const keys = session.league.teams.map((team) => `${team.id}|HC|${team.staff.headCoach.name}`);
  assert.equal(new Set(keys).size, keys.length, "coaching-tree identities must be unique per team");
});

// ── the bye week ──────────────────────────────────────────────────────────────

function composerHarness({ onBye }) {
  const calls = { tactic: 0, checkpoints: [] };
  return {
    calls,
    run: () =>
      composeWeeklyPlan({
        phase: "regular-season",
        onBye,
        presetDecisionChoice: { decisionId: "d1", choiceId: "c1", occurrenceKey: "k1" },
        collectTactic: async () => {
          calls.tactic += 1;
          return "balanced";
        },
        onCheckpoint: (name) => calls.checkpoints.push(name)
      })
  };
}

test("a bye week does not demand a game plan against nobody", async () => {
  const harness = composerHarness({ onBye: true });
  const result = await harness.run();

  assert.equal(harness.calls.tactic, 0, "the tactic modal must not open on a week with no opponent");
  assert.equal(result.deferred, false);
  assert.equal(result.receipt.onBye, true);
  assert.equal(result.body.weeklyTacticOverride, undefined);
});

test("a bye week returns its own beat instead of nothing", async () => {
  const result = await composerHarness({ onBye: true }).run();

  assert.deepEqual(result.receipt.beat, BYE_WEEK_BEAT);
  assert.ok(result.receipt.compositionOrder.includes("bye"), "the receipt must record that the week was a bye");
  assert.equal(
    result.receipt.plan.explicitNoPlan,
    false,
    "a bye is not a refusal to plan — nobody was asked"
  );

  const described = describeWeeklyPlanReceipt(result.receipt);
  assert.match(described.title, /bye/i);
  assert.match(described.detail, /bye week/i);
  assert.doesNotMatch(described.detail, /explicit no-plan/i);
});

test("the bye fires a checkpoint, so the week is observable", async () => {
  const harness = composerHarness({ onBye: true });
  await harness.run();
  assert.ok(harness.calls.checkpoints.includes("bye-week-acknowledged"));
  assert.ok(!harness.calls.checkpoints.includes("tactic-resolved"));
});

// NEGATIVE CONTROL — an ordinary week must still demand the tactic, or the test
// above is passing because the composer stopped asking altogether.
test("negative control: an ordinary regular-season week still demands a tactic", async () => {
  const harness = composerHarness({ onBye: false });
  const result = await harness.run();

  assert.equal(harness.calls.tactic, 1, "a week with an opponent must still open the tactic step");
  assert.equal(result.receipt.onBye, false);
  assert.equal(result.receipt.beat, null);
  assert.equal(result.body.weeklyTacticOverride, "balanced");
  assert.ok(!result.receipt.compositionOrder.includes("bye"));
});

test("the engine, not the client cache, answers whether the team plays this week", () => {
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const dashboard = session.getDashboardState();
  assert.equal(typeof dashboard.controlledOnBye, "boolean", "the dashboard must state the fact, not omit it");

  const schedule = session.getScheduleWeek(session.currentWeek);
  assert.equal(
    dashboard.controlledOnBye,
    (schedule?.byeTeams || []).includes(session.controlledTeamId),
    "the dashboard flag must agree with the schedule it is derived from"
  );
});

test("the bye flag tracks the schedule across a whole season", () => {
  const session = createSession({ seed: 8121, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  let byeWeeks = 0;
  for (let week = 1; week <= 18; week += 1) {
    const schedule = session.getScheduleWeek(week);
    if ((schedule?.byeTeams || []).includes(session.controlledTeamId)) byeWeeks += 1;
  }
  assert.ok(byeWeeks >= 1, "an 18-week season with 17 games must contain a bye to report");
});
