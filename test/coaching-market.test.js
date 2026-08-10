import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCoachingMarket,
  hireCoach,
  fireCoach,
  coachSalary,
  staffPayroll,
  staffBudgetSummary,
  firingCost,
  getCoachingMarketReceipts,
  MARKET_ROLE_KEYS
} from "../src/engine/coachingMarket.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

const ROLES = ["headCoach", "offensiveCoordinator", "defensiveCoordinator", "scoutingDirector", "capAnalyst", "strengthCoach", "medicalDirector"];

function staffer(value, years = 3, name = "Someone") {
  return { name, playcalling: value, development: value, discipline: value, yearsRemaining: years, specialty: null };
}

function fakeLeague({ budget = 28_000_000, cash = 150_000_000 } = {}) {
  const makeTeam = (id, value) => ({
    id,
    staff: Object.fromEntries(ROLES.map((role) => [role, staffer(value, 3, `${id} ${role}`)])),
    owner: { staffBudget: budget, cash, patience: 0.55, fanInterest: 70 }
  });
  return {
    currentYear: 2026,
    leagueId: "test-league",
    teams: [makeTeam("BUF", 70), makeTeam("NYJ", 88), makeTeam("MIA", 60)]
  };
}

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); }
  };
}

// ── Pricing ───────────────────────────────────────────────────────────────────

test("salary is a pure function of ratings, so existing saves need no migration", () => {
  const a = coachSalary(staffer(75), "headCoach");
  const b = coachSalary(staffer(75), "headCoach");
  assert.equal(a, b);
  assert.ok(a > 0);
  // A coach object from a save with no salary field still prices correctly.
  assert.ok(coachSalary({ playcalling: 80, development: 74, discipline: 71 }, "headCoach") > 0);
  assert.ok(coachSalary(undefined, "headCoach") > 0, "even a missing staffer must price, not throw");
});

test("better coaches cost more, and superlinearly", () => {
  const mid = coachSalary(staffer(70), "headCoach");
  const good = coachSalary(staffer(82), "headCoach");
  const elite = coachSalary(staffer(94), "headCoach");
  assert.ok(good > mid);
  assert.ok(elite > good);
  assert.ok(elite - good > good - mid, "the top of the market should be steep");
});

test("role weighting prices a head coach well above a cap analyst", () => {
  const hc = coachSalary(staffer(85), "headCoach");
  const oc = coachSalary(staffer(85), "offensiveCoordinator");
  const analyst = coachSalary(staffer(85), "capAnalyst");
  assert.ok(hc > oc && oc > analyst);
});

test("payroll and budget headroom derive from the live staff sheet", () => {
  const league = fakeLeague();
  const team = league.teams[0];
  const summary = staffBudgetSummary(team);
  assert.equal(summary.payroll, staffPayroll(team));
  assert.equal(summary.headroom, summary.budget - summary.payroll);
  assert.equal(typeof summary.overBudget, "boolean");
  assert.ok(summary.payroll > 0, "a full staff must cost something");
});

test("firing cost scales with the years left on the deal", () => {
  const short = firingCost(staffer(80, 1), "headCoach");
  const long = firingCost(staffer(80, 5), "headCoach");
  assert.ok(long > short * 3, "a fresh long deal must be expensive to walk away from");
});

// ── The market ────────────────────────────────────────────────────────────────

test("the market is derived, not rolled — refreshing cannot reroll it", () => {
  const league = fakeLeague();
  const first = buildCoachingMarket(league, "BUF", "headCoach");
  const second = buildCoachingMarket(league, "BUF", "headCoach");
  assert.deepEqual(second.candidates, first.candidates);

  // A different team, role or year is a genuinely different market.
  assert.notDeepEqual(
    buildCoachingMarket(league, "MIA", "headCoach").candidates.map((c) => c.name),
    first.candidates.map((c) => c.name)
  );
  assert.notDeepEqual(
    buildCoachingMarket(league, "BUF", "offensiveCoordinator").candidates.map((c) => c.name),
    first.candidates.map((c) => c.name)
  );
  league.currentYear = 2027;
  assert.notDeepEqual(
    buildCoachingMarket(league, "BUF", "headCoach").candidates.map((c) => c.name),
    first.candidates.map((c) => c.name)
  );
});

test("every role has a market, and unknown roles and teams are refused", () => {
  const league = fakeLeague();
  for (const role of MARKET_ROLE_KEYS) {
    const market = buildCoachingMarket(league, "BUF", role);
    assert.equal(market.ok, true, `${role} must have a market`);
    assert.ok(market.candidates.length > 0);
    for (const candidate of market.candidates) {
      assert.ok(candidate.name && candidate.name.includes(" "), "candidates are named people");
      assert.ok(candidate.salary > 0);
      assert.ok(candidate.yearsRequested >= 2 && candidate.yearsRequested <= 5);
      assert.ok(candidate.playcalling >= 40 && candidate.playcalling <= 99);
    }
  }
  assert.equal(buildCoachingMarket(league, "ZZZ", "headCoach").reasonCode, "market-no-team");
  assert.equal(buildCoachingMarket(league, "BUF", "waterBoy").reasonCode, "market-unknown-role");
});

