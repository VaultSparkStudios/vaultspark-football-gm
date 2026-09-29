import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import {
  PERSONA_TRADE_TOLERANCE,
  PERSONA_AGE_HORIZON,
  TRADE_NEED_PREMIUM,
  TRADE_SURPLUS_DISCOUNT,
  buildTradeNeedProfile,
  evaluateTradeValue,
  isTradeValueAcceptable,
  isTradeValueAcceptableFlat,
  playerStrategyValue,
  resolvePersonaTradeTolerance
} from "../src/engine/aiTeamStrategy.js";
import { getRivalGmPersona } from "../src/engine/rivalGmPersona.js";

/**
 * S109 — rival GM personas never changed a rival decision. The header on
 * `rivalGmPersona.js` said so ("non-causal"), `rivalTradeOffers` read a persona
 * for `gmName` and `gmLine` only, and `isTradeValueAcceptable` judged every
 * club through one flat ±0.33 band with no notion of who was deciding or what
 * room they were short in. The persona now sets the band and the age horizon,
 * a quality-based need profile prices the incoming player, and the seam's own
 * need read rides on the offer rationale. None of it draws from the stream.
 */

const TEAM = { id: "MIA", name: "Miami", strategyProfile: "balanced", scheme: { passRate: 0.5, aggression: 0.5 } };

function player(overall, { age = 27, position = "WR", id = `${position}-${overall}-${age}` } = {}) {
  return { id, overall, age, position, contract: { capHit: 5_000_000, yearsRemaining: 2 }, schemeFit: 70, morale: 70 };
}

const persona = (style, traits = []) => ({ teamId: "MIA", name: `${style} GM`, style, traits });

// ── 1. Stream invariance ─────────────────────────────────────────────────────

