import test from "node:test";
import assert from "node:assert/strict";

import { buildFrontOfficeCard, attachFrontOffices } from "../src/engine/rivalFrontOffice.js";
import { recordRivalGmMemory, getRivalGmPersona } from "../src/engine/rivalGmPersona.js";
import { buildOnClockTradeOffers } from "../src/engine/onClockTradeMarket.js";

function league() {
  return {
    seed: 20260307,
    teams: [
      { id: "AAA", name: "Alpha Anchors", strategyProfile: "aggressive" },
      { id: "BBB", name: "Beta Builders", strategyProfile: "balanced" }
    ]
  };
}

test("a front-office card is a face, not a forecast", () => {
  const card = buildFrontOfficeCard(league(), "AAA");
  assert.equal(card.teamId, "AAA");
  assert.equal(card.teamName, "Alpha Anchors");
  assert.match(card.gmName, /\S+ \S+/);
  assert.equal(card.traits.length, 2);
  assert.equal(card.dealings, 0);
  assert.deepEqual(card.recentDealings, []);

  // The engine has no acceptance odds, leverage or relationship score, so the
  // card must not invent one. A number here would be a claim the simulation
  // cannot honour.
  const serialized = JSON.stringify(card).toLowerCase();
  for (const word of ["odds", "probability", "leverage", "relationship", "likelihood"]) {
    assert.ok(!serialized.includes(word), `the card must not imply ${word}`);
  }
});

test("the same league and club always produce the same general manager", () => {
  const a = buildFrontOfficeCard(league(), "AAA");
  const b = buildFrontOfficeCard(league(), "AAA");
  assert.deepEqual(a, b);
  assert.equal(a.gmName, getRivalGmPersona(league(), "AAA").name);
  // Different clubs are different people.
  assert.notEqual(buildFrontOfficeCard(league(), "BBB").gmName, a.gmName);
});

test("the card carries what this club actually remembers about you", () => {
  const world = league();
  recordRivalGmMemory(world, "AAA", { type: "outbid-you", year: 2031, summary: "Beat you to a free agent." });
  recordRivalGmMemory(world, "AAA", { type: "trade-with-you", year: 2032, summary: "Traded with your front office." });
  const card = buildFrontOfficeCard(world, "AAA");
  assert.equal(card.dealings, 2);
  assert.equal(card.recentDealings.length, 2);
  assert.equal(card.recentDealings.at(-1).year, 2032);
  assert.match(card.line, new RegExp(card.gmName.split(" ")[0]));
});

// ── The gap this item actually closed ────────────────────────────────────────
// The audit's first framing ("personas are invisible") was false and was
// narrowed: rivalTradeOffers already attaches gmName/gmLine, and beatReporter's
// free-agency outbid names the winning GM. Draft day was the real hole.

function draftFixture() {
  const world = league();
  return {
    league: world,
    draft: { year: 2030, currentPick: 5, completed: false, available: [{ id: "p1", position: "QB" }] },
    slot: { teamId: "AAA" },
    livePick: { id: "live", year: 2030, round: 1, originalPickIndex: 4 },
    controlledTeamId: "AAA",
    teams: world.teams,
    futurePicks: [
      { id: "f1", ownerTeamId: "BBB", year: 2031, round: 1, originalPickIndex: 10 },
      { id: "f2", ownerTeamId: "BBB", year: 2031, round: 2, originalPickIndex: 10 }
    ],
    rosterNeeds: () => [{ position: "QB", delta: -2 }]
  };
}

test("a draft-day offer arrives from a named front office, not a team id", () => {
  const offers = buildOnClockTradeOffers(draftFixture());
  assert.ok(offers.length > 0, "the fixture produces an offer");
  for (const offer of offers) {
    assert.ok(offer.frontOffice, "every on-clock offer carries its front office");
    assert.equal(offer.frontOffice.teamId, offer.teamId);
    assert.match(offer.frontOffice.gmName, /\S+ \S+/);
  }
});

test("identity is attached to the offer and changes nothing about the offer", () => {
  const withLeague = buildOnClockTradeOffers(draftFixture());
  const withoutLeague = buildOnClockTradeOffers({ ...draftFixture(), league: null });
  assert.equal(withLeague.length, withoutLeague.length);
  for (let index = 0; index < withLeague.length; index += 1) {
    const { frontOffice, ...terms } = withLeague[index];
    // The deal itself must be byte-identical with and without a face on it.
    assert.deepEqual(terms, withoutLeague[index], "attaching identity must not move a single term");
    assert.ok(frontOffice);
  }
});

test("attachFrontOffices passes through a row it cannot attribute rather than dropping it", () => {
  const rows = [{ teamId: "AAA", value: 1 }, { value: 2 }, { teamId: "ZZZ", value: 3 }];
  const attached = attachFrontOffices(league(), rows);
  assert.equal(attached.length, 3, "an offer you cannot attribute is still an offer you can accept");
  assert.ok(attached[0].frontOffice);
  assert.equal(attached[1].frontOffice, undefined);
  assert.equal(attached[2].frontOffice.teamName, "ZZZ", "an unknown club still gets a persona");
});
