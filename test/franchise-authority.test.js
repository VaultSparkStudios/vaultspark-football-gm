import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import {
  TEAM_SCOPED_COMMANDS,
  AUTHORITY_EXEMPT_COMMANDS,
  authorizedTeamIds,
  authorizeCommand
} from "../src/runtime/franchiseAuthority.js";
import { createLobby, addPlayerToLobby, queueIntent, applyIntents } from "../src/runtime/multiplayerSession.js";

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

async function bootRuntime(controlledTeamId = "BUF") {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let tick = 0; return () => 1_700_000_000_000 + tick++; })(),
    scheduler: (fn) => fn()
  });
  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 6363, startYear: 2026, controlledTeamId, mode: "play", eraProfile: "modern" }
  });
  assert.equal(created.status, 200, "league setup must succeed before authority checks");
  return runtime;
}

const readSource = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const POST_ROUTE_PATTERNS = {
  "src/server.js": /req\.method === "POST" && url\.pathname === "([^"]+)"/g,
  "src/app/api/localApiRuntime.js": /method === "POST" && pathname === "([^"]+)"/g
};

function postRoutesIn(relative) {
  const source = readSource(relative);
  const pattern = new RegExp(POST_ROUTE_PATTERNS[relative].source, "g");
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

// ── Completeness: the classification must be total ────────────────────────────
// This is the test that keeps the authority honest over time. A route added to
// either adapter later fails here until someone decides whether it carries
// franchise authority — so the seam cannot silently lose coverage the way the
// original hole was silently created.

test("every POST route in both adapters is classified as team-scoped or explicitly exempt", () => {
  for (const relative of Object.keys(POST_ROUTE_PATTERNS)) {
    const routes = postRoutesIn(relative);
    assert.ok(routes.size > 40, `${relative} should expose the full POST surface, saw ${routes.size}`);
    const unclassified = [...routes].filter(
      (route) => !TEAM_SCOPED_COMMANDS[route] && !AUTHORITY_EXEMPT_COMMANDS[route]
    );
    assert.deepEqual(
      unclassified,
      [],
      `${relative} has POST routes with no franchise-authority classification: ${unclassified.join(", ")}`
    );
  }
});

test("both adapters expose an identical POST surface, so one cannot be guarded and the other not", () => {
  const server = [...postRoutesIn("src/server.js")].sort();
  const local = [...postRoutesIn("src/app/api/localApiRuntime.js")].sort();
  assert.deepEqual(local, server);
});

test("classification carries no phantom routes and no overlap", () => {
  const live = new Set([...postRoutesIn("src/server.js"), ...postRoutesIn("src/app/api/localApiRuntime.js")]);
  for (const route of Object.keys(TEAM_SCOPED_COMMANDS)) {
    assert.ok(live.has(route), `TEAM_SCOPED_COMMANDS names a route that no adapter serves: ${route}`);
  }
  for (const route of Object.keys(AUTHORITY_EXEMPT_COMMANDS)) {
    assert.ok(live.has(route), `AUTHORITY_EXEMPT_COMMANDS names a route that no adapter serves: ${route}`);
    assert.ok(!TEAM_SCOPED_COMMANDS[route], `${route} cannot be both guarded and exempt`);
  }
  for (const reason of Object.values(AUTHORITY_EXEMPT_COMMANDS)) {
    assert.ok(String(reason).trim().length > 20, "every exemption must record a real reason");
  }
});

test("every exemption is deliberate: control-team defines authority and is never guarded", () => {
  assert.ok(AUTHORITY_EXEMPT_COMMANDS["/api/control-team"]);
  assert.ok(!TEAM_SCOPED_COMMANDS["/api/control-team"]);
});

// ── Pure authority semantics ──────────────────────────────────────────────────

test("authorizedTeamIds is the controlled team, plus every claimed team in a lobby", () => {
  const session = { controlledTeamId: "BUF" };
  assert.deepEqual([...authorizedTeamIds(session)], ["BUF"]);

  const lobby = {
    players: [{ controlledTeamId: "NYJ" }, { controlledTeamId: "MIA" }, { controlledTeamId: null }]
  };
  assert.deepEqual([...authorizedTeamIds(session, { lobby })].sort(), ["BUF", "MIA", "NYJ"]);
});

test("authorizeCommand allows the controlled team and denies every other franchise", () => {
  const session = { controlledTeamId: "BUF" };

  assert.equal(authorizeCommand({ session, route: "/api/staff", body: { teamId: "BUF" } }), null);
  assert.equal(authorizeCommand({ session, route: "/api/staff", body: { teamId: "buf" } }), null,
    "team ids are compared case-insensitively, as every route upper-cases them");

  const denial = authorizeCommand({ session, route: "/api/staff", body: { teamId: "NYJ" } });
  assert.equal(denial.status, 403);
  assert.equal(denial.payload.reasonCode, "team-authority");
  assert.equal(denial.payload.attemptedTeamId, "NYJ");
  assert.deepEqual(denial.payload.authorizedTeams, ["BUF"]);
  assert.match(denial.payload.error, /BUF/);
  assert.match(denial.payload.error, /NYJ/);
});

test("exempt and unknown routes are never denied", () => {
  const session = { controlledTeamId: "BUF" };
  assert.equal(authorizeCommand({ session, route: "/api/control-team", body: { teamId: "NYJ" } }), null);
  assert.equal(authorizeCommand({ session, route: "/api/advance-week", body: {} }), null);
});

test("a missing team field is left to the route's own validation, not turned into a 403", () => {
  const session = { controlledTeamId: "BUF" };
  assert.equal(authorizeCommand({ session, route: "/api/staff", body: {} }), null);
  assert.equal(authorizeCommand({ session, route: "/api/staff", body: null }), null);
});

test("trades require the controlled team to actually be in the trade", () => {
  const session = { controlledTeamId: "BUF" };
  const both = (teamA, teamB) => authorizeCommand({ session, route: "/api/trade", body: { teamA, teamB } });

  assert.equal(both("BUF", "NYJ"), null, "proposing side may be you");
  assert.equal(both("NYJ", "BUF"), null, "receiving side may be you");

  const brokered = both("NYJ", "MIA");
  assert.equal(brokered.status, 403, "brokering a trade between two rivals is not yours to make");
  assert.equal(brokered.payload.reasonCode, "team-authority");
});

// ── Adapter enforcement: the hole itself, closed ──────────────────────────────

test("the local adapter refuses to edit a rival's coaching staff or owner settings", async () => {
  const runtime = await bootRuntime("BUF");

  const staff = await runtime.request("/api/staff", {
    method: "POST",
    body: { teamId: "NYJ", role: "headCoach", playcalling: 40, development: 40, discipline: 40 }
  });
  assert.equal(staff.status, 403);
  assert.equal(staff.payload.reasonCode, "team-authority");

  const owner = await runtime.request("/api/owner", {
    method: "POST",
    body: { teamId: "NYJ", staffBudget: 10_000_000, ticketPrice: 450 }
  });
  assert.equal(owner.status, 403);
  assert.equal(owner.payload.reasonCode, "team-authority");
});

test("a rival's staff and owner state are provably unchanged after a denied write", async () => {
  const runtime = await bootRuntime("BUF");

  const before = await runtime.request("/api/staff?team=NYJ");
  assert.equal(before.status, 200);
  const beforeOwner = await runtime.request("/api/owner?team=NYJ");
  assert.equal(beforeOwner.status, 200);

  await runtime.request("/api/staff", {
    method: "POST",
    body: { teamId: "NYJ", role: "headCoach", name: "Saboteur", playcalling: 40, development: 40, discipline: 40 }
  });
  await runtime.request("/api/owner", {
    method: "POST",
    body: { teamId: "NYJ", staffBudget: 10_000_000, ticketPrice: 450 }
  });

  const after = await runtime.request("/api/staff?team=NYJ");
  const afterOwner = await runtime.request("/api/owner?team=NYJ");
  assert.deepEqual(after.payload.staff, before.payload.staff, "denied writes must not mutate");
  assert.equal(afterOwner.payload.owner.staffBudget, beforeOwner.payload.owner.staffBudget);
  assert.equal(afterOwner.payload.owner.ticketPrice, beforeOwner.payload.owner.ticketPrice);
});

test("the controlled team can still run its own franchise", async () => {
  const runtime = await bootRuntime("BUF");

  // Renaming your own staffer is cosmetic and stays open. Changing their ability
  // by hand does not — see the S63 coaching market. The authority seam must let
  // this through so the 400 below comes from the staff contract, not from a 403.
  const staff = await runtime.request("/api/staff", {
    method: "POST",
    body: { teamId: "BUF", role: "headCoach", name: "Own Coach" }
  });
  assert.equal(staff.status, 200, staff.payload?.error || "controlled-team staff rename must succeed");
  assert.equal(staff.payload.team.staff.headCoach.name, "Own Coach");

  const owner = await runtime.request("/api/owner", {
    method: "POST",
    body: { teamId: "BUF", staffBudget: 30_000_000, ticketPrice: 130 }
  });
  assert.equal(owner.status, 200, owner.payload?.error || "controlled-team owner write must succeed");
});

test("every team-scoped route denies a rival team through the live adapter", async () => {
  const runtime = await bootRuntime("BUF");
  // Minimal bodies: the authority seam runs before each route's field validation,
  // so a denial proves the guard fired rather than the route's own 400.
  const bodyFor = (route, rule) =>
    rule.participants ? { teamA: "NYJ", teamB: "MIA" } : { [rule.field]: "NYJ", playerId: "p-1", position: "QB", playerIds: [], role: "headCoach", plan: "standard", points: 1 };

  for (const [route, rule] of Object.entries(TEAM_SCOPED_COMMANDS)) {
    const response = await runtime.request(route, { method: "POST", body: bodyFor(route, rule) });
    assert.equal(response.status, 403, `${route} must deny a foreign franchise`);
    assert.equal(response.payload.reasonCode, "team-authority", `${route} must deny for the right reason`);
  }
});

test("both adapters route every guarded command through the same seam", () => {
  const server = readSource("src/server.js");
  const local = readSource("src/app/api/localApiRuntime.js");

  for (const source of [server, local]) {
    assert.match(source, /from "\.\.?\/(?:\.\.\/)*runtime\/franchiseAuthority\.js"/,
      "adapter must import the shared authority seam");
    assert.match(source, /authorizeCommand\(\{/, "adapter must call the shared authority seam");
  }
  // The guard is a single pre-dispatch call in each adapter, not a per-route
  // sprinkle that a new route could miss.
  assert.equal((server.match(/authorizeCommand\(\{/g) || []).length, 1);
  assert.equal((local.match(/authorizeCommand\(\{/g) || []).length, 1);
});

// ── CPU AI must stay free ─────────────────────────────────────────────────────

test("CPU AI maintenance still mutates rival teams — the guard is at the command layer only", async () => {
  const runtime = await bootRuntime("BUF");

  // Advancing the league runs AI maintenance for all 31 rival franchises. If the
  // guard had been placed inside GameSession, this would throw or silently no-op.
  const advanced = await runtime.request("/api/advance-week", { method: "POST", body: {} });
  assert.equal(advanced.status, 200, advanced.payload?.error || "league must still advance");

  const state = await runtime.request("/api/state");
  assert.equal(state.status, 200);
  assert.ok(state.payload.currentWeek >= 1);
});

test("GameSession itself carries no team-authority guard, so internal AI callers stay unblocked", () => {
  const gameSession = readSource("src/runtime/GameSession.js");
  assert.ok(
    !/reasonCode:\s*["']team-authority["']/.test(gameSession),
    "the authority boundary must not leak into GameSession, where CPU AI calls the same methods"
  );
});

// ── Multiplayer intent binding ────────────────────────────────────────────────

test("a lobby member's intent is bound to their own slot, not to the team they typed", async () => {
  const lobby = createLobby({ leagueId: "L1", commissionerId: "u1", leagueName: "Test" });
  addPlayerToLobby(lobby, { userId: "u1", displayName: "One", controlledTeamId: "BUF" });
  addPlayerToLobby(lobby, { userId: "u2", displayName: "Two", controlledTeamId: "NYJ" });

  // u1 tries to release a player from u2's roster.
  queueIntent(lobby, "u1", "release", { teamId: "NYJ", playerId: "p-9" });
  // u1 tries to broker a trade where they are not the proposing side.
  queueIntent(lobby, "u1", "trade", { teamA: "NYJ", teamB: "MIA", teamAPlayerIds: [], teamBPlayerIds: [] });

  const seen = [];
  const fakeSession = {
    async call(command, payload) {
      seen.push({ command, payload });
      return { ok: true };
    }
  };
  await applyIntents(lobby, fakeSession);

  assert.equal(seen[0].command, "release-player");
  assert.equal(seen[0].payload.teamId, "BUF", "release must act on the author's own franchise");
  assert.equal(seen[0].payload.playerId, "p-9", "the rest of the payload is untouched");

  assert.equal(seen[1].command, "propose-trade");
  assert.equal(seen[1].payload.teamA, "BUF", "the author is always the proposing side");
  assert.equal(seen[1].payload.teamB, "MIA", "the counterparty stays as submitted");
});

test("intent binding does not mutate the queued intent's recorded payload", async () => {
  const lobby = createLobby({ leagueId: "L2", commissionerId: "u1", leagueName: "Test" });
  addPlayerToLobby(lobby, { userId: "u1", displayName: "One", controlledTeamId: "BUF" });
  const intent = queueIntent(lobby, "u1", "release", { teamId: "NYJ", playerId: "p-3" });

  await applyIntents(lobby, { async call() { return { ok: true }; } });

  assert.equal(intent.payload.teamId, "NYJ", "the original request is preserved for audit");
  assert.equal(intent.controlledTeamId, "BUF", "the authoritative slot remains recorded");
});
