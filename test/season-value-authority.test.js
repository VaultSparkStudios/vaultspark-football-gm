/**
 * Session 71 — the league's statistics were sound; the layer that turned them
 * into meaning was not.
 *
 * Each test here pins a defect that shipped and that the suite could not see,
 * because nothing asserted anything about the *scale* of the numbers the game
 * ranks its players by:
 *
 *  - `resetTeamSeasonState` rebuilt `team.season` without `drivesFor` /
 *    `drivesAgainst`, so the first `+=` of every season pinned them at NaN and
 *    every reader laundered that into a zero denominator. Offensive approximate
 *    value collapsed to ~0 league-wide and defensive value inflated roughly 4×.
 *  - `offensiveLineValue` returned an absolute instead of a share of the team's
 *    line bucket, so a lineman who simply started scored AV 96 against an
 *    MVP-calibre quarterback's 16 — and every honour that ranks by AV inherited
 *    it. A tight end won MVP, Offensive Player of the Year and Offensive Rookie
 *    of the Year in ten of ten simulated seasons.
 *  - Rookie eligibility read `seasonsPlayed <= 1`, a counter advanced in the
 *    offseason, so second-year players were eligible and the MVP also won
 *    Rookie of the Year in seven of eight seasons.
 *  - The championship scoreline was written home-first (AFC first) and published
 *    as champion-first, so any title won by an NFC club read as the champion
 *    losing its own final.
 *  - `developmentDelta` carried two constants — an inclusive `rng.int(-2, 3)`
 *    averaging +0.5, and a trait reference of 70 against a league whose mean
 *    potential is 79.9 — that lifted every player every offseason.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/runtime/bootstrap.js";
import { createLeagueBase, createTeamSeasonState, resetTeamSeasonState } from "../src/domain/teamFactory.js";
import { applyRegularSeasonResult } from "../src/engine/seasonSimulator.js";
import { approximateValueFromStats, TE_LINE_WEIGHT } from "../src/stats/approximateValue.js";
import { championScoreline, decidedScoreline, orientWinnerFirst } from "../src/stats/scoreline.js";
import { orientWinnerFirst as orientWinnerFirstBrowser } from "../public/lib/scoreline.js";
import { developmentDelta, LEAGUE_AVERAGE_POTENTIAL, PLAYER_DEVELOPMENT_PROFILE } from "../src/domain/ratings.js";
import { hallOfFameClasses } from "../public/lib/tabHistory.js";
import { RNG } from "../src/utils/rng.js";

/** A league-average 17-game team, in the shape `statBook` builds for the AV authority. */
function averageTeamContext() {
  return {
    team: {
      games: 17,
      pointsFor: 400,
      pointsAgainst: 360,
      drivesFor: 190,
      drivesAgainst: 190,
      passYds: 4100,
      rushYds: 1900,
      recYds: 4100,
      totalYards: 6000,
      frontSevenPoints: 900,
      secondaryPoints: 500,
      punts: 60,
      fga: 30,
      xpa: 40,
      olLineWeight: 1100 * 5 + 300 * 2,
      teLineWeight: 1100 + 700 + 400
    },
    league: {
      avgPointsPerDrive: 2.1,
      avgPointsAllowedPerDrive: 2.1,
      passAypa: 6.9,
      rbYpc: 4.3,
      receiverYpr: 11.8
    },
    honors: {}
  };
}

const FULL_SEASON = { games: 17, gamesStarted: 17, snaps: { offense: 1100 } };

test("a season record is one shape, and it carries every counter the season writes to", () => {
  const league = createLeagueBase(2026, new RNG(11));
  const fromCreate = Object.keys(league.teams[0].season).sort();

  resetTeamSeasonState(league, 2027);
  const fromReset = Object.keys(league.teams[0].season).sort();

  assert.deepEqual(
    fromReset,
    fromCreate,
    "the reset copy of the season record drifted from the created one — that drift is how drivesFor became NaN"
  );
  for (const key of ["drivesFor", "drivesAgainst", "pointsFor", "pointsAgainst"]) {
    assert.equal(league.teams[0].season[key], 0, `${key} must start at zero, not undefined`);
  }
});

