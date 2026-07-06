import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeDeadlineFrenzy } from "../public/lib/tradeDeadlineFrenzy.js";

const standings = [
  { team: "BUF", wins: 7, losses: 3 },
  { team: "MIA", wins: 8, losses: 2 },
  { team: "NYJ", wins: 5, losses: 5 },
  { team: "NE", wins: 2, losses: 8 }
];

test("trade deadline frenzy turns a winning team into structured buy offers", () => {
  const frenzy = buildTradeDeadlineFrenzy({
    currentWeek: 10,
    controlledTeamId: "BUF",
    controlledTeam: { abbrev: "BUF" },
    latestStandings: standings,
    rosterNeeds: [{ position: "CB", delta: -2 }],
    cap: { capSpace: 32_000_000 }
  });

  assert.equal(frenzy.role, "buyer");
  assert.equal(frenzy.capStatus, "flex");
  assert.equal(frenzy.topNeed, "CB");
  assert.equal(frenzy.offers.length, 3);
  assert.equal(frenzy.offers[0].targetNeed, "CB");
  assert.match(frenzy.offers[0].assetAsk, /Day 2/);
  assert.match(frenzy.offers[0].capImpact, /\$8\.0M/);
  assert.ok(frenzy.offers.every((offer) => offer.constraint && offer.risk && offer.partner));
});

test("trade deadline frenzy protects cap and challenge constraints", () => {
  const frenzy = buildTradeDeadlineFrenzy({
    currentWeek: 10,
    controlledTeamId: "BUF",
    controlledTeam: { abbrev: "BUF" },
    latestStandings: standings,
    rosterNeeds: [{ pos: "OT", delta: -1 }],
    cap: { capSpace: -1_500_000 },
    challengeMode: "speedrun"
  });

  assert.equal(frenzy.role, "buyer");
  assert.equal(frenzy.capStatus, "red");
  assert.match(frenzy.offers[0].constraint, /Cap is negative/);
  assert.match(frenzy.offers[0].capImpact, /neutral or cap-positive/);
  assert.match(frenzy.offers[1].constraint, /Challenge mode speedrun/);
});

test("trade deadline frenzy is deterministic for the same dashboard input", () => {
  const dashboard = {
    currentWeek: 10,
    controlledTeamId: "BUF",
    controlledTeam: { abbrev: "BUF" },
    latestStandings: [
      { team: "BUF", wins: 4, losses: 6 },
      { team: "MIA", wins: 8, losses: 2 },
      { team: "NYJ", wins: 5, losses: 5 },
      { team: "NE", wins: 2, losses: 8 }
    ],
    rosterNeeds: [{ pos: "EDGE", delta: -3 }],
    cap: { capSpace: 7_000_000 }
  };

  const first = buildTradeDeadlineFrenzy(dashboard);
  const second = buildTradeDeadlineFrenzy(dashboard);

  assert.deepEqual(first, second);
  assert.equal(first.role, "seller");
  assert.equal(first.offers[0].targetNeed, "future picks");
  assert.match(first.offers[0].constraint, /controllable starters/);
});

test("trade deadline render exposes self-describing action buttons", async () => {
  const el = { innerHTML: "", querySelectorAll: () => [] };
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return id === "deadline" ? el : null;
    },
    querySelector() {
      return null;
    }
  };

  try {
    const { renderTradeDeadlineFrenzy } = await import("../public/lib/tradeDeadlineFrenzy.js");
    renderTradeDeadlineFrenzy("deadline", {
      currentWeek: 10,
      controlledTeamId: "BUF",
      controlledTeam: { abbrev: "BUF" },
      latestStandings: standings,
      rosterNeeds: [{ position: "CB", delta: -2 }],
      cap: { capSpace: 32_000_000 }
    });
  } finally {
    globalThis.document = previousDocument;
  }

  assert.match(el.innerHTML, /data-deadline-action="open-trade-desk"/);
  assert.match(el.innerHTML, /aria-label="Open Trade Desk for Call/);
  assert.match(el.innerHTML, /<dt>Rule<\/dt>/);
});

