import test from "node:test";
import assert from "node:assert/strict";
import { buildLeagueStoryFromDashboard, renderStoryHTML } from "../public/lib/leagueStoryExport.js";
import { resolveWeekPredictions, submitPrediction } from "../public/lib/spreadPredictions.js";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  };
}

function withStorage(run) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fakeStorage(), configurable: true });
  try {
    return run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "localStorage", prior);
    else delete globalThis.localStorage;
  }
}

test("league story card derives a shareable snapshot from dashboard source data", () => {
  const story = buildLeagueStoryFromDashboard({
    currentYear: 2031,
    controlledTeamId: "BUF",
    controlledTeam: { name: "Buffalo Builders" },
    latestStandings: [{ team: "BUF", wins: 12, losses: 5 }],
    champions: [{ championTeamId: "BUF", score: "31-24", mvp: { name: "Avery Stone", position: "QB" } }],
    lastAwards: {
      mvp: { name: "Avery Stone" },
      OROY: { name: "Malik Cross" },
      DPOY: { name: "Devon Hart" }
    },
    leagueLeaders: {
      passing: [{ player: "Avery Stone", team: "BUF", yds: 4711 }],
      rushing: [{ player: "Cole North", team: "CHI", yds: 1510 }],
      receiving: [{ player: "Jules West", team: "BUF", yds: 1404 }],
      defense: [{ player: "Devon Hart", team: "BUF", sacks: 18 }]
    },
    cap: { capSpace: 18400000 },
    gmLegacy: { score: 912, grade: "A" },
    timeCapsule: { graded: { hits: 3, pushes: 1, misses: 1, reporterVerdict: "The board holds." } },
    newsLog: [{ headline: "Buffalo lands a deadline trade swing" }]
  });

  assert.equal(story.year, 2031);
  assert.equal(story.teamName, "Buffalo Builders");
  assert.equal(story.champion, "BUF");
  assert.equal(story.sbMvp, "Avery Stone (QB)");
  assert.equal(story.controlledTeamRecord, "12-5");
  assert.equal(story.capSpace, "$18.4M");
  assert.equal(story.gmLegacy, "912 (A)");
  assert.equal(story.passingLeader, "Avery Stone, BUF (4711)");
  assert.equal(story.sacksLeader, "Devon Hart, BUF (18)");
  assert.match(story.timeCapsule, /3-1, 1 push/);
  assert.equal(story.bestTrade, "Buffalo lands a deadline trade swing");
});

test("league story card html escapes source-derived values", () => {
  const html = renderStoryHTML({
    leagueName: "League <script>",
    year: "2032",
    champion: "A&B",
    sbScore: "24-21",
    sbMvp: "MVP <bad>",
    mvp: "Player <one>",
    roy: "Rookie",
    dpoy: "Defender",
    controlledTeamRecord: "10-7",
    capSpace: "$12.0M",
    gmLegacy: "850 (B)",
    bestDraftPick: "Pick <7>",
    bestTrade: "Trade & Win",
    passingLeader: "Passer",
    rushingLeader: "Runner",
    receivingLeader: "Receiver",
    sacksLeader: "Rusher",
    timeCapsule: "Receipts <filed>",
    predictionSummary: "Winner accuracy <unsafe>",
    predictionRecent: "Y2032 W4 <bad>@BUF"
  });

  assert.match(html, /League &lt;script&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /MVP &lt;bad&gt;/);
  assert.doesNotMatch(html, /<bad>/);
  assert.match(html, /Time Capsule Receipts/);
  assert.match(html, /Prediction Ledger/);
  assert.match(html, /Winner accuracy &lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<bad>@BUF/);
});

test("league story export includes truthful aggregate and recent local prediction receipts", () => {
  withStorage(() => {
    const first = { awayTeamId: "NYJ", homeTeamId: "BUF", played: false };
    submitPrediction("story-league", 2031, 4, first, { winnerId: "BUF", margin: 14 });
    resolveWeekPredictions("story-league", 2031, 4, [{
      ...first,
      played: true,
      winnerId: "BUF",
      awayScore: 10,
      homeScore: 24,
      isTie: false
    }]);

    const second = { awayTeamId: "MIA", homeTeamId: "NE", played: false };
    submitPrediction("story-league", 2031, 5, second, { winnerId: "MIA", margin: 3 });
    resolveWeekPredictions("story-league", 2031, 5, [{
      ...second,
      played: true,
      winnerId: "NE",
      awayScore: 10,
      homeScore: 20,
      isTie: false
    }]);

    const story = buildLeagueStoryFromDashboard({
      franchiseId: "story-league",
      currentYear: 2031,
      controlledTeamId: "BUF"
    });
    assert.equal(story.predictionSummary, "Winner accuracy 50% (1/2) · margin MAE 3.5 points");
    assert.match(story.predictionRecent, /Y2031 W5 MIA@NE: winner miss, within 7 \(7 off\)/);
    assert.match(story.predictionRecent, /Y2031 W4 NYJ@BUF: winner hit, exact margin/);

    const html = renderStoryHTML(story);
    assert.match(html, /Prediction Ledger/);
    assert.match(html, /Recent Prediction Receipts/);
    assert.match(html, /Winner accuracy 50%/);
  });
});
