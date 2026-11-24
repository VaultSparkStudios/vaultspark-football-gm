import test from "node:test";
import assert from "node:assert/strict";
import { importCiTestReceipt, shardsFromCiJobs, stripLogPrefix } from "../scripts/import-ci-test-receipt.mjs";
import { DEFAULT_SHARDS } from "../scripts/run-test-shard.mjs";

const SHA = "a".repeat(40);
const line = (text) => `unit-shards (x)\tUNKNOWN STEP\t2026-11-20T07:41:39.0000000Z ${text}`;
const log = (tests, pass = tests, fail = 0) => [line("✔ something (1ms)"), line(`ℹ tests ${tests}`), line(`ℹ pass ${pass}`), line(`ℹ fail ${fail}`), line("ℹ cancelled 0"), line("ℹ skipped 0")].join("\n");
const label = (shard) => shard.replace("sim-", "sim:");
const greenJobs = () => DEFAULT_SHARDS.map((shard, index) => ({ name: `unit-shards (${label(shard)})`, conclusion: "success", log: log(100 + index) }));

test("hosted log lines lose their job, step and timestamp prefix", () => {
  assert.equal(stripLogPrefix(line("ℹ tests 458")), "ℹ tests 458");
  assert.equal(stripLogPrefix("plain line"), "plain line");
});

test("a complete green hosted run yields one reconciled entry per required shard", () => {
  const shards = shardsFromCiJobs([...greenJobs(), { name: "browser-shards (1)", conclusion: "success", log: "" }]);
  assert.deepEqual(shards.map((entry) => entry.name), DEFAULT_SHARDS);
  assert.ok(shards.every((entry) => entry.status === 0 && entry.summary.valid && entry.summary.fail === 0));
  assert.equal(shards[0].summary.tests, 100);
});

test("a partial, failed or unreconciled hosted run never becomes a receipt", () => {
  assert.throws(() => shardsFromCiJobs(greenJobs().slice(1)), /no job for the core shard/);
  const failed = greenJobs(); failed[2] = { ...failed[2], conclusion: "failure" };
  assert.throws(() => shardsFromCiJobs(failed), /concluded failure/);
  const red = greenJobs(); red[1] = { ...red[1], log: log(50, 49, 1) };
  assert.throws(() => shardsFromCiJobs(red), /not fully green \(49\/50\)/);
  const silent = greenJobs(); silent[0] = { ...silent[0], log: line("no totals here") };
  assert.throws(() => shardsFromCiJobs(silent), /totals are unusable/);
  const twice = [...greenJobs(), greenJobs()[0]];
  assert.throws(() => shardsFromCiJobs(twice), /more than once/);
});

function fakeRun({ head = SHA, dirty = "", runs = [{ databaseId: 77, status: "completed", conclusion: "success", attempt: 2, headSha: SHA }], jobs = greenJobs() } = {}) {
  return {
    git: (root, ...args) => args[0] === "rev-parse" ? head : args[0] === "status" ? dirty : "",
    gh: (root, ...args) => {
      if (args[1] === "list") return JSON.stringify(runs);
      if (args.includes("--log")) return jobs[Number(args[args.indexOf("--job") + 1])].log;
      return JSON.stringify({ jobs: jobs.map((job, index) => ({ name: job.name, conclusion: job.conclusion, databaseId: index })) });
    }
  };
}

test("the import binds the receipt to the commit and names the hosted run", () => {
  const receipt = importCiTestReceipt({ root: process.cwd(), dryRun: true, run: fakeRun() });
  assert.equal(receipt.sourceRevision, SHA);
  assert.equal(receipt.command, "all");
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.passed, receipt.total);
  assert.equal(receipt.total, DEFAULT_SHARDS.reduce((sum, shard, index) => sum + 100 + index, 0));
  assert.deepEqual(receipt.origin, { type: "hosted-ci", workflow: "CI", runId: 77, attempt: 2 });
});

test("the import refuses a dirty tree, another commit, or a run that is not green", () => {
  const attempt = (overrides, sha) => () => importCiTestReceipt({ root: process.cwd(), sha, dryRun: true, run: fakeRun(overrides) });
  assert.throws(attempt({ dirty: " M public/app.js" }), /working tree has changes/);
  assert.throws(attempt({}, "b".repeat(40)), /HEAD is aaaaaaaa, not bbbbbbbb/);
  assert.throws(attempt({ runs: [{ databaseId: 1, status: "completed", conclusion: "failure", headSha: SHA }] }), /No completed, successful CI run/);
  assert.throws(attempt({ runs: [{ databaseId: 1, status: "in_progress", conclusion: null, headSha: SHA }] }), /No completed, successful CI run/);
  assert.throws(attempt({ runs: [{ databaseId: 1, status: "completed", conclusion: "success", headSha: "c".repeat(40) }] }), /No completed, successful CI run/);
  assert.throws(attempt({}, "abc"), /40-character/);
});
