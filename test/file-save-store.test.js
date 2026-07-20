import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileSaveStore } from "../src/adapters/persistence/fileSaveStore.js";

test("file save store lists metadata from sidecars and preview text without parsing snapshots", () => {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "vsfgm-save-store-"));
  try {
    const store = createFileSaveStore({ saveDir });
    const snapshot = {
      schemaVersion: 2,
      rngSeed: 99,
      currentYear: 2026,
      currentWeek: 4,
      phase: "regular-season",
      controlledTeamId: "BUF",
      controlledTeamName: "Austin Guardians",
      controlledTeamAbbrev: "AGU",
      seasonsSimulated: 1,
      league: { teams: [{ id: "BUF", abbrev: "AGU", name: "Austin Guardians" }], players: [] }
    };

    store.saveSessionToSlot("primary", snapshot);
    fs.writeFileSync(path.join(saveDir, "primary.json"), "{ invalid json", "utf8");

    fs.writeFileSync(
      path.join(saveDir, "legacy.json"),
      `{
  "schemaVersion": 2,
  "currentYear": 2027,
  "currentWeek": 8,
  "phase": "playoffs",
  "controlledTeamId": "DEN",
  "controlledTeamName": "Denver Dragons",
  "controlledTeamAbbrev": "DRA",
  "seasonsSimulated": 5,
`,
      "utf8"
    );

    const saves = store.listSaveSlots();
    const primary = saves.find((slot) => slot.slot === "primary");
    const legacy = saves.find((slot) => slot.slot === "legacy");

    assert.ok(primary);
    assert.equal(primary.meta.controlledTeamName, "Austin Guardians");
    assert.equal(primary.meta.controlledTeamAbbrev, "AGU");

    assert.ok(legacy);
    assert.equal(legacy.meta.currentYear, 2027);
    assert.equal(legacy.meta.currentWeek, 8);
    assert.equal(legacy.meta.controlledTeamName, "Denver Dragons");
    assert.equal(legacy.meta.controlledTeamAbbrev, "DRA");
  } finally {
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
});

test("file saves detect corruption and unknown integrity algorithms while accepting explicit legacy slots", () => {
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "vsfgm-save-integrity-"));
  const snapshot = {
    schemaVersion: 2,
    rngSeed: 101,
    currentYear: 2026,
    currentWeek: 1,
    phase: "regular-season",
    controlledTeamId: "BUF",
    league: { teams: [{ id: "BUF" }], players: [] }
  };
  try {
    const store = createFileSaveStore({ saveDir });
    store.saveSessionToSlot("primary", snapshot);
    fs.appendFileSync(path.join(saveDir, "primary.json"), " ", "utf8");
    assert.throws(() => store.loadSessionFromSlot("primary"), (error) => error.reasonCode === "SNAPSHOT_INTEGRITY_FAILED");

    fs.writeFileSync(path.join(saveDir, "legacy.json"), JSON.stringify(snapshot), "utf8");
    assert.equal(store.loadSessionFromSlot("legacy").currentYear, 2026);

    fs.writeFileSync(
      path.join(saveDir, "legacy.meta.json"),
      JSON.stringify({ integrity: { algo: "mystery-hash", checksum: "pass", length: 1 } }),
      "utf8"
    );
    assert.throws(() => store.loadSessionFromSlot("legacy"), (error) => error.reasonCode === "SNAPSHOT_INTEGRITY_FAILED");
  } finally {
    fs.rmSync(saveDir, { recursive: true, force: true });
  }
});
