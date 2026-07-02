import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHARDS } from "../scripts/run-test-shard.mjs";

// ── Shard coverage guard ──────────────────────────────────────────────────────
// Every test/*.test.js on disk must live in exactly one shard, and every shard
// entry must exist on disk. This catches orphan tests (files that npm test and
// CI would silently skip) as well as stale shard entries after renames.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const filesOnDisk = fs
  .readdirSync(path.join(repoRoot, "test"))
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => `test/${name}`)
  .sort();

const shardEntries = Object.entries(SHARDS).flatMap(([shard, files]) =>
  files.map((file) => ({ shard, file }))
);

test("every test file on disk appears in exactly one shard", () => {
  assert.ok(filesOnDisk.length > 0, "expected test files on disk");

  const counts = new Map(filesOnDisk.map((file) => [file, 0]));
  for (const { file } of shardEntries) {
    if (counts.has(file)) counts.set(file, counts.get(file) + 1);
  }

  const orphans = [...counts].filter(([, n]) => n === 0).map(([file]) => file);
  const duplicated = [...counts].filter(([, n]) => n > 1).map(([file]) => file);

  assert.deepEqual(
    orphans,
    [],
    `test files not assigned to any shard (npm test / CI would skip them): ${orphans.join(", ")}`
  );
  assert.deepEqual(
    duplicated,
    [],
    `test files assigned to more than one shard: ${duplicated.join(", ")}`
  );
});

test("every shard entry exists on disk", () => {
  const stale = shardEntries
    .filter(({ file }) => !fs.existsSync(path.join(repoRoot, file)))
    .map(({ shard, file }) => `${shard}: ${file}`);

  assert.deepEqual(stale, [], `shard entries missing on disk (renamed or deleted?): ${stale.join(", ")}`);
});

test("shard map has no duplicate entries within a single shard", () => {
  for (const [shard, files] of Object.entries(SHARDS)) {
    assert.equal(
      new Set(files).size,
      files.length,
      `shard "${shard}" lists a file more than once`
    );
  }
});
