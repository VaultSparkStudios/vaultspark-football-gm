import test from "node:test";
import assert from "node:assert/strict";

import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import {
  OWNER_PATIENCE_FLOOR,
  decideOwnerVerdict,
  resolveCareerStakes
} from "../src/engine/ownerConfidence.js";
import {
  GM_CAREER_VERSION,
  buildJobOffers,
  createGmCareer,
  createTenure,
  normalizeGmCareer
} from "../src/engine/gmCareer.js";
import { DIFFICULTY_PRESETS } from "../src/config/leagueSetup.js";

/**
 * GM career: the firing rule, the command boundary that guards which club you
 * run, and the save round-trip of the career state.
 *
 * The rule itself is a pure function and is tested directly. Everything that
 * touches a league goes through the real adapter or a real GameSession — the
 * dismissed state in these tests is reached with the real "resign" command,
 * and the full losing-seasons path is driven in test/gm-career-dismissal.test.js.
 */

const stakesFor = (difficultyPreset, rulesPreset = "standard", extra = {}) =>
  resolveCareerStakes({ difficultyPreset, rulesPreset, challengeMode: "open", enableOwnerMode: true, ...extra });

// The worst case a general manager can present at a season review.
const worstCase = (stakes, overrides = {}) => ({
  stakes,
  patience: OWNER_PATIENCE_FLOOR,
  tenureSeasons: 3,
  ultimatumFailed: true,
  targetMissed: true,
  warned: true,
  flooredAtLastReview: true,
  ...overrides
});

// ── The rule ─────────────────────────────────────────────────────────────────

test("stakes resolve from the league's rules: Sandbox and Relaxed never fire, the rest do", () => {
  assert.equal(stakesFor("standard").firing, true);
  assert.equal(stakesFor("standard", "simulation").firing, true);
  assert.equal(stakesFor("hard").firing, true);
  assert.equal(stakesFor("brutal").firing, true);

  const relaxed = stakesFor("relaxed");
  assert.equal(relaxed.firing, false);
  assert.equal(relaxed.sternWarningOnly, true, "Relaxed keeps the owner's voice but not the consequence");

  for (const difficulty of Object.keys(DIFFICULTY_PRESETS)) {
    const sandbox = stakesFor(difficulty, "sandbox");
    assert.equal(sandbox.firing, false, `Sandbox rules never fire (${difficulty})`);
    assert.equal(sandbox.sternWarningOnly, false);
    assert.equal(sandbox.freeTeamSwitch, true);
  }
  assert.equal(stakesFor("standard").freeTeamSwitch, false);
  assert.equal(stakesFor("standard", "simulation").freeTeamSwitch, false);
  assert.equal(stakesFor("standard", "standard", { enableOwnerMode: false }).firing, false, "no owner mode, no owner to fire you");
  assert.equal(resolveCareerStakes({ difficultyPreset: "brutal", rulesPreset: "standard" }, { commissionerLobby: true }).firing, false);
});

test("harder difficulties move the dismissal line up by exactly their own patience gap", () => {
  const standard = stakesFor("standard");
  const hard = stakesFor("hard");
  const brutal = stakesFor("brutal");
  assert.equal(standard.dismissalLine, OWNER_PATIENCE_FLOOR, "Standard acts only once patience has run out");
  const gap = (id) => DIFFICULTY_PRESETS.standard.patch.ownerPatience - DIFFICULTY_PRESETS[id].patch.ownerPatience;
  assert.ok(Math.abs(hard.dismissalLine - (OWNER_PATIENCE_FLOOR + gap("hard"))) < 1e-9);
  assert.ok(Math.abs(brutal.dismissalLine - (OWNER_PATIENCE_FLOOR + gap("brutal"))) < 1e-9);
  assert.ok(standard.dismissalLine < hard.dismissalLine && hard.dismissalLine < brutal.dismissalLine);
  // The owner must be able to warn before he acts: the ultimatum opens at 0.35.
  assert.ok(brutal.dismissalLine < 0.35);

  // The same patience is safe on Standard and fatal on Hard — "sooner".
  const patience = hard.dismissalLine;
  assert.equal(decideOwnerVerdict(worstCase(standard, { patience })).action, "none");
  assert.equal(decideOwnerVerdict(worstCase(hard, { patience })).action, "dismiss");
});

