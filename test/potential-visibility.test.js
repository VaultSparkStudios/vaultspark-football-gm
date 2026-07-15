import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSession } from "../src/runtime/bootstrap.js";

const PLAYER_ROW_FILES = [
  "public/lib/tabRoster.js",
  "public/lib/tabContracts.js",
  "public/lib/tabDraft.js",
  "public/lib/tabStats.js",
  "public/lib/tabHistory.js",
  "public/lib/tabSettings.js"
];

test("every browser player row that emits OVR emits POT immediately beside it", () => {
  for (const file of PLAYER_ROW_FILES) {
    const source = fs.readFileSync(path.resolve(file), "utf8");
    const lines = source.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/\bovr\s*:/.test(line)) continue;
      assert.match(
        lines.slice(index + 1, index + 3).join("\n"),
        /\bpot\s*:/,
        `${file}:${index + 1} emits OVR without adjacent POT`
      );
    }
  }
});

test("roster, market, search, profile, and stat APIs carry the persisted potential rating", () => {
  const session = createSession({ seed: 4603, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const roster = session.getRoster("BUF");
  assert.ok(roster.length > 0);
  assert.ok(roster.every((player) => Number.isFinite(player.potential)));
  assert.ok(session.getFreeAgents({ limit: 10 }).every((player) => Number.isFinite(player.potential)));

  const target = roster[0];
  assert.equal(session.searchPlayers({ query: target.name })[0].potential, target.potential);
  assert.equal(session.getPlayerProfile(target.id).player.potential, target.potential);
  session.advanceWeek();
  const anyStatRow = [
    ...session.statBook.getPlayerSeasonTable("passing", { year: 2026 }),
    ...session.statBook.getPlayerSeasonTable("rushing", { year: 2026 }),
    ...session.statBook.getPlayerSeasonTable("defense", { year: 2026 })
  ][0];
  assert.ok(Number.isFinite(anyStatRow.ovr));
  assert.ok(Number.isFinite(anyStatRow.pot));
});
