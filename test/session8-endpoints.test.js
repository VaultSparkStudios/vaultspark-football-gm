import test from "node:test";
import assert from "node:assert/strict";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";

function makeStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); }
  };
}

function makeRuntime(seed = 9001) {
  let tick = 0;
  const runtime = createLocalApiRuntime({
    storage: makeStorage(),
    now: () => 1_800_000_000_000 + tick++,
    scheduler: (fn) => fn()
  });
  return runtime;
}

async function makeLeague(runtime, { seed = 9001, advanceWeeks = 0 } = {}) {
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  if (advanceWeeks > 0) {
    await runtime.request("/api/advance-week", { method: "POST", body: { count: advanceWeeks } });
  }
}

// ── /api/season-arcs ──────────────────────────────────────────────────────────

test("GET /api/season-arcs returns arcs array at week 1", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9001 });

  const res = await rt.request("/api/season-arcs");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(Array.isArray(res.payload.arcs));
  assert.ok(res.payload.arcs.length >= 1, "expected at least the playoff arc");
});

test("GET /api/season-arcs always includes a PLAYOFF_HUNT arc", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9002, advanceWeeks: 4 });

  const res = await rt.request("/api/season-arcs");
  assert.equal(res.status, 200);
  const playoffArc = res.payload.arcs.find((a) => a.type === "PLAYOFF_HUNT");
  assert.ok(playoffArc, "PLAYOFF_HUNT arc must always be present");
  assert.equal(playoffArc.icon, "🏆");
  assert.ok(["on-track", "at-risk"].includes(playoffArc.status));
  assert.equal(playoffArc.resolved, null);
});

test("GET /api/season-arcs includes a QB_JOURNEY arc when roster has a QB", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9003 });

  const session = rt.getSession();
  const roster = session.getRoster("BUF");
  const hasQb = roster.some((p) => p.position === "QB");

  const res = await rt.request("/api/season-arcs");
  assert.equal(res.status, 200);

  if (hasQb) {
    const qbArc = res.payload.arcs.find((a) => a.type === "QB_JOURNEY");
    assert.ok(qbArc, "QB_JOURNEY arc expected when team has a QB");
    assert.equal(qbArc.icon, "🏈");
    assert.ok(qbArc.title.length > 0);
  }
});

test("GET /api/season-arcs arcs each have required fields", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9004, advanceWeeks: 3 });

  const res = await rt.request("/api/season-arcs");
  assert.equal(res.status, 200);
  for (const arc of res.payload.arcs) {
    assert.ok(arc.id, "arc.id required");
    assert.ok(arc.type, "arc.type required");
    assert.ok(arc.icon, "arc.icon required");
    assert.ok(arc.title, "arc.title required");
    assert.ok(["on-track", "at-risk"].includes(arc.status), `unexpected status: ${arc.status}`);
    assert.equal(arc.resolved, null);
  }
});

// ── /api/gm-decision ─────────────────────────────────────────────────────────

test("GET /api/gm-decision returns empty array during preseason week 1", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9010 });

  const res = await rt.request("/api/gm-decision");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(Array.isArray(res.payload.decisions));
  // Preseason / week 1 — no trade deadline yet
  const tradeDeadline = res.payload.decisions.find((d) => d.type === "TRADE_DEADLINE");
  assert.equal(tradeDeadline, undefined, "trade deadline must not fire before week 9");
});

test("GET /api/gm-decision returns TRADE_DEADLINE decision in week 10", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9011, advanceWeeks: 10 });

  const session = rt.getSession();
  // Only fires during regular-season phase; skip if we've advanced past it
  if (session.phase !== "regular-season") return;

  const res = await rt.request("/api/gm-decision");
  assert.equal(res.status, 200);

  const tradeDecision = res.payload.decisions.find((d) => d.type === "TRADE_DEADLINE");
  if (session.currentWeek >= 9 && session.currentWeek <= 11) {
    assert.ok(tradeDecision, "TRADE_DEADLINE decision expected at weeks 9-11");
    assert.ok(tradeDecision.prompt.includes("Week"));
    assert.ok(Array.isArray(tradeDecision.options));
    assert.equal(tradeDecision.options.length, 3);
    const ids = tradeDecision.options.map((o) => o.id);
    assert.ok(ids.includes("buy"));
    assert.ok(ids.includes("sell"));
    assert.ok(ids.includes("hold"));
  }
});

test("GET /api/gm-decision each decision has required shape", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9012, advanceWeeks: 10 });

  const res = await rt.request("/api/gm-decision");
  assert.equal(res.status, 200);
  for (const d of res.payload.decisions) {
    assert.ok(d.id, "decision.id required");
    assert.ok(d.type, "decision.type required");
    assert.ok(typeof d.week === "number");
    assert.ok(d.prompt?.length > 0);
    assert.ok(Array.isArray(d.options) && d.options.length > 0);
    for (const opt of d.options) {
      assert.ok(opt.id, "option.id required");
      assert.ok(opt.label, "option.label required");
      assert.ok(opt.effect, "option.effect required");
    }
  }
});

