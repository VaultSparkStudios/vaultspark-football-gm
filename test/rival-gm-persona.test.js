import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import {
  buildPersonaIntel,
  getRivalGmMemory,
  getRivalGmPersona,
  personaGrudgeLine,
  recordRivalGmMemory
} from "../src/engine/rivalGmPersona.js";
import { computeAdaptiveNudge, applyAdaptiveDifficultyAfterSeason } from "../src/engine/adaptiveDifficulty.js";
import { DIFFICULTY_PRESETS } from "../src/config/leagueSetup.js";

// ── Rival GM personas ────────────────────────────────────────────────────────

test("personas are deterministic per league seed + team and never mutate state", () => {
  const league = { seed: 4242, teams: [{ id: "MIA", strategyProfile: "contender" }] };
  const first = getRivalGmPersona(league, "MIA");
  const second = getRivalGmPersona(league, "MIA");
  assert.deepEqual(first, second);
  assert.equal(first.style, "contender");
  assert.match(first.name, /^\S+ \S+$/);
  assert.equal(first.traits.length, 2);
  assert.notEqual(first.traits[0], first.traits[1]);
  const otherTeam = getRivalGmPersona(league, "NYJ");
  assert.notDeepEqual([first.name, first.traits], [otherTeam.name, otherTeam.traits]);
  const otherLeague = getRivalGmPersona({ seed: 999, teams: [] }, "MIA");
  assert.notEqual(first.name, otherLeague.name);
  assert.equal(league.rivalGmMemory, undefined, "persona derivation writes nothing");
});

test("memory ledger is bounded, receipted, and shapes the grudge line", () => {
  const league = { seed: 1, teams: [] };
  for (let index = 0; index < 12; index += 1) {
    recordRivalGmMemory(league, "MIA", { type: "trade-with-you", year: 2026 + index, week: 3, summary: `Deal #${index}` });
  }
  const memory = getRivalGmMemory(league, "MIA");
  assert.equal(memory.length, 8, "ledger keeps only the newest 8 entries");
  assert.equal(memory[7].year, 2037);

  const persona = getRivalGmPersona(league, "MIA");
  const line = personaGrudgeLine(persona, memory);
  assert.match(line, /2037 trade/, "grudge line references the latest real event");

  const noHistory = personaGrudgeLine(persona, []);
  assert.match(noHistory, new RegExp(persona.traits[0].slice(0, 12)), "trait line when no shared history");

  assert.equal(recordRivalGmMemory(league, "MIA", { type: "x" }), null, "summary-less entries are rejected");
});

test("a real committed trade with the controlled team lands in the rival GM's memory", () => {
  const session = createSession({ seed: 60001, startYear: 2026, controlledTeamId: "BUF" });
  const rival = session.league.teams.find((team) => team.id !== "BUF");
  const myPlayers = session.league.players.filter((p) => p.teamId === "BUF" && !p.retired);
  const theirPlayers = session.league.players.filter((p) => p.teamId === rival.id && !p.retired);
  let committed = null;
  // Probe swaps until the shared valuation authority endorses one.
  outer: for (const mine of myPlayers.slice(0, 25)) {
    for (const theirs of theirPlayers.slice(0, 25)) {
      const result = session.services.trades.commit({
        teamA: "BUF",
        teamB: rival.id,
        teamAPlayerIds: [mine.id],
        teamBPlayerIds: [theirs.id],
        teamAPickIds: [],
        teamBPickIds: []
      });
      if (result.ok) { committed = result; break outer; }
    }
  }
  assert.ok(committed, "found an endorsable one-for-one trade");
  const memory = getRivalGmMemory(session.league, rival.id);
  assert.equal(memory.length, 1);
  assert.equal(memory[0].type, "trade-with-you");
  assert.match(memory[0].summary, /BUF/);
  const intel = buildPersonaIntel(session.league, rival.id);
  assert.match(intel.line, /trade/);
});

// ── Living difficulty controls ───────────────────────────────────────────────