test("a failed ultimatum at the patience floor is a dismissal under Standard, Hard and Brutal", () => {
  for (const difficulty of ["standard", "hard", "brutal"]) {
    const verdict = decideOwnerVerdict(worstCase(stakesFor(difficulty), { flooredAtLastReview: false }));
    assert.equal(verdict.action, "dismiss", difficulty);
    assert.equal(verdict.reason, "ultimatum-failed");
  }
});

test("patience left at the floor through one season review, then another missed target, is a dismissal", () => {
  const stakes = stakesFor("standard");
  const first = decideOwnerVerdict(worstCase(stakes, { ultimatumFailed: false, flooredAtLastReview: false, tenureSeasons: 2 }));
  assert.equal(first.action, "final-warning", "the first review at the floor is a warning, said out loud");
  assert.equal(first.reason, "patience-at-floor");
  const second = decideOwnerVerdict(worstCase(stakes, { ultimatumFailed: false, flooredAtLastReview: true }));
  assert.equal(second.action, "dismiss");
  assert.equal(second.reason, "patience-exhausted");
  const recovered = decideOwnerVerdict(worstCase(stakes, { ultimatumFailed: false, targetMissed: false }));
  assert.equal(recovered.action, "none", "meeting the target clears the grounds even at the floor");
});

test("never in the first season, on any difficulty", () => {
  for (const difficulty of Object.keys(DIFFICULTY_PRESETS)) {
    for (const tenureSeasons of [0, 1]) {
      const verdict = decideOwnerVerdict(worstCase(stakesFor(difficulty), { tenureSeasons }));
      assert.notEqual(verdict.action, "dismiss", `${difficulty} season ${tenureSeasons}`);
    }
  }
  assert.equal(decideOwnerVerdict(worstCase(stakesFor("brutal"), { tenureSeasons: 1 })).action, "final-warning");
});

test("never without a warning the player was shown first", () => {
  for (const difficulty of ["standard", "hard", "brutal"]) {
    const verdict = decideOwnerVerdict(worstCase(stakesFor(difficulty), { warned: false }));
    assert.equal(verdict.action, "final-warning", `${difficulty} must warn before it fires`);
  }
});

test("never under Sandbox rules or Relaxed difficulty — Relaxed gets a stern warning instead", () => {
  for (const difficulty of Object.keys(DIFFICULTY_PRESETS)) {
    assert.equal(decideOwnerVerdict(worstCase(stakesFor(difficulty, "sandbox"))).action, "none", `sandbox ${difficulty}`);
  }
  const relaxed = decideOwnerVerdict(worstCase(stakesFor("relaxed")));
  assert.equal(relaxed.action, "warning");
  for (const rulesPreset of ["standard", "simulation"]) {
    assert.equal(decideOwnerVerdict(worstCase(stakesFor("relaxed", rulesPreset))).action, "warning");
  }
});

test("patience above the line is never grounds, whatever else happened", () => {
  for (const difficulty of ["standard", "hard", "brutal"]) {
    const stakes = stakesFor(difficulty);
    const verdict = decideOwnerVerdict(worstCase(stakes, { patience: stakes.dismissalLine + 0.01 }));
    assert.equal(verdict.action, "none", difficulty);
  }
  for (const patience of [NaN, undefined, null, "soon"]) {
    assert.equal(decideOwnerVerdict(worstCase(stakesFor("standard"), { patience })).action, "none",
      `a patience of ${String(patience)} is not a number and can never be read as "at the floor"`);
  }
});

// ── The shape ────────────────────────────────────────────────────────────────

