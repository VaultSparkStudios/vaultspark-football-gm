import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSession } from "../src/runtime/bootstrap.js";

test("bootstrap loads custom realism profiles from file paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vsfgm-realism-"));
  const seasonPath = path.join(tempDir, "season-profile.json");
  const careerPath = path.join(tempDir, "career-profile.json");

  try {
    fs.writeFileSync(seasonPath, JSON.stringify({ meta: { label: "season-test" }, positions: { QB: { metrics: {} } } }));
    fs.writeFileSync(careerPath, JSON.stringify({ meta: { label: "career-test" }, positions: { QB: { metrics: {} } } }));

    const session = createSession({
      seed: 2026,
      startYear: 2026,
      controlledTeamId: "BUF",
      realismProfilePath: seasonPath,
      careerRealismProfilePath: careerPath
    });

    assert.equal(session.realismProfile.meta.label, "season-test");
    assert.equal(session.careerRealismProfile.meta.label, "career-test");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
