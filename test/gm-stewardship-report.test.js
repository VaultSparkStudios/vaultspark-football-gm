import assert from "node:assert/strict";
import test from "node:test";

import { buildGmReputationProfile, initGmLegacy, updateGmLegacyAfterSeason } from "../src/engine/gmLegacyScore.js";
import { computeObservedTradeNetAv, generateGMReportCard } from "../src/stats/gmReportCard.js";

const active = (id, source = "generated-roster", overall = 76, schemeFit = 75) => ({
  id,
  overall,
  schemeFit,
  rosterSlot: "active",
  depthChartOrder: 1,
  profile: { source }
});

test("stewardship cap grade reads the canonical cap summary and drafted players use observed AV", () => {
  const team = { id: "BUF" };
  const players = [
    ...Array.from({ length: 10 }, (_, index) => active(`VET-${index}`)),
    active("P2026-FA-QB-1", "drafted", 82, 81)
  ];
  const base = {
    transactions: [],
    seasonAvByPlayerId: { "P2026-FA-QB-1": 14 }
  };
  const efficient = generateGMReportCard(team, players, 2026, {
    ...base,
    capSummary: { salaryCap: 250_000_000, usedCap: 225_000_000, deadCap: 2_000_000, capSpace: 23_000_000 }
  });
  const wasteful = generateGMReportCard(team, players, 2026, {
    ...base,
    capSummary: { salaryCap: 250_000_000, usedCap: 150_000_000, deadCap: 50_000_000, capSpace: 50_000_000 }
  });
  assert.ok(efficient.scores.capManagement > wasteful.scores.capManagement);
  assert.equal(efficient.scores.draftROI, 77);
  assert.equal(efficient.capReceipt.source, "ContractService.getCapSummary");
});

test("trade net Approximate Value follows receipted direction and states its non-causal boundary", () => {
  const transactions = [{
    id: "TX-2026-1",
    type: "trade",
    year: 2026,
    teamA: "BUF",
    teamB: "MIA",
    details: { fromA: [{ playerId: "sent" }], fromB: [{ playerId: "received" }] }
  }];
  const receipt = computeObservedTradeNetAv("BUF", 2026, transactions, { sent: 3, received: 9 });
  assert.equal(receipt.receivedAv, 9);
  assert.equal(receipt.sentAv, 3);
  assert.equal(receipt.netAv, 6);
  assert.match(receipt.boundary, /descriptive, not causal/i);
});

test("legacy consumes one report per season and reputation changes from observed trade truth", () => {
  const league = {
    teams: [{ id: "BUF", season: { wins: 10, losses: 7 }, chemistry: 75 }],
    champions: []
  };
  initGmLegacy(league);
  const report = { overallScore: 82, tradeReceipt: { netAv: 12 } };
  const capSummary = { salaryCap: 250_000_000, usedCap: 225_000_000, deadCap: 2_000_000 };
  updateGmLegacyAfterSeason(league, "BUF", 2026, { capSummary, stewardshipReport: report });
  updateGmLegacyAfterSeason(league, "BUF", 2026, { capSummary, stewardshipReport: report });
  assert.equal(league.gmLegacy.seasonsServed, 1);
  assert.equal(league.gmLegacy.tradeNetAV, 12);
  assert.equal(league.gmLegacy.seasonHistory[0].stewardshipScore, 82);
  assert.equal(buildGmReputationProfile(league.gmLegacy).tradeStyle, "Asset Accumulator");
});