test("the persona seam draws nothing: a session that evaluates trades keeps the twin's stream position", () => {
  const a = createSession({ seed: 8131, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const b = createSession({ seed: 8131, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  assert.equal(a.rng.seed, b.rng.seed, "twins start at the same position");

  const rivals = a.league.teams.filter((team) => team.id !== "BUF").slice(0, 4);
  let verdicts = 0;
  for (const rival of rivals) {
    const mine = a.league.players.filter((p) => p.teamId === "BUF" && p.status === "active").slice(0, 5);
    const theirs = a.league.players.filter((p) => p.teamId === rival.id && p.status === "active").slice(0, 5);
    for (const out of mine) {
      for (const inc of theirs) {
        const read = a.services.trades.evaluate({
          teamA: "BUF", teamB: rival.id, teamAPlayerIds: [out.id], teamBPlayerIds: [inc.id], teamAPickIds: [], teamBPickIds: []
        });
        // A cap-failed package never reaches the valuation seam and carries no receipt.
        if (!read.valuation?.[rival.id]) continue;
        assert.equal(read.valuation[rival.id].gmName, getRivalGmPersona(a.league, rival.id).name, "the verdict was the persona's");
        verdicts += 1;
      }
    }
  }
  assert.ok(verdicts >= 80, `exercised the seam (${verdicts} verdicts)`);
  assert.equal(a.rng.seed, b.rng.seed, `${verdicts} persona-judged verdicts moved the stream by zero draws`);

  // And the whole weekly path, where the seam is called by rival offers, stays deterministic.
  for (let week = 0; week < 3; week += 1) { a.advanceWeek(); b.advanceWeek(); }
  assert.equal(a.rng.seed, b.rng.seed, "three weeks of offers and verdicts land on the same position");
  assert.deepEqual(
    (a.league.inboundTradeOffers || []).map((row) => row.id),
    (b.league.inboundTradeOffers || []).map((row) => row.id)
  );
  const nextA = Array.from({ length: 5 }, () => a.rng.next());
  const nextB = Array.from({ length: 5 }, () => b.rng.next());
  assert.deepEqual(nextA, nextB, "the next five draws are the same draws");
});

// ── 2. Archetype changes the verdict ────────────────────────────────────────

test("the same package draws different verdicts from different personas", () => {
  // A 22% shortfall: inside the gambler's band, outside the hoarder's.
  const outgoing = [player(80)];
  const incoming = [player(62)];
  const winNow = evaluateTradeValue({ outgoing, incoming, team: TEAM, persona: persona("win-now") });
  const rebuild = evaluateTradeValue({ outgoing, incoming, team: TEAM, persona: persona("rebuild") });
  assert.equal(winNow.tolerance, PERSONA_TRADE_TOLERANCE["win-now"]);
  assert.equal(rebuild.tolerance, PERSONA_TRADE_TOLERANCE.rebuild);
  assert.equal(winNow.acceptable, true, `win-now accepts at ratio ${winNow.ratio.toFixed(3)}`);
  assert.equal(rebuild.acceptable, false, `rebuild refuses at ratio ${rebuild.ratio.toFixed(3)}`);
  assert.notEqual(
    isTradeValueAcceptable({ outgoing, incoming, team: TEAM, persona: persona("win-now") }),
    isTradeValueAcceptable({ outgoing, incoming, team: TEAM, persona: persona("rebuild") })
  );

  // Traits move the band on their own, so two balanced clubs still differ.
  const vault = resolvePersonaTradeTolerance({ persona: persona("balanced", ["guards the cap like a vault", "never forgets a lopsided deal"]) });
  const holiday = resolvePersonaTradeTolerance({ persona: persona("balanced", ["treats the deadline like a holiday"]) });
  assert.ok(vault < PERSONA_TRADE_TOLERANCE.balanced && holiday > PERSONA_TRADE_TOLERANCE.balanced);

  // The horizon is causal too: a win-now GM pays for prime years, a rebuilder for youth.
  const prime = player(78, { age: 27 });
  const kid = player(78, { age: 22 });
  const winNowPrefersPrime = playerStrategyValue(prime, TEAM, { persona: persona("win-now") }) / playerStrategyValue(kid, TEAM, { persona: persona("win-now") });
  const rebuildPrefersPrime = playerStrategyValue(prime, TEAM, { persona: persona("rebuild") }) / playerStrategyValue(kid, TEAM, { persona: persona("rebuild") });
  assert.ok(winNowPrefersPrime > rebuildPrefersPrime, "the same two players rank differently under the two horizons");
  assert.equal(PERSONA_AGE_HORIZON.balanced.youth, 1, "balanced is the identity, so depth charts are untouched");
  assert.equal(playerStrategyValue(prime, TEAM), playerStrategyValue(prime, TEAM, { persona: null }), "no persona, no change");

  // A derived persona (seed + team, no draw) is what the live seam passes.
  const league = { seed: 4242, teams: [{ id: "MIA", strategyProfile: "win-now" }, { id: "NYJ", strategyProfile: "rebuild" }] };
  assert.equal(evaluateTradeValue({ outgoing, incoming, team: TEAM, persona: getRivalGmPersona(league, "MIA") }).tolerance >= 0.4, true);
  assert.equal(evaluateTradeValue({ outgoing, incoming, team: TEAM, persona: getRivalGmPersona(league, "NYJ") }).acceptable, false);
});

// ── 3. Need-aware acceptance ────────────────────────────────────────────────

const NEEDS = [{ position: "DB", delta: -4.5 }, { position: "WR", delta: 3.2 }, { position: "OL", delta: 0.3 }];

test("a player at the rival's top need is accepted where the same value at a surplus room is refused, and the read says why", () => {
  const outgoing = [player(80, { position: "WR" })];
  const fillsNeed = evaluateTradeValue({ outgoing, incoming: [player(58, { position: "DB" })], team: TEAM, rosterNeeds: NEEDS });
  const fillsSurplus = evaluateTradeValue({ outgoing, incoming: [player(58, { position: "WR" })], team: TEAM, rosterNeeds: NEEDS });
  assert.equal(fillsNeed.acceptable, true, `need-filling package accepted at ratio ${fillsNeed.ratio.toFixed(3)}`);
  assert.equal(fillsSurplus.acceptable, false, `surplus package refused at ratio ${fillsSurplus.ratio.toFixed(3)}`);
  assert.match(fillsNeed.needRead, /MIA need a corner more than they need receiver depth/);
  assert.match(fillsSurplus.needRead, /already have receiver depth/);

  // The premium and discount are exactly the declared ones.
  const base = playerStrategyValue(player(58, { position: "DB" }), TEAM);
  assert.ok(Math.abs(fillsNeed.incomingValue - base * (1 + TRADE_NEED_PREMIUM)) < 1e-6);
  const baseWr = playerStrategyValue(player(58, { position: "WR" }), TEAM);
  assert.ok(Math.abs(fillsSurplus.incomingValue - baseWr * (1 - TRADE_SURPLUS_DISCOUNT)) < 1e-6);

  // A room inside the threshold is neither need nor surplus.
  const neutral = evaluateTradeValue({ outgoing, incoming: [player(58, { position: "OL" })], team: TEAM, rosterNeeds: NEEDS });
  assert.equal(neutral.needRead, null);
});

test("the live seam reads a quality-based need profile and puts the read on the rival's receipt and offer", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const profile = buildTradeNeedProfile(session.league, "MIA");
  assert.ok(profile.every((row) => row.position !== "K" && row.position !== "P"), "specialists are not trade needs");
  assert.ok(profile.every((row) => Number.isFinite(row.delta) && Number.isFinite(row.leagueTop)));
  // Counts-based needs are flat at template size; the quality read is not.
  assert.ok(profile.some((row) => row.delta !== 0), "the profile sees a real gap somewhere");

  // Find a rival whose top need a BUF player at that room could fill, and show the receipt names it.
  let named = null;
  for (const rival of session.league.teams.filter((team) => team.id !== "BUF")) {
    const needs = buildTradeNeedProfile(session.league, rival.id).filter((row) => row.delta <= -1).sort((a, b) => a.delta - b.delta);
    if (!needs.length) continue;
    const mine = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active" && p.position === needs[0].position);
    const theirs = session.league.players.find((p) => p.teamId === rival.id && p.status === "active" && p.position !== needs[0].position);
    if (!mine || !theirs) continue;
    const read = session.services.trades.evaluate({
      teamA: rival.id, teamB: "BUF", teamAPlayerIds: [theirs.id], teamBPlayerIds: [mine.id], teamAPickIds: [], teamBPickIds: []
    });
    if (read.valuation?.[rival.id]?.needRead) { named = { rival, read }; break; }
  }
  assert.ok(named, "some rival's receipt carries a need read");
  assert.match(named.read.valuation[named.rival.id].needRead, new RegExp(`^${named.rival.id} need a`));
  assert.equal(named.read.valuation.BUF.needRead, null, "the controlled club is judged by its GM, not a persona");
  assert.equal(named.read.valuation.BUF.gmName, null);
});

// ── 4. Negative control ─────────────────────────────────────────────────────

test("negative control: the pre-S109 flat band accepts the surplus package the need-aware gate refuses", () => {
  // The observed shape: a rival taking on a receiver at a room it already has covered,
  // priced only by the value ratio.
  const outgoing = [player(80, { position: "WR" })];
  const incoming = [player(58, { position: "WR" })];
  assert.equal(isTradeValueAcceptableFlat({ outgoing, incoming, team: TEAM }), true, "the flat band said yes");
  assert.equal(isTradeValueAcceptable({ outgoing, incoming, team: TEAM, rosterNeeds: NEEDS }), false, "the need-aware gate says no");
  // With no persona and no needs the new seam IS the flat band, so the control isolates the need term.
  assert.equal(isTradeValueAcceptable({ outgoing, incoming, team: TEAM }), isTradeValueAcceptableFlat({ outgoing, incoming, team: TEAM }));
});

// ── 5. Realism guard ────────────────────────────────────────────────────────

test("realism guard: seed 20260306 over 3 seasons trades inside a sane band and rival offers still arrive", () => {
  // There is no CPU-to-CPU trade market in this engine: the only `commit`
  // callers are the controlled club and an accepted inbound offer, so with no
  // GM acting the honest expectation is zero trades. The guard therefore bounds
  // the ceiling, and reads the market's pulse from the offers rivals generate.
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const seen = new Set();
  const perSeason = [];
  for (let season = 0; season < 3; season += 1) {
    const year = session.currentYear;
    let offers = 0;
    let guard = 0;
    while (session.phase === "regular-season" && guard < 24) {
      session.advanceWeek();
      for (const row of session.league.inboundTradeOffers || []) {
        if (!seen.has(row.id)) { seen.add(row.id); offers += 1; }
      }
      guard += 1;
    }
    session.simulateOneSeason({ runOffseasonAfter: true });
    const trades = session.league.transactionLog.filter((tx) => tx.type === "trade" && tx.year === year).length;
    perSeason.push({ year, trades, offers });
    assert.ok(trades >= 0 && trades < 60, `${year}: ${trades} trades is outside the sane band`);
    assert.ok(offers <= 20, `${year}: ${offers} inbound offers in one regular season is a flood`);
  }
  assert.ok(perSeason.some((row) => row.offers > 0), `rival front offices went silent for three seasons: ${JSON.stringify(perSeason)}`);
});
