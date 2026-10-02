import test from "node:test";
import assert from "node:assert/strict";
import { buildLookAhead, renderLookAhead } from "../public/lib/lookAhead.js";

const dashboard = (opponentRank, ownRank) => ({
  controlledTeamId: "BUF",
  currentWeekSchedule: { games: [{ homeTeamId: "MIA", awayTeamId: "BUF" }] },
  leagueLens: { powerRankings: [
    { teamId: "MIA", teamName: "Miami <Dolphins>", rank: opponentRank, record: "4-1", blurb: "+9 points a game" },
    { teamId: "BUF", teamName: "Buffalo", rank: ownRank, record: "2-3", blurb: "Sliding" }
  ] }
});

test("look-ahead names the opponent, venue and ranks without inventing odds", () => {
  const read = buildLookAhead(dashboard(2, 20));
  assert.equal(read.venue, "at");
  assert.equal(read.opponentRank, 2);
  assert.match(read.framing, /statement game/);
  assert.match(buildLookAhead(dashboard(25, 3)).framing, /trap/);
  assert.doesNotMatch(renderLookAhead(dashboard(2, 20)), /%|probability|chance/i);
});

test("look-ahead escapes names and stays silent on a bye", () => {
  assert.match(renderLookAhead(dashboard(2, 20)), /Miami &lt;Dolphins&gt;/);
  assert.equal(renderLookAhead({ controlledTeamId: "BUF", currentWeekSchedule: { games: [] } }), "");
});
