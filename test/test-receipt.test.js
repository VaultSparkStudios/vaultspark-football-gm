import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTestReceipt,
  computeTestSurfaceDigest,
  inspectTestReceipt,
  parseTapSummary,
  writeTestReceiptAtomic
} from "../scripts/lib/test-receipt.mjs";

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fa-test-receipt-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests-ui"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "engine.js"), "export const engine = true;\n");
  fs.writeFileSync(path.join(root, "public", "app.js"), "export const app = true;\n");
  fs.writeFileSync(path.join(root, "test", "one.test.js"), "test('one', () => {});\n");
  fs.writeFileSync(path.join(root, "tests-ui", "app.spec.js"), "test('ui', () => {});\n");
  fs.writeFileSync(path.join(root, "scripts", "run-test-shard.mjs"), "export const SHARDS = {};\n");
  return root;
}

test("TAP summaries reconcile direct pass/fail counts", () => {
  assert.deepEqual(
    parseTapSummary("# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"),
    { valid: true, reason: null, tests: 3, pass: 3, fail: 0, cancelled: 0, skipped: 0, todo: 0 }
  );
  assert.equal(parseTapSummary("no summary").valid, false);
});

test("a complete green run writes a fresh source-bound receipt", () => {
  const root = fixtureRoot();
  const receipt = buildTestReceipt({
    root,
    generatedAt: "2026-07-22T00:00:00.000Z",
    shards: [
      { name: "core", status: 0, summary: { valid: true, tests: 2, pass: 2, fail: 0 } },
      { name: "studio", status: 0, summary: { valid: true, tests: 1, pass: 1, fail: 0 } }
    ]
  });
  writeTestReceiptAtomic(root, receipt);
  const inspection = inspectTestReceipt(root);
  assert.equal(inspection.fresh, true);
  assert.equal(inspection.receipt.passed, 3);
  assert.equal(inspection.receipt.total, 3);
});

test("failed or partial runs cannot create a green receipt", () => {
  const root = fixtureRoot();
  assert.throws(() => buildTestReceipt({
    root,
    shards: [{ name: "core", status: 1, summary: { valid: true, tests: 2, pass: 1, fail: 1 } }]
  }), /green receipt/);
});

test("changing any test surface invalidates the previous receipt", () => {
  const root = fixtureRoot();
  const before = computeTestSurfaceDigest(root);
  const receipt = buildTestReceipt({
    root,
    shards: [{ name: "core", status: 0, summary: { valid: true, tests: 1, pass: 1, fail: 0 } }]
  });
  writeTestReceiptAtomic(root, receipt);
  fs.appendFileSync(path.join(root, "test", "one.test.js"), "// changed\n");
  const after = computeTestSurfaceDigest(root);
  assert.notEqual(after.digest, before.digest);
  assert.equal(inspectTestReceipt(root).fresh, false);
});
test("changing production source invalidates the previous receipt", () => {
  const root = fixtureRoot();
  const receipt = buildTestReceipt({
    root,
    shards: [{ name: "core", status: 0, summary: { valid: true, tests: 1, pass: 1, fail: 0 } }]
  });
  writeTestReceiptAtomic(root, receipt);
  fs.appendFileSync(path.join(root, "public", "app.js"), "// source changed\n");
  assert.equal(inspectTestReceipt(root).fresh, false);
  assert.match(inspectTestReceipt(root).reason, /source or test surface changed/);
});