test("accumulating a game into a season can never produce NaN, even from a damaged record", () => {
  const league = createLeagueBase(2026, new RNG(12));
  const [home, away] = league.teams;

  // A record that arrived from an older save without the counters at all.
  home.season = { ...createTeamSeasonState(2026), drivesFor: undefined, pointsFor: NaN };

  applyRegularSeasonResult(league, 1, {
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: 24,
    awayScore: 17,
    homeYards: 380,
    awayYards: 310,
    homeDrives: 11,
    awayDrives: 11,
    homeTurnovers: 1,
    awayTurnovers: 2,
    winnerId: home.id
  });

  for (const key of ["pointsFor", "pointsAgainst", "yardsFor", "yardsAgainst", "drivesFor", "drivesAgainst", "turnovers"]) {
    assert.ok(Number.isFinite(home.season[key]), `${key} must be finite, got ${home.season[key]}`);
    assert.ok(Number.isFinite(away.season[key]), `${key} must be finite, got ${away.season[key]}`);
  }
  assert.equal(home.season.drivesFor, 11);
  assert.equal(home.season.pointsFor, 24, "a NaN running total is treated as zero, not propagated");
});

test("approximate value is comparable across positions", () => {
  const ctx = averageTeamContext();
  const av = (pos, stats, extra = {}) => approximateValueFromStats(pos, { ...FULL_SEASON, ...stats }, { ...ctx, ...extra });

  const mvpQb = av("QB", { passing: { yards: 4800, att: 600, td: 38, int: 8 }, rushing: { yards: 250, att: 50, td: 3 } });
  const lineStarter = av("OL", { blocking: { sacksAllowed: 4 } });
  const blockingOnlyTe = av("TE", { receiving: { yards: 0, rec: 0, td: 0 } });
  const eliteTe = av("TE", { receiving: { yards: 1100, rec: 90, td: 10 } });
  const eliteWr = av("WR", { receiving: { yards: 1600, rec: 110, td: 13 } });
  const eliteDl = av("DL", { defense: { sacks: 15, tackles: 60, int: 0, fr: 2 } });

  // The defect in one assertion: a lineman who merely started scored 96 here.
  assert.ok(
    lineStarter < mvpQb,
    `a full-season line starter (${lineStarter}) must not out-value an MVP-calibre quarterback (${mvpQb})`
  );
  assert.ok(
    blockingOnlyTe < eliteWr,
    `a tight end with no catches (${blockingOnlyTe}) must not out-value an elite receiver (${eliteWr})`
  );
  assert.ok(eliteTe > blockingOnlyTe, "catching the ball has to be worth more than not catching it");

  // Everyone lands in a believable band rather than a formula artefact.
  for (const [label, value] of Object.entries({ mvpQb, lineStarter, eliteTe, eliteWr, eliteDl })) {
    assert.ok(value > 0 && value <= 30, `${label} AV ${value} is outside any plausible season range`);
  }
});

test("line value is a share of the team's line bucket, so a whole line cannot exceed it", () => {
  const ctx = averageTeamContext();
  const lineman = { ...FULL_SEASON, snaps: { offense: 1100 }, blocking: { sacksAllowed: 4 } };
  const one = approximateValueFromStats("OL", lineman, ctx);

  // Five such starters plus the tight-end share must stay inside the bucket the
  // formula is dividing up, not scale without limit.
  const denominator = ctx.team.olLineWeight + TE_LINE_WEIGHT * ctx.team.teLineWeight;
  const bucketCeiling = (5 / 11) * 100 * (5 * 1100 / denominator) * 1.35;
  assert.ok(
    one * 5 <= bucketCeiling,
    `five starters at ${one} each (${one * 5}) exceeded the line bucket ceiling ${bucketCeiling.toFixed(1)}`
  );

  // A missing team denominator must fall back safely, never inflate.
  const noDenominator = approximateValueFromStats("OL", lineman, {
    ...ctx,
    team: { ...ctx.team, olLineWeight: 0, teLineWeight: 0 }
  });
  assert.ok(noDenominator > 0 && noDenominator <= one * 3, `fallback share ${noDenominator} is not bounded`);
});