test("strong rival coordinators appear as real, poachable head-coach candidates", () => {
  const league = fakeLeague();
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const promotions = market.candidates.filter((c) => c.origin === "coordinator");
  assert.ok(promotions.length > 0, "an 88-rated rival coordinator should be on the market");
  for (const row of promotions) {
    assert.equal(row.currentTeamId, "NYJ", "only the strong staff qualifies, not the 60-rated one");
    assert.ok(row.sourceRole, "a poach must know which chair it empties");
    assert.match(row.note, /ready for a building of his own/);
  }
});

test("the market states the incumbent's price and what leaving him costs", () => {
  const league = fakeLeague();
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  assert.ok(market.incumbent);
  assert.ok(market.incumbent.salary > 0);
  assert.ok(market.incumbent.firingCost > 0);
});

test("an unaffordable candidate says why, rather than silently disappearing", () => {
  const league = fakeLeague({ budget: 6_000_000 });
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const blocked = market.candidates.filter((c) => !c.affordable);
  assert.ok(blocked.length > 0, "a starved budget must block someone");
  for (const row of blocked) {
    assert.ok(row.blockedReason, "every block must explain itself");
    assert.match(row.blockedReason, /budget/);
  }
});

// ── Hiring ────────────────────────────────────────────────────────────────────

test("hiring installs the named candidate with his own ratings and contract", () => {
  const league = fakeLeague();
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const pick = market.candidates.find((c) => c.affordable);
  assert.ok(pick);

  const result = hireCoach(league, { teamId: "BUF", role: "headCoach", candidateId: pick.id });
  assert.equal(result.ok, true, result.error);

  const hired = league.teams[0].staff.headCoach;
  assert.equal(hired.name, pick.name);
  assert.equal(hired.playcalling, pick.playcalling);
  assert.equal(hired.yearsRemaining, pick.yearsRequested);
  assert.ok(result.receipt.reasons.length >= 2, "a hire states its salary and its cost");
});

test("hiring charges the outgoing coach's remaining deal to cash", () => {
  const league = fakeLeague();
  const before = league.teams[0].owner.cash;
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const pick = market.candidates.find((c) => c.affordable);

  const result = hireCoach(league, { teamId: "BUF", role: "headCoach", candidateId: pick.id });
  assert.ok(result.receipt.deadMoney > 0);
  assert.equal(league.teams[0].owner.cash, before - result.receipt.deadMoney);
});

test("a hire the budget cannot cover is refused with the reason", () => {
  const league = fakeLeague({ budget: 6_000_000 });
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const blocked = market.candidates.find((c) => !c.affordable);
  assert.ok(blocked);

  const result = hireCoach(league, { teamId: "BUF", role: "headCoach", candidateId: blocked.id });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "market-over-budget");
  assert.equal(league.teams[0].staff.headCoach.name, "BUF headCoach", "a refused hire changes nothing");
});

test("an unknown candidate is refused", () => {
  const league = fakeLeague();
  const result = hireCoach(league, { teamId: "BUF", role: "headCoach", candidateId: "not-a-real-id" });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "market-unknown-candidate");
});

test("poaching a coordinator leaves a real hole on the team he left", () => {
  const league = fakeLeague();
  const market = buildCoachingMarket(league, "BUF", "headCoach");
  const poach = market.candidates.find((c) => c.origin === "coordinator" && c.affordable);
  assert.ok(poach, "expected an affordable coordinator to poach");

  const source = league.teams.find((t) => t.id === poach.currentTeamId);
  const before = { ...source.staff[poach.sourceRole] };

  hireCoach(league, { teamId: "BUF", role: "headCoach", candidateId: poach.id });

  const after = source.staff[poach.sourceRole];
  assert.ok(after.playcalling < before.playcalling, "the vacated chair must actually get worse");
  assert.match(after.name, /Interim/);
  assert.equal(after.yearsRemaining, 1);
});

// ── Firing ────────────────────────────────────────────────────────────────────

test("firing installs a worse interim, charges dead money and costs owner patience", () => {
  const league = fakeLeague();
  const team = league.teams[0];
  const before = { ...team.staff.headCoach };
  const cashBefore = team.owner.cash;
  const patienceBefore = team.owner.patience;

  const result = fireCoach(league, { teamId: "BUF", role: "headCoach" });
  assert.equal(result.ok, true, result.error);
  assert.match(team.staff.headCoach.name, /Interim/);
  assert.ok(team.staff.headCoach.playcalling < before.playcalling);
  assert.ok(team.owner.cash < cashBefore);
  assert.ok(team.owner.patience < patienceBefore, "the owner reads a firing as instability");
  assert.ok(result.receipt.reasons.some((line) => /dead money/.test(line)));
});