test("mid-game difficulty change re-patches levers, owner patience, and announces itself", () => {
  const session = createSession({ seed: 60002, startYear: 2026, controlledTeamId: "BUF" });
  const before = session.getLeagueSettings();
  assert.equal(before.difficultyPreset, "standard");

  const next = session.updateLeagueSettings({ difficultyPreset: "brutal" });
  assert.equal(next.difficultyPreset, "brutal");
  assert.equal(next.contractDemandMultiplier, DIFFICULTY_PRESETS.brutal.patch.contractDemandMultiplier);
  const owner = session.league.teams.find((team) => team.id === "BUF").owner;
  assert.ok(Math.abs(owner.patience - next.ownerPatience) < 1e-9, "controlled owner patience re-materialized");
  const announcement = session.league.newsFeed.find((entry) => entry.details?.kind === "difficulty-change");
  assert.ok(announcement, "the change is announced, not silent");
  assert.equal(announcement.details.to, "brutal");

  // Saving unrelated settings again does not re-announce or drift levers.
  const unchanged = session.updateLeagueSettings({ capGrowthRate: 0.05 });
  assert.equal(unchanged.difficultyPreset, "brutal");
});

test("adaptive nudges are opt-in, bounded to the preset band, and inert without history", () => {
  assert.equal(computeAdaptiveNudge({ settings: { adaptiveDifficulty: false }, seasonHistory: [] }), null);
  assert.equal(
    computeAdaptiveNudge({ settings: { adaptiveDifficulty: true, difficultyPreset: "standard" }, seasonHistory: [{ wins: 12, losses: 5 }] }),
    null,
    "one season is not a rolling window"
  );

  const base = DIFFICULTY_PRESETS.standard.patch;
  const settings = {
    adaptiveDifficulty: true,
    difficultyPreset: "standard",
    cpuTradeAggression: base.cpuTradeAggression,
    contractDemandMultiplier: base.contractDemandMultiplier
  };
  const winning = computeAdaptiveNudge({ settings, seasonHistory: [{ wins: 13, losses: 4 }, { wins: 12, losses: 5 }] });
  assert.ok(winning.cpuTradeAggression > base.cpuTradeAggression, "sustained winning raises rival pressure");
  assert.ok(winning.cpuTradeAggression <= base.cpuTradeAggression + 0.15 + 1e-9, "aggression stays inside the band");

  // Saturate: repeated wins can never exceed the band.
  let current = { ...settings };
  for (let index = 0; index < 10; index += 1) {
    const nudge = computeAdaptiveNudge({ settings: current, seasonHistory: [{ wins: 14, losses: 3 }, { wins: 13, losses: 4 }] });
    if (!nudge) break;
    current.cpuTradeAggression = nudge.cpuTradeAggression;
    current.contractDemandMultiplier = nudge.contractDemandMultiplier;
  }
  assert.ok(current.cpuTradeAggression <= base.cpuTradeAggression + 0.15 + 1e-9);
  assert.ok(current.contractDemandMultiplier <= base.contractDemandMultiplier + 0.1 + 1e-9);

  const losing = computeAdaptiveNudge({ settings, seasonHistory: [{ wins: 3, losses: 14 }, { wins: 4, losses: 13 }] });
  assert.ok(losing.cpuTradeAggression < base.cpuTradeAggression, "sustained losing eases pressure");

  const neutral = computeAdaptiveNudge({ settings, seasonHistory: [{ wins: 9, losses: 8 }, { wins: 8, losses: 9 }] });
  assert.equal(neutral, null, "neutral results leave settings untouched");
});

test("applyAdaptiveDifficultyAfterSeason writes a bounded receipt log and news", () => {
  const newsCalls = [];
  const session = {
    currentYear: 2030,
    league: {
      settings: {
        adaptiveDifficulty: true,
        difficultyPreset: "standard",
        cpuTradeAggression: 0.5,
        contractDemandMultiplier: 1
      },
      gmLegacy: { seasonHistory: [{ wins: 13, losses: 4 }, { wins: 14, losses: 3 }] }
    },
    logNews: (headline, details) => newsCalls.push({ headline, details })
  };
  const receipt = applyAdaptiveDifficultyAfterSeason(session);
  assert.ok(receipt);
  assert.equal(session.league.adaptiveDifficultyLog.length, 1);
  assert.equal(newsCalls.length, 1);
  assert.match(newsCalls[0].headline, /league adjusts/i);
  assert.equal(session.league.settings.cpuTradeAggression, receipt.cpuTradeAggression);

  session.league.settings.adaptiveDifficulty = false;
  assert.equal(applyAdaptiveDifficultyAfterSeason(session), null, "opt-out is inert");
});
