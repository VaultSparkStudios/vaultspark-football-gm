import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importSnapshot, MAX_SAVE_IMPORT_BYTES } from "../public/lib/gameFlow.js";
import { MAX_SNAPSHOT_BODY_BYTES, readRequestBody } from "../src/server/httpHardening.js";

/**
 * A player-chosen save file is checked for size BEFORE it is read or parsed.
 *
 * The number is measured, not guessed. `node` + createSession({ seed: 99,
 * mode: "play" }) + simulateSeasons(1) per row, 2026-11-19:
 *
 *   seasons   compact JSON   exported file (2-space indent)
 *      1        24.0 MB          48.3 MB
 *      2        28.9 MB          58.0 MB
 *      3        33.8 MB          68.1 MB
 *
 * So the exported file grows about 10 MB a season and passes 64 MB in season
 * three. The cap must sit far above that or it refuses real careers.
 */

const MB = 1024 * 1024;

function fakeFile(size, text = "{}") {
  const file = { size, reads: 0, async text() { file.reads += 1; return text; } };
  return file;
}

test("the save-file cap is far above a measured multi-season career export", () => {
  const measuredThreeSeasonExportMb = 68.1;
  const measuredGrowthPerSeasonMb = 10.1;
  const thirtySeasonExportMb = measuredThreeSeasonExportMb + 27 * measuredGrowthPerSeasonMb;
  assert.ok(MAX_SAVE_IMPORT_BYTES / MB > thirtySeasonExportMb, `a 30-season export (~${Math.round(thirtySeasonExportMb)} MB) must import`);
  assert.equal(MAX_SAVE_IMPORT_BYTES, 512 * MB);
});

test("an oversized save file is refused before it is read, with a message a player can act on", async () => {
  const file = fakeFile(MAX_SAVE_IMPORT_BYTES + 1);
  await assert.rejects(importSnapshot(file), (error) => {
    assert.match(error.message, /too large/);
    assert.match(error.message, /513 MB/);
    assert.match(error.message, /limit is 512 MB/);
    assert.match(error.message, /Nothing was changed/);
    assert.doesNotMatch(error.message, /Invalid snapshot JSON/, "an oversized file is not reported as malformed");
    return true;
  });
  assert.equal(file.reads, 0, "the file must not be read into memory once its size is known to be over the cap");
});

test("a file at or under the cap is read, and a malformed one is still reported as malformed", async () => {
  for (const size of [MAX_SAVE_IMPORT_BYTES, 70 * MB, 12]) {
    const file = fakeFile(size, "{ not json");
    await assert.rejects(importSnapshot(file), /Invalid snapshot JSON/);
    assert.equal(file.reads, 1, `a ${size}-byte file is inside the cap and must be read`);
  }
  await assert.rejects(importSnapshot(null), /Choose a snapshot file first/);
});

test("the size check runs before the read and the parse in the import function", () => {
  const source = fs.readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export async function importSnapshot"));
  const check = body.indexOf("MAX_SAVE_IMPORT_BYTES");
  assert.ok(check > 0 && check < body.indexOf("file.text()") && check < body.indexOf("JSON.parse"));
});

test("the self-hosted server also bounds an uploaded snapshot before parsing it", async () => {
  // The server receives compact JSON (24 MB after one season, ~5 MB a season),
  // and enforces its own ceiling on raw bytes while the body is still streaming.
  assert.equal(MAX_SNAPSHOT_BODY_BYTES, 64 * MB);
  const { Readable } = await import("node:stream");
  const chunk = Buffer.alloc(64 * 1024, 0x20);
  let sent = 0;
  const request = new Readable({ read() { if (sent > 3 * MB) { this.push(null); return; } sent += chunk.length; this.push(chunk); } });
  await assert.rejects(readRequestBody(request, { limit: 1 * MB }), (error) => {
    assert.equal(error.status, 413);
    assert.equal(error.code, "BODY_TOO_LARGE");
    return true;
  });
  assert.ok(sent < 3 * MB, "the server stops consuming once the limit is crossed");
  const routes = fs.readFileSync(new URL("../src/server/routes/saves.js", import.meta.url), "utf8");
  for (const route of ["/api/snapshot/import", "/api/snapshot/inspect"]) {
    const at = routes.indexOf(`url.pathname === "${route}"`);
    assert.match(routes.slice(at, at + 220), /parseJsonBody\(await readRequestBody\(req, \{ limit: MAX_SNAPSHOT_BODY_BYTES \}\)\)/, `${route} bounds the body before parsing`);
  }
});