test("the career shape is declared once and survives damaged input", () => {
  const fresh = createGmCareer({ teamId: "BUF", startYear: 2026 });
  assert.deepEqual(fresh.tenure, createTenure({ teamId: "BUF", startYear: 2026 }));
  assert.equal(fresh.status, "employed");
  assert.equal(fresh.version, GM_CAREER_VERSION);

  for (const damaged of [null, undefined, 7, "x", {}, { status: "dismissed" }, { tenure: { warnings: "many", startYear: "soon" } }]) {
    const repaired = normalizeGmCareer(damaged, { teamId: "BUF", startYear: 2026 });
    assert.deepEqual(Object.keys(repaired).sort(), Object.keys(fresh).sort());
    assert.deepEqual(Object.keys(repaired.tenure).sort(), Object.keys(fresh.tenure).sort());
    assert.equal(repaired.status, "employed", "a dismissal with no dismissal record is not a dismissal");
    assert.equal(repaired.tenure.teamId, "BUF");
    assert.equal(repaired.tenure.startYear, 2026);
    assert.deepEqual(repaired.tenure.warnings, []);
  }
});

// ── The command boundary ─────────────────────────────────────────────────────

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

async function bootRuntime(settings = {}) {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let tick = 0; return () => 1_700_000_000_000 + tick++; })(),
    scheduler: (fn) => fn()
  });
  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 7171, startYear: 2026, controlledTeamId: "BUF", mode: "drive", eraProfile: "modern", ...settings }
  });
  assert.equal(created.status, 200, "league setup must succeed");
  return runtime;
}

const post = (runtime, route, body) => runtime.request(route, { method: "POST", body });

test("under Standard and Simulation rules a free team switch is refused at the boundary, with a reason", async () => {
  for (const rulesPreset of ["standard", "simulation"]) {
    const runtime = await bootRuntime({ rulesPreset });
    const before = await runtime.request("/api/state");
    assert.equal(before.payload.gmCareer.freeTeamSwitch, false);

    const refused = await post(runtime, "/api/control-team", { teamId: "NYJ" });
    assert.equal(refused.status, 403, rulesPreset);
    assert.equal(refused.payload.reasonCode, "team-switch-locked");
    assert.match(refused.payload.error, /job market/i);
    assert.match(refused.payload.error, /Sandbox/);

    const after = await runtime.request("/api/state");
    assert.equal(after.payload.controlledTeamId, "BUF", "a refused switch must not move the controlled club");

    const same = await post(runtime, "/api/control-team", { teamId: "BUF" });
    assert.equal(same.status, 200, "naming the club you already run is not a switch");
  }
});

test("under Sandbox rules the same switch succeeds", async () => {
  const runtime = await bootRuntime({ rulesPreset: "sandbox" });
  const before = await runtime.request("/api/state");
  assert.equal(before.payload.gmCareer.freeTeamSwitch, true);
  assert.equal(before.payload.gmCareer.firingEnabled, false);

  const switched = await post(runtime, "/api/control-team", { teamId: "NYJ" });
  assert.equal(switched.status, 200, switched.payload?.error);
  assert.equal(switched.payload.state.controlledTeamId, "NYJ");
  assert.equal(switched.payload.state.gmCareer.tenure.teamId, "NYJ", "the tenure follows the club");
  assert.equal(switched.payload.state.gmCareer.dismissed, false);
});

