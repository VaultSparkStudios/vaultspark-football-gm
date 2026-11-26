import test from "node:test";
import assert from "node:assert/strict";
import { playerCardLines, PLAYER_CARD_SIZE } from "../public/lib/playerShareCard.js";

const player = {
  id: "p1", name: "Jaylen O'Neal", position: "WR", teamId: "BUF", overall: 84.4, age: 24,
  physicalCard: { archetype: "Long", ras: 8.71, speedScore: 102, catchRadiusInches: 126 },
  bodyMeasurements: { values: { heightInches: 74, weightLbs: 205, wingspanInches: 78.5, handSizeInches: 9.75 } }
};

test("the player card reads the dossier's numbers in scout order, with a safe file name", () => {
  const lines = playerCardLines(player);
  assert.equal(lines.name, "Jaylen O'Neal");
  assert.equal(lines.subtitle, "WR · BUF · 84 OVR · Age 24");
  assert.deepEqual(lines.stats, [["Frame", "Long"], ["RAS", "8.7"], ["Speed Score", "102"], ["Catch radius", '126"']]);
  assert.deepEqual(lines.body, [["Height", `6'2"`], ["Weight", "205 lb"], ["Wingspan", '78.5"'], ["Hands", '9.75"']]);
  assert.equal(lines.fileName, "franchise-architect-jaylen-o-neal.png");
  assert.deepEqual(PLAYER_CARD_SIZE, { width: 1200, height: 630 });
});

test("missing numbers are left off, never shown as zero, and catch radius is for pass catchers only", () => {
  const lines = playerCardLines({ name: "Big Man", position: "OL", physicalCard: { archetype: "Power", catchRadiusInches: 118 }, bodyMeasurements: { values: { wingspanInches: null } } });
  assert.deepEqual(lines.stats, [["Frame", "Power"]]);
  assert.deepEqual(lines.body, []);
  assert.equal(playerCardLines({}).fileName, "franchise-architect-player.png");
});