test("firing refuses unknown teams and roles", () => {
  const league = fakeLeague();
  assert.equal(fireCoach(league, { teamId: "ZZZ", role: "headCoach" }).reasonCode, "market-no-team");
  assert.equal(fireCoach(league, { teamId: "BUF", role: "waterBoy" }).reasonCode, "market-unknown-role");
});

test("hires and fires accumulate a bounded receipt ledger", () => {
  const league = fakeLeague();
  fireCoach(league, { teamId: "BUF", role: "offensiveCoordinator" });
  fireCoach(league, { teamId: "BUF", role: "defensiveCoordinator" });
  const receipts = getCoachingMarketReceipts(league);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].type, "fire");
  assert.ok(receipts[0].year);
});

// ── The god-mode surface it replaces ──────────────────────────────────────────

test("staff ratings can no longer be typed in", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const before = { ...session.getStaff("BUF").staff.headCoach };

  const result = session.updateStaff({ teamId: "BUF", role: "headCoach", playcalling: 99, development: 99, discipline: 99 });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "staff-ratings-readonly");
  assert.match(result.error, /coaching market/);

  const after = session.getStaff("BUF").staff.headCoach;
  assert.equal(after.playcalling, before.playcalling, "a refused write changes nothing");
});

test("renaming a staffer is still allowed, and now actually persists", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const result = session.updateStaff({ teamId: "BUF", role: "headCoach", name: "Named By Me" });
  assert.equal(result.ok, true, result.error);

  // The coaching tree is the name authority for head coaches and used to revert
  // any rename on the next dashboard build. Prove it survives one.
  session.getDashboardState();
  assert.equal(session.getStaff("BUF").staff.headCoach.name, "Named By Me");
});

test("a hired head coach keeps his own name across a dashboard build", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const market = session.getCoachingMarket({ role: "headCoach" });
  const pick = market.candidates.find((c) => c.affordable);
  assert.ok(pick, "expected an affordable head-coach candidate");

  const hired = session.hireCoach({ role: "headCoach", candidateId: pick.id });
  assert.equal(hired.ok, true, hired.error);

  // Without the coaching-tree sync this reverted to the previous coach's name.
  session.getDashboardState();
  assert.equal(session.getStaff("BUF").staff.headCoach.name, pick.name);
});

test("hiring changes what the simulation actually sees", () => {
  const session = new GameSession({ rng: new RNG(4242), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const before = { ...session.getStaff("BUF").coaching };
  const market = session.getCoachingMarket({ role: "offensiveCoordinator" });
  const pick = market.candidates
    .filter((c) => c.affordable)
    .sort((a, b) => b.playcalling - a.playcalling)[0];
  assert.ok(pick);

  session.hireCoach({ role: "offensiveCoordinator", candidateId: pick.id });
  const after = session.getStaff("BUF").coaching;
  assert.notDeepEqual(after, before, "a coaching hire must reach team.coaching, not just the staff sheet");
});

// ── Adapters ──────────────────────────────────────────────────────────────────

test("both adapters serve the market and the authority seam guards it", async () => {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let t = 0; return () => 1_700_000_000_000 + t++; })(),
    scheduler: (fn) => fn()
  });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 6363, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });

  const market = await runtime.request("/api/coaching-market?role=headCoach");
  assert.equal(market.status, 200);
  assert.ok(market.payload.candidates.length > 0);
  assert.ok(market.payload.budget > 0);

  const foreign = await runtime.request("/api/coaching-market", {
    method: "POST",
    body: { teamId: "NYJ", role: "headCoach", action: "fire" }
  });
  assert.equal(foreign.status, 403, "you cannot fire a rival's coach");
  assert.equal(foreign.payload.reasonCode, "team-authority");

  const pick = market.payload.candidates.find((c) => c.affordable);
  const hire = await runtime.request("/api/coaching-market", {
    method: "POST",
    body: { teamId: "BUF", role: "headCoach", action: "hire", candidateId: pick.id }
  });
  assert.equal(hire.status, 200, hire.payload?.error);
  assert.equal(hire.payload.receipt.name, pick.name);
  assert.ok(hire.payload.state, "the response must carry fresh state for the browser");
  assert.ok(hire.payload.market, "and the refreshed market");
});

// ── Accessibility: hire/fire announcement (S78) ────────────────────────────
// coachingMarketPanel.js rewrites its mount node's innerHTML on every hire/fire,
// but the mount point itself carried no aria-live, so screen-reader users got
// no announcement of the result — unlike every sibling dynamically-rewritten
// panel in game.html (openingContractCard, pressRoomCard, dynastyTimelineContainer,
// etc.), which all carry aria-live="polite".
test("the coaching market panel's mount point is an aria-live region", () => {
  const gameHtmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "game.html");
  const html = fs.readFileSync(gameHtmlPath, "utf8");
  const match = html.match(/<section id="coachingMarketPanel"[^>]*>/);
  assert.ok(match, "coachingMarketPanel section must exist in game.html");
  assert.match(match[0], /aria-live="polite"/, "hire/fire rewrites must be announced to screen readers");
});
