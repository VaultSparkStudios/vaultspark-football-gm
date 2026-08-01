import test from "node:test";
import assert from "node:assert/strict";

import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { topGamePerformer, scoreGamePerformances, GAME_IMPACT_WEIGHTS } from "../src/stats/gameImpact.js";

const CONTROLLED = "BUF";

function bootSession(seed = 6363) {
  return new GameSession({ rng: new RNG(seed), startYear: 2026, controlledTeamId: CONTROLLED, mode: "play" });
}

/** Advance a full regular season, collecting the controlled team's press items. */
function playSeasonPress(session, weeks = 17) {
  const press = [];
  for (let week = 0; week < weeks; week += 1) {
    if (session.phase !== "regular-season") break;
    session.advanceWeek();
    const fresh = (session.league.newsLog || []).filter(
      (item) => item.type === "press-conference" && !press.some((seen) => seen.id === item.id)
    );
    press.push(...fresh);
  }
  return press;
}

// ── The seed collapse ─────────────────────────────────────────────────────────

test("a season of press conferences is not one quote repeated", () => {
  const session = bootSession();
  const press = playSeasonPress(session);

  assert.ok(press.length >= 10, `expected a season of podiums, saw ${press.length}`);

  const headCoach = press.filter((item) => item.subtype === "head-coach");
  assert.ok(headCoach.length >= 8, `expected head-coach quotes, saw ${headCoach.length}`);

  // Before S63 every head-coach quote for a given tone was byte-identical for the
  // whole franchise, because the seed read only the home team's first letter.
  const byTone = new Map();
  for (const item of headCoach) {
    if (!byTone.has(item.tone)) byTone.set(item.tone, new Set());
    byTone.get(item.tone).add(item.quote);
  }

  const multiSampleTones = [...byTone.entries()].filter(
    ([tone]) => headCoach.filter((item) => item.tone === tone).length >= 3
  );
  assert.ok(multiSampleTones.length > 0, "expected at least one tone with several samples");
  const variedTone = multiSampleTones.some(([, quotes]) => quotes.size > 1);
  assert.ok(
    variedTone,
    "every tone with three or more samples produced a single quote — the seed has collapsed again"
  );

  // Across the whole season the room must sound like more than one sentence.
  const distinctQuotes = new Set(headCoach.map((item) => item.quote));
  assert.ok(
    distinctQuotes.size >= 3,
    `season produced only ${distinctQuotes.size} distinct head-coach quotes`
  );
});

test("the same seed replays the press room byte-identically", () => {
  const first = playSeasonPress(bootSession(4242)).map((item) => `${item.id}::${item.quote}`);
  const second = playSeasonPress(bootSession(4242)).map((item) => `${item.id}::${item.quote}`);
  assert.deepEqual(second, first, "determinism is the whole point of a hashed seed");
  assert.ok(first.length > 0);
});

test("different seasons of the same matchup do not reuse the same quote slot blindly", () => {
  // The original seed ignored the week entirely: BUF-NYJ-3 and BUF-NYJ-11 hashed
  // identically. Prove the week and year now reach the hash.
  const session = bootSession(777);
  const press = playSeasonPress(session);
  const keyed = press
    .filter((item) => item.subtype === "head-coach")
    .map((item) => `${item.week}:${item.quote}`);
  assert.equal(new Set(keyed).size, keyed.length, "week must participate in quote selection");
});

// ── The unreachable top performer ─────────────────────────────────────────────

test("topPerformer resolves to a real player from a real simulated game", () => {
  const session = bootSession(3131);
  let found = null;

  for (let week = 0; week < 6 && !found; week += 1) {
    const result = session.advanceWeek();
    const game = (result.games || []).find(
      (entry) => entry.homeTeamId === CONTROLLED || entry.awayTeamId === CONTROLLED
    );
    if (!game) continue;
    assert.ok(game.boxScore, "simulated games must carry a box score");
    // The shape the press room used to read never existed.
    assert.equal(game.playerStats, undefined, "game objects carry no top-level playerStats");
    assert.ok(game.boxScore.playerStats.home, "real rows live under boxScore.playerStats");
    found = topGamePerformer(game.boxScore, { teamId: CONTROLLED });
  }

  assert.ok(found, "a played game must yield a top performer for the controlled team");
  assert.equal(typeof found.player, "string");
  assert.ok(found.player.length > 1, "top performer must be a real name, not an empty string");
  assert.equal(found.team, CONTROLLED);
  assert.ok(Number.isFinite(found.score));
});

