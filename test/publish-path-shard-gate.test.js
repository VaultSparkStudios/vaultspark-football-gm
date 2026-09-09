import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHARDS, DEFAULT_SHARDS } from "../scripts/run-test-shard.mjs";

// ── Publish-path shard gate ───────────────────────────────────────────────────
// test/shard-coverage.test.js proves every test FILE is in some shard. Nothing
// proved every SHARD is actually run before code reaches players.
//
// Until S101 the deploy-pages gate ran `test:studio` alone while `src/**` was a
// trigger path for that workflow, and full CI is a separate workflow that races
// the deploy rather than blocking it. An engine or economy regression could
// therefore be published to the live origin with no behaviour shard having
// executed against it, and stay there until the weekly `long` sweep.
//
// This guard is structural: it reads the gate job each publish job actually
// depends on and asserts the behaviour shards run inside THAT job. It is not
// satisfied by a shard running somewhere else in the file, or in another
// workflow.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `long` is deliberately excluded from every push-blocking path: it is the
// weekly realism sweep (~45 min). Excluding it is a declared decision, so the
// expectation names it rather than silently omitting it.
const NOT_PUSH_BLOCKING = new Set(["long"]);
const PUSH_BLOCKING_SHARDS = DEFAULT_SHARDS.filter((shard) => !NOT_PUSH_BLOCKING.has(shard));

// `npm run test:sim:contract` runs the shard keyed `sim-contract`.
const scriptSuffixToShard = (suffix) => suffix.replace(/:/g, "-");

function readWorkflow(name) {
  return fs.readFileSync(path.join(repoRoot, ".github", "workflows", name), "utf8");
}

/**
 * Slice one top-level job out of a workflow. Jobs are indented two spaces under
 * `jobs:`; the job ends at the next line with the same indentation.
 */
function jobBlock(source, jobId) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(start, -1, `workflow has no job "${jobId}"`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function shardsRunIn(block) {
  return [...block.matchAll(/npm run test:([a-z:]+)/g)]
    .map((match) => scriptSuffixToShard(match[1]))
    .filter((shard) => Object.hasOwn(SHARDS, shard));
}

function dependsOn(block) {
  const match = block.match(/^\s*needs:\s*(.+)$/m);
  if (!match) return [];
  const raw = match[1].trim();
  return raw.startsWith("[")
    ? raw.slice(1, -1).split(",").map((entry) => entry.trim())
    : [raw];
}

test("the CI shard matrix covers every push-blocking shard", () => {
  const ci = readWorkflow("ci.yml");
  const matrix = ci.match(/shard:\s*\[([^\]]+)\]/);
  assert.ok(matrix, "ci.yml no longer declares a `shard:` matrix");

  const declared = matrix[1].split(",").map((entry) => scriptSuffixToShard(entry.trim()));
  const missing = PUSH_BLOCKING_SHARDS.filter((shard) => !declared.includes(shard));

  assert.deepEqual(
    missing,
    [],
    `shards defined in run-test-shard.mjs but absent from the CI matrix: ${missing.join(", ")}`
  );
  for (const shard of declared) {
    assert.ok(Object.hasOwn(SHARDS, shard), `CI matrix names "${shard}", which is not a real shard`);
  }
});

for (const { workflow, publishJob, required } of [
  {
    workflow: "deploy-pages.yml",
    publishJob: "build",
    required: ["studio", "core", "sim-contract", "sim-realism"]
  },
  {
    workflow: "deploy-backend.yml",
    publishJob: "build-images",
    required: ["studio", "runtime", "core", "sim-contract"]
  }
]) {
  test(`${workflow} runs behaviour shards in the gate its publish job depends on`, () => {
    const source = readWorkflow(workflow);
    const publishBlock = jobBlock(source, publishJob);
    const needs = dependsOn(publishBlock);

    assert.ok(
      needs.includes("gate"),
      `${workflow}: "${publishJob}" no longer depends on "gate" (needs: ${needs.join(", ") || "none"})`
    );

    const gated = shardsRunIn(jobBlock(source, "gate"));
    const missing = required.filter((shard) => !gated.includes(shard));

    assert.deepEqual(
      missing,
      [],
      `${workflow}: publish is gated without running ${missing.join(", ")} — a regression in those files would reach the live origin unexercised`
    );
  });

  test(`${workflow} declares src/** as a trigger path it actually tests`, () => {
    const source = readWorkflow(workflow);
    if (!/^\s+- "src\/\*\*"$/m.test(source)) return; // this workflow does not claim to cover src/
    const gated = shardsRunIn(jobBlock(source, "gate"));
    assert.ok(
      gated.includes("core"),
      `${workflow} triggers on src/** but its gate never runs the core shard`
    );
  });
}