test("a job can be taken only from the market, and only one that was offered", async () => {
  const runtime = await bootRuntime();

  const early = await post(runtime, "/api/career", { action: "take-job", teamId: "NYJ" });
  assert.equal(early.status, 409, "an employed general manager is not on the market");
  assert.equal(early.payload.reasonCode, "career-not-on-market");

  const resigned = await post(runtime, "/api/career", { action: "resign" });
  assert.equal(resigned.status, 200, resigned.payload?.error);
  const career = resigned.payload.state.gmCareer;
  assert.equal(career.dismissed, true);
  assert.equal(career.dismissal.reason, "resigned");
  assert.equal(career.dismissal.teamId, "BUF");
  assert.ok(career.offers.length >= 3 && career.offers.length <= 5, `3-5 offers, saw ${career.offers.length}`);
  assert.ok(career.offers.every((offer) => offer.teamId !== "BUF"), "the club you just left is not hiring you back");
  for (const offer of career.offers) {
    assert.ok(offer.name && offer.kindLabel && offer.pitch && offer.capText && offer.expectation, "every card is fully described");
    assert.ok(Array.isArray(offer.recentRecords) && offer.recentRecords.length >= 1);
  }
  assert.equal(career.history[0].teamId, "BUF", "the finished tenure is in the career history");
  assert.equal(career.history[0].reason, "resigned");

  // Without a club: the league clock, the old club and free switching are all closed.
  const advance = await post(runtime, "/api/advance-week", {});
  assert.equal(advance.status, 409);
  assert.equal(advance.payload.reasonCode, "gm-dismissed");
  const meddle = await post(runtime, "/api/owner", { teamId: "BUF", ticketPrice: 130, staffBudget: 30_000_000 });
  assert.equal(meddle.status, 409);
  assert.equal(meddle.payload.reasonCode, "gm-dismissed");
  const sneak = await post(runtime, "/api/control-team", { teamId: career.offers[0].teamId });
  assert.equal(sneak.status, 409, "the job market is the only way to a new club");
  assert.equal(sneak.payload.reasonCode, "gm-dismissed");
  const twice = await post(runtime, "/api/career", { action: "resign" });
  assert.equal(twice.status, 409);

  const offered = new Set(career.offers.map((offer) => offer.teamId));
  const notOffered = resigned.payload.state.teams.map((team) => team.id).find((id) => id !== "BUF" && !offered.has(id));
  const denied = await post(runtime, "/api/career", { action: "take-job", teamId: notOffered });
  assert.equal(denied.status, 403);
  assert.equal(denied.payload.reasonCode, "job-not-offered");
  assert.equal((await runtime.request("/api/state")).payload.gmCareer.dismissed, true, "a denied job changes nothing");

  const chosen = career.offers[0].teamId;
  const hired = await post(runtime, "/api/career", { action: "take-job", teamId: chosen });
  assert.equal(hired.status, 200, hired.payload?.error);
  const state = hired.payload.state;
  assert.equal(state.controlledTeamId, chosen);
  assert.equal(state.gmCareer.dismissed, false);
  assert.equal(state.gmCareer.tenure.teamId, chosen);
  assert.equal(state.gmCareer.tenure.warnings, 0, "a new tenure starts with a clean sheet");
  assert.equal(state.ownerConfidence.patience, DIFFICULTY_PRESETS.standard.patch.ownerPatience, "and fresh owner patience");
  assert.equal(state.controlledTeam.owner.expectation.ultimatum, null);

  // The same league carries on under the new club.
  const next = await post(runtime, "/api/advance-week", {});
  assert.equal(next.status, 200, next.payload?.error);
  assert.equal(next.payload.state.controlledTeamId, chosen);
  const own = await post(runtime, "/api/owner", { teamId: chosen, ticketPrice: 130, staffBudget: 30_000_000 });
  assert.equal(own.status, 200, own.payload?.error);
  const old = await post(runtime, "/api/owner", { teamId: "BUF", ticketPrice: 130, staffBudget: 30_000_000 });
  assert.equal(old.status, 403, "the club you left is a rival now");
});

test("a stronger career record hears from better clubs than a poor one", () => {
  const session = new GameSession({ rng: new RNG(3131), startYear: 2026, controlledTeamId: "BUF", mode: "drive" });
  const rating = (offers) =>
    offers.reduce((sum, offer) => sum + session.league.teams.find((team) => team.id === offer.teamId).overallRating, 0) / offers.length;
  const legacyWith = (wins, losses, playoffs) => ({
    gmId: "player", seasonsServed: 4, totalWins: wins, totalLosses: losses, totalTies: 0,
    playoffAppearances: playoffs, superBowlWins: 0, capGradeTotal: 280, cultureGradeTotal: 280, tradeNetAV: 0, seasonHistory: []
  });

  session.league.gmLegacy = legacyWith(12, 56, 0);
  const poor = buildJobOffers(session, { excludeTeamId: "BUF" });
  session.league.gmLegacy = legacyWith(50, 18, 4);
  const strong = buildJobOffers(session, { excludeTeamId: "BUF" });

  assert.equal(poor.length, 3);
  assert.equal(strong.length, 5);
  assert.ok(poor.every((offer) => offer.kind === "rebuild"), "a poor record is offered rebuilding jobs");
  assert.ok(strong.some((offer) => offer.kind === "ready"), "a strong record is offered a club that can win now");
  assert.ok(rating(strong) > rating(poor), "and the stronger record's clubs are better rosters");
  assert.deepEqual(buildJobOffers(session, { excludeTeamId: "BUF" }), strong, "the market is deterministic");
});