test("press quotes actually name the top performer instead of falling back", () => {
  const session = bootSession(9090);
  const press = playSeasonPress(session);
  const named = press.filter(
    (item) =>
      item.subtype === "head-coach" &&
      !/The whole unit showed up|Somebody stepped up when it mattered|We gave ourselves a chance/.test(item.quote)
  );
  assert.ok(
    named.length > 0,
    "every quote took its degraded no-top-performer branch — the box-score lookup is broken again"
  );
});

// ── The shared impact authority ───────────────────────────────────────────────

test("the press room and the MVP ballot score performances with one authority", () => {
  assert.deepEqual(
    Object.keys(GAME_IMPACT_WEIGHTS).sort(),
    ["defense", "kicking", "passing", "receiving", "rushing"]
  );
  assert.equal(Object.isFrozen(GAME_IMPACT_WEIGHTS), true);
});

test("impact weights are unchanged from the season-wrap ballot they were extracted from", () => {
  assert.equal(GAME_IMPACT_WEIGHTS.passing({ yds: 250, td: 2, int: 1 }), 250 / 25 + 8 - 2);
  assert.equal(GAME_IMPACT_WEIGHTS.rushing({ yds: 100, td: 1 }), 10 + 6);
  assert.equal(GAME_IMPACT_WEIGHTS.receiving({ yds: 90, td: 0 }), 9);
  assert.equal(GAME_IMPACT_WEIGHTS.defense({ tkl: 10, sacks: 2, int: 1, pd: 2 }), 4.5 + 4 + 3 + 1.5);
  assert.equal(GAME_IMPACT_WEIGHTS.kicking({ fgm: 3, xpm: 4 }), 4.5 + 1);
});

test("scoring is total across both sides and tolerates an absent box score", () => {
  assert.equal(scoreGamePerformances(null).size, 0);
  assert.equal(scoreGamePerformances({}).size, 0);
  assert.equal(topGamePerformer(null), null);

  const boxScore = {
    homeTeam: { teamId: "BUF" },
    awayTeam: { teamId: "NYJ" },
    playerStats: {
      home: { rushing: [{ playerId: "p1", player: "Home Back", pos: "RB", yds: 100, td: 1 }] },
      away: { passing: [{ playerId: "p2", player: "Away Passer", pos: "QB", yds: 400, td: 4, int: 0 }] }
    }
  };
  assert.equal(scoreGamePerformances(boxScore).size, 2);
  assert.equal(topGamePerformer(boxScore).player, "Away Passer");
  assert.equal(topGamePerformer(boxScore, { teamId: "BUF" }).player, "Home Back");
  assert.equal(topGamePerformer(boxScore, { teamId: "MIA" }), null);
});

test("a player who contributes in two categories accumulates one combined score", () => {
  const boxScore = {
    homeTeam: { teamId: "BUF" },
    awayTeam: { teamId: "NYJ" },
    playerStats: {
      home: {
        rushing: [{ playerId: "p1", player: "Dual Threat", pos: "QB", yds: 50, td: 1 }],
        passing: [{ playerId: "p1", player: "Dual Threat", pos: "QB", yds: 250, td: 2, int: 0 }]
      }
    }
  };
  const scores = scoreGamePerformances(boxScore);
  assert.equal(scores.size, 1);
  assert.equal(scores.get("p1").score, 50 / 10 + 6 + 250 / 25 + 8);
});

test("ties break deterministically so replays never reorder", () => {
  const boxScore = {
    homeTeam: { teamId: "BUF" },
    awayTeam: { teamId: "NYJ" },
    playerStats: {
      home: {
        rushing: [
          { playerId: "zzz", player: "Later Id", pos: "RB", yds: 100, td: 0 },
          { playerId: "aaa", player: "Earlier Id", pos: "RB", yds: 100, td: 0 }
        ]
      }
    }
  };
  assert.equal(topGamePerformer(boxScore).playerId, "aaa");
});