test("a championship scoreline leads with the champion, whichever conference wins", () => {
  const afcWon = { homeTeamId: "KC", awayTeamId: "SF", homeScore: 31, awayScore: 20, championTeamId: "KC", runnerUpTeamId: "SF" };
  const nfcWon = { homeTeamId: "KC", awayTeamId: "SF", homeScore: 20, awayScore: 31, championTeamId: "SF", runnerUpTeamId: "KC" };

  assert.equal(championScoreline(afcWon), "31-20");
  // The defect: this used to render "20-31" — the champion losing its own final.
  assert.equal(championScoreline(nfcWon), "31-20");
  assert.equal(championScoreline(null), "-");

  // Without usable identity a decided game is still winner-first.
  assert.equal(decidedScoreline({ homeScore: 10, awayScore: 48 }), "48-10");

  // Stored scorelines from earlier builds are repaired on read, not migrated.
  assert.equal(orientWinnerFirst("10-48"), "48-10");
  assert.equal(orientWinnerFirst("48-10"), "48-10");
  assert.equal(orientWinnerFirst("not a score"), "not a score");
  assert.equal(orientWinnerFirst(undefined), "");
});

test("the browser's scoreline repair agrees with the engine's, exactly", () => {
  for (const sample of ["10-48", "48-10", "0-0", "7-7", " 3 - 21 ", "", "—", "48-", "abc"]) {
    assert.equal(
      orientWinnerFirstBrowser(sample),
      orientWinnerFirst(sample),
      `the two runtimes disagreed on "${sample}"`
    );
  }
});

test("development carries no hidden constant — an average player only moves with age", () => {
  // Over many draws the mean delta must be the age factor and nothing else. The
  // two removed constants were worth about +1.0 a year between them.
  const sample = (age, potential) => {
    const rng = new RNG(90210);
    let total = 0;
    const draws = 20_000;
    for (let i = 0; i < draws; i += 1) total += developmentDelta({ age, potential }, rng);
    return total / draws;
  };

  const prime = sample(27, LEAGUE_AVERAGE_POTENTIAL);
  assert.ok(
    Math.abs(prime - PLAYER_DEVELOPMENT_PROFILE.ageFactors.prime26To29) < 0.15,
    `a league-average 27-year-old drifts ${prime.toFixed(3)} per offseason, not the declared profile`
  );

  const declining = sample(33, LEAGUE_AVERAGE_POTENTIAL);
  assert.ok(declining < 0, `a league-average 33-year-old must decline, got ${declining.toFixed(3)}`);

  const young = sample(23, LEAGUE_AVERAGE_POTENTIAL);
  assert.ok(young > prime, "young players must still develop faster than prime-age ones");

  // Potential still separates players; it just no longer lifts everyone.
  assert.ok(
    sample(27, LEAGUE_AVERAGE_POTENTIAL + 15) > prime,
    "high potential must still be worth more than average potential"
  );
  assert.ok(
    sample(27, LEAGUE_AVERAGE_POTENTIAL - 15) < prime,
    "below-average potential must develop more slowly than average"
  );
});