// ── Save compatibility ───────────────────────────────────────────────────────

const roundTrip = (session) =>
  GameSession.fromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())), (seed) => new RNG(seed));

test("the career state round-trips through the save snapshot, mid-market and after a new job", () => {
  const session = new GameSession({ rng: new RNG(5252), startYear: 2026, controlledTeamId: "BUF", mode: "drive" });
  session.getGmCareer().tenure.warnings.push({ year: 2026, week: 9, kind: "ultimatum" });
  assert.equal(session.resignAsGm().ok, true);
  const before = session.getGmCareerState();
  assert.equal(before.dismissed, true);

  const restored = roundTrip(session);
  assert.deepEqual(restored.league.gmCareer, session.league.gmCareer, "the stored career is identical after a save and load");
  assert.deepEqual(restored.getGmCareerState(), before, "and so is everything the player is shown");

  const chosen = before.offers[0].teamId;
  assert.equal(restored.takeJobOffer(chosen).ok, true, "the restored league still honours its offers");
  const again = roundTrip(restored);
  assert.equal(again.controlledTeamId, chosen);
  assert.deepEqual(again.league.gmCareer, restored.league.gmCareer);
  assert.equal(again.getGmCareerState().history[0].teamId, "BUF");
});

test("a save from before careers existed loads employed, unwarned, and otherwise untouched", () => {
  const session = new GameSession({ rng: new RNG(6363), startYear: 2026, controlledTeamId: "BUF", mode: "drive" });
  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  delete snapshot.league.gmCareer;
  delete snapshot.league.commissionerLobby;
  // An old save with three seasons already on the career record: two at
  // another club, then one at the club it now controls.
  snapshot.league.gmLegacy = {
    gmId: "player", seasonsServed: 3, totalWins: 20, totalLosses: 31, totalTies: 0, playoffAppearances: 0,
    superBowlWins: 0, capGradeTotal: 180, cultureGradeTotal: 180, tradeNetAV: 0,
    seasonHistory: [
      { year: 2023, teamId: "NYJ", wins: 6, losses: 11, ties: 0, madePlayoffs: false, wonSuperBowl: false },
      { year: 2024, teamId: "NYJ", wins: 7, losses: 10, ties: 0, madePlayoffs: false, wonSuperBowl: false },
      { year: 2025, teamId: "BUF", wins: 7, losses: 10, ties: 0, madePlayoffs: false, wonSuperBowl: false }
    ]
  };
  const patienceBefore = snapshot.league.teams.find((team) => team.id === "BUF").owner.patience;

  const restored = GameSession.fromSnapshot(snapshot, (seed) => new RNG(seed));
  const career = restored.getGmCareerState();
  assert.equal(career.status, "employed");
  assert.equal(career.dismissed, false);
  assert.equal(career.tenure.teamId, "BUF");
  assert.equal(career.tenure.startYear, 2025, "the tenure starts with the unbroken run at the current club");
  assert.equal(career.tenure.seasons, 1);
  assert.equal(career.tenure.warnings, 0, "no warning is on file, so the owner must warn before he can act");
  assert.deepEqual(career.history, []);
  assert.equal(restored.controlledTeamId, "BUF");
  assert.equal(restored.league.teams.find((team) => team.id === "BUF").owner.patience, patienceBefore, "nothing else in the save moves");
  assert.equal(restored.league.gmCareer.version, GM_CAREER_VERSION);

  // The rule decides by ruleset alone: an old Standard save locks the club, an old Sandbox save does not.
  assert.equal(career.freeTeamSwitch, false);
  restored.updateLeagueSettings({ rulesPreset: "sandbox" });
  assert.equal(restored.getGmCareerState().freeTeamSwitch, true);
});
