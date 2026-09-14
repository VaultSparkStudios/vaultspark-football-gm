import test from "node:test";
import assert from "node:assert/strict";
import {
  NFL_ELITE_DENSITY_BASELINE,
  NFL_FIRST_TEAM_ALL_PRO_ALLOCABLE_SEATS,
  NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM,
  NFL_FIRST_TEAM_ALL_PRO_SLOTS,
  NFL_FIRST_TEAM_ALL_PRO_UNALLOCABLE_SEATS
} from "../src/data/nflEliteDensityBaseline.js";
import { buildDistributionReceipt, buildEliteCompositionReading, summarizeLeagueProgression } from "../src/stats/progressionParity.js";
import { createSession } from "../src/runtime/bootstrap.js";

/**
 * S108 — the declared-population question S105–S107 carried, answered:
 * the elite ceiling stays position-blind because the anchor's total is;
 * composition against the per-room seat allocation is published beside it
 * and never gated. See DECISIONS S108.
 */

test("the per-room seat allocation reconciles to the 26-seat format", () => {
  const allocated = Object.values(NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM).reduce((sum, seats) => sum + seats, 0);
  assert.equal(allocated, NFL_FIRST_TEAM_ALL_PRO_ALLOCABLE_SEATS);
  assert.equal(allocated + NFL_FIRST_TEAM_ALL_PRO_UNALLOCABLE_SEATS, NFL_FIRST_TEAM_ALL_PRO_SLOTS, "every seat is either in a room or declared unallocable");
  assert.equal(NFL_ELITE_DENSITY_BASELINE.firstTeamAllProSeatsByRoom, NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM);
});

test("the room reading is taken on the population the elite arm declares", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const summary = summarizeLeagueProgression(session.league);
  const activeCount = summary.activeRosterRooms.reduce((sum, room) => sum + room.count, 0);
  assert.equal(activeCount, summary.population.activeRosterOnly.count, "the rooms partition activeRosterOnly exactly");
  const eliteCount = summary.activeRosterRooms.reduce((sum, room) => sum + room.elite90Plus, 0);
  assert.equal(eliteCount, summary.population.activeRosterOnly.elite90Plus);
  const rosteredCount = summary.rooms.reduce((sum, room) => sum + room.count, 0);
  assert.ok(rosteredCount > activeCount, "the rostered rooms still include the practice squad; the two readings are different populations");
});

function summaryWithRooms(roomElites, { count = 240 } = {}) {
  const rooms = Object.keys(NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM).map((room) => ({
    room,
    positions: room,
    count,
    elite90Plus: roomElites[room] || 0,
    elite90PlusPct: Number((((roomElites[room] || 0) / count) * 100).toFixed(1))
  }));
  const elite = rooms.reduce((sum, room) => sum + room.elite90Plus, 0);
  const total = count * rooms.length;
  return {
    population: {
      activeRosterOnly: { count: total, stdDevOverall: 4.5, elite90Plus: elite, elite90PlusPct: Number(((elite / total) * 100).toFixed(1)) },
      rostered: { count: total, stdDevOverall: 4.5, elite90Plus: elite, elite90PlusPct: Number(((elite / total) * 100).toFixed(1)) }
    },
    activeRosterRooms: rooms
  };
}

test("negative control: a cohort that is all quarterbacks reads a QB ratio far above one and every other room at zero", () => {
  const end = summaryWithRooms({ Quarterback: 24 });
  const reading = buildEliteCompositionReading(end);
  assert.equal(reading.gated, false);
  assert.equal(reading.status, "reported");
  assert.equal(reading.cohort, 24);
  const qb = reading.rooms.find((room) => room.room === "Quarterback");
  assert.equal(qb.cohortSharePct, 100);
  assert.equal(qb.seatSharePct, Number(((1 / NFL_FIRST_TEAM_ALL_PRO_ALLOCABLE_SEATS) * 100).toFixed(1)));
  assert.ok(qb.ratio >= 20, `QB ratio ${qb.ratio}`);
  for (const room of reading.rooms.filter((r) => r.room !== "Quarterback")) {
    assert.equal(room.cohortSharePct, 0);
    assert.equal(room.ratio, 0);
  }
  assert.deepEqual(reading.concentratedRooms, ["Quarterback"]);
});

test("a cohort seated in the anchor's own proportions reads a ratio of one in every room", () => {
  const scale = 3;
  const elites = Object.fromEntries(Object.entries(NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM).map(([room, seats]) => [room, seats * scale]));
  const reading = buildEliteCompositionReading(summaryWithRooms(elites));
  for (const room of reading.rooms) assert.equal(room.ratio, 1, `${room.room} ratio ${room.ratio}`);
  assert.deepEqual(reading.concentratedRooms, []);
});

test("composition is published on the receipt and never moves its status", () => {
  const concentrated = summaryWithRooms({ Quarterback: 12, "Offensive Line": 12 });
  const proportional = summaryWithRooms(Object.fromEntries(Object.entries(NFL_FIRST_TEAM_ALL_PRO_SEATS_BY_ROOM).map(([room, seats]) => [room, seats])));
  const a = buildDistributionReceipt({ start: concentrated, end: concentrated, observedSeasons: 10 });
  const b = buildDistributionReceipt({ start: proportional, end: proportional, observedSeasons: 10 });
  assert.equal(a.eliteComposition.gated, false);
  assert.deepEqual(a.eliteComposition.concentratedRooms.sort(), ["Offensive Line", "Quarterback"]);
  assert.deepEqual(b.eliteComposition.concentratedRooms, []);
  assert.equal(a.endElite90PlusPct, b.endElite90PlusPct, "same total density");
  assert.equal(a.eliteStatus, b.eliteStatus, "and the gated verdict is identical whatever the composition");
  assert.equal(a.status, b.status);
});

test("a fixture without the active-roster room reading reports incomplete rather than a fabricated composition", () => {
  const receipt = buildDistributionReceipt({
    start: { population: { rostered: { count: 1500, stdDevOverall: 4.5, elite90PlusPct: 1 } } },
    end: { population: { rostered: { count: 1500, stdDevOverall: 4.5, elite90PlusPct: 1 } } },
    observedSeasons: 10
  });
  assert.equal(receipt.eliteComposition.status, "incomplete");
  assert.deepEqual(receipt.eliteComposition.rooms, []);
  assert.notEqual(receipt.eliteStatus, "incomplete", "the gated arm still reads through its fallback chain");
});