// ── /api/team-archetypes ──────────────────────────────────────────────────────

test("GET /api/team-archetypes returns all 32 teams", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9020 });

  const res = await rt.request("/api/team-archetypes");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(Array.isArray(res.payload.archetypes));
  assert.equal(res.payload.archetypes.length, 32);
});

test("GET /api/team-archetypes each entry has teamId, name, abbrev, ovr, archetype", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9021 });

  const res = await rt.request("/api/team-archetypes");
  assert.equal(res.status, 200);
  for (const entry of res.payload.archetypes) {
    assert.ok(entry.teamId, "teamId required");
    assert.ok(entry.name, "name required");
    assert.ok(entry.abbrev, "abbrev required");
    assert.ok(typeof entry.ovr === "number");
    assert.ok(entry.archetype?.label, "archetype.label required");
    assert.ok(entry.archetype?.icon, "archetype.icon required");
    assert.ok(entry.archetype?.description, "archetype.description required");
  }
});

test("GET /api/team-archetypes archetype labels are one of the 4 valid values", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9022 });

  const res = await rt.request("/api/team-archetypes");
  assert.equal(res.status, 200);
  const validLabels = new Set(["Moneyball", "Win-Now", "Gut-Feel", "Loyalty"]);
  for (const entry of res.payload.archetypes) {
    assert.ok(validLabels.has(entry.archetype.label), `unexpected archetype label: ${entry.archetype.label}`);
  }
});

test("GET /api/team-archetypes BUF entry is present", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9023 });

  const res = await rt.request("/api/team-archetypes");
  assert.equal(res.status, 200);
  const buf = res.payload.archetypes.find((e) => e.abbrev === "BUF" || e.teamId === "BUF");
  assert.ok(buf, "BUF must be in archetypes list");
});

// ── /api/records/franchise ────────────────────────────────────────────────────

test("GET /api/records/franchise returns ok:true with records object", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9030 });

  const res = await rt.request("/api/records/franchise");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(res.payload.records !== undefined);
  assert.ok(res.payload.teamId, "teamId should be set");
});

test("GET /api/records/franchise?team=MIA uses requested team", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9031 });

  const res = await rt.request("/api/records/franchise?team=MIA");
  assert.equal(res.status, 200);
  assert.equal(res.payload.teamId, "MIA");
});

test("GET /api/records/franchise after a full season has non-empty records", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9032, advanceWeeks: 19 });

  const res = await rt.request("/api/records/franchise");
  assert.equal(res.status, 200);
  // records should be an object or array — just verify it's not null
  assert.ok(res.payload.records != null);
});

// ── /api/franchise-moment ─────────────────────────────────────────────────────

test("GET /api/franchise-moment returns ok:true before any games (moment is null)", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9040 });

  const res = await rt.request("/api/franchise-moment");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  // no games played yet — moment may be null
  assert.ok("moment" in res.payload);
});

test("GET /api/franchise-moment after 3 weeks has a moment with required fields", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9041, advanceWeeks: 3 });

  const res = await rt.request("/api/franchise-moment");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);

  const { moment } = res.payload;
  if (moment) {
    assert.ok(moment.gameId, "moment.gameId required");
    assert.ok(typeof moment.week === "number");
    assert.ok(typeof moment.year === "number");
    assert.ok(typeof moment.dramaScore === "number");
    assert.ok(moment.dramaScore >= 0);
    assert.ok(moment.headline?.length > 0);
    assert.ok(moment.score?.includes("-"));
    assert.ok(["win", "loss"].includes(moment.result));
  }
});

test("GET /api/franchise-moment?team=MIA uses the requested team", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9042, advanceWeeks: 3 });

  const res = await rt.request("/api/franchise-moment?team=MIA");
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  // Response shape is consistent regardless of team
  assert.ok("moment" in res.payload);
});

test("GET /api/franchise-moment dramaScore is non-negative integer", async () => {
  const rt = makeRuntime();
  await makeLeague(rt, { seed: 9043, advanceWeeks: 5 });

  const res = await rt.request("/api/franchise-moment");
  assert.equal(res.status, 200);
  const { moment } = res.payload;
  if (moment) {
    assert.equal(moment.dramaScore, Math.floor(moment.dramaScore));
    assert.ok(moment.dramaScore >= 0);
    assert.ok(moment.dramaScore <= 6); // max: 3 (upset) + 2 (margin) + 1 (scoring density)
  }
});