test("the variance draw is symmetric, and does not swallow the curve's fractions", () => {
  const rng = new RNG(7);
  let total = 0;
  const draws = 50_000;
  for (let i = 0; i < draws; i += 1) total += rng.float(-2.5, 2.5);
  assert.ok(Math.abs(total / draws) < 0.05, `the variance draw averaged ${(total / draws).toFixed(4)}, not ~0`);

  // The reason the draw is continuous: with a whole-number variance, rounding
  // the sum erases every fractional term, so a prime-age player's +0.4 became 0.
  const rounded = new RNG(21);
  let sum = 0;
  for (let i = 0; i < draws; i += 1) sum += Math.round(0.4 + rounded.float(-2.5, 2.5));
  assert.ok(
    Math.abs(sum / draws - 0.4) < 0.05,
    `a +0.4 curve term survived rounding as ${(sum / draws).toFixed(3)} — fractional resolution is being lost`
  );
});

test("Rookie of the Year is decided among actual rookies, and the Hall stays scarce", () => {
  const session = createSession({ seed: 8123, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: true });
  session.simulateOneSeason({ runOffseasonAfter: true });

  const secondSeason = session.league.awards.find((row) => row.year === 2027);
  assert.ok(secondSeason, "expected a 2027 award record");

  if (secondSeason.OROY?.playerId) {
    const winner =
      session.league.players.find((p) => p.id === secondSeason.OROY.playerId) ||
      session.league.retiredPlayers.find((p) => p.id === secondSeason.OROY.playerId);
    assert.ok(winner, "the Rookie of the Year must be a real player");
    const firstSeason = Math.min(...Object.keys(winner.seasonStats || {}).map(Number).filter(Number.isFinite));
    assert.equal(firstSeason, 2027, "Rookie of the Year must be in his first recorded season, not his second");
  }

  // The Hall admits at most one bounded class a year, and rebuilding is stable.
  const settings = session.getLeagueSettings();
  const cap = Number(settings.hallOfFameMaxClassSize ?? 6);
  const hall = session.refreshHallOfFame();
  const again = session.refreshHallOfFame();
  assert.equal(again.length, hall.length, "rebuilding the Hall must be idempotent");

  const byClass = new Map();
  for (const entry of hall) byClass.set(entry.classYear, (byClass.get(entry.classYear) || 0) + 1);
  for (const [classYear, size] of byClass) {
    assert.ok(size <= cap, `the class of ${classYear} inducted ${size}, above the cap of ${cap}`);
  }

  const ballot = session.getHallOfFameBallot({ limit: 12 });
  const inductedIds = new Set(hall.map((entry) => entry.playerId));
  assert.ok(ballot.length > 0, "retired resumes outside a scarce Hall should remain visible on the ballot");
  assert.ok(ballot.every((entry) => !inductedIds.has(entry.playerId)), "the ballot cannot include an inductee");
  assert.ok(ballot.every((entry) => entry.gapToInduction >= 0), "every resume publishes a non-negative threshold gap");
  for (let index = 1; index < ballot.length; index += 1) {
    assert.ok(ballot[index - 1].inductionScore >= ballot[index].inductionScore, "ballot resumes must rank strongest first");
  }
});

test("the Hall reads as dated classes, and pre-class saves keep their place", () => {
  const classes = hallOfFameClasses([
    { player: "Late Great", pos: "QB", classYear: 2033, careerAv: 120 },
    { player: "Same Class", pos: "DL", classYear: 2033, careerAv: 140 },
    { player: "Older", pos: "WR", classYear: 2031, careerAv: 90 },
    { player: "From A Legacy Save", pos: "OL", careerAv: 80 }
  ]);

  assert.deepEqual(
    classes.map((row) => row.label),
    ["Class of 2033", "Class of 2031", "Earlier inductees"],
    "classes run newest first, with undated inductees last"
  );
  assert.deepEqual(
    classes[0].members.map((row) => row.player),
    ["Same Class", "Late Great"],
    "inside a class the strongest resume leads"
  );
  assert.equal(classes[2].classYear, null, "an inductee without a class year is never given an invented one");
  assert.deepEqual(hallOfFameClasses([]), [], "an empty Hall has no classes");
  assert.deepEqual(hallOfFameClasses(), [], "a missing Hall is not an error");
});
