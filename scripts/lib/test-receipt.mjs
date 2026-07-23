import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEST_RECEIPT_SCHEMA_VERSION = "1.1";
export const TEST_RECEIPT_RELATIVE_PATH = path.join(".cache", "test-count.json");
const TEST_SURFACE_DIRS = ["src", "public", "scripts", "test", "tests-ui"];
const TEST_SURFACE_FILES = ["package.json", "package-lock.json", "playwright.config.mjs"];

function walkFiles(root, relativeDir, output) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) return;
  for (const name of fs.readdirSync(absolute).sort()) {
    const relative = path.join(relativeDir, name);
    const file = path.join(root, relative);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walkFiles(root, relative, output);
    else if (/\.(?:js|mjs|json|html|css)$/.test(name)) output.push(relative.replace(/\\/g, "/"));
  }
}

export function listTestSurfaceFiles(root = process.cwd()) {
  const files = [];
  for (const dir of TEST_SURFACE_DIRS) walkFiles(root, dir, files);
  for (const relative of TEST_SURFACE_FILES) {
    if (fs.existsSync(path.join(root, relative))) files.push(relative.replace(/\\/g, "/"));
  }
  return [...new Set(files)].sort();
}

export function computeTestSurfaceDigest(root = process.cwd()) {
  const hash = createHash("sha256");
  const files = listTestSurfaceFiles(root);
  for (const relative of files) {
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return { algorithm: "sha256", digest: hash.digest("hex"), files };
}

export function parseTapSummary(output = "") {
  const values = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const pattern = new RegExp(`(?:^|\\n)(?:#|ℹ)\\s*${key}\\s+(\\d+)\\s*(?:\\r?\\n|$)`, "g");
    let match = null;
    let latest = null;
    while ((match = pattern.exec(String(output)))) latest = Number(match[1]);
    values[key] = latest;
  }
  if (![values.tests, values.pass, values.fail].every(Number.isInteger)) {
    return { valid: false, reason: "TAP summary is missing tests/pass/fail totals.", ...values };
  }
  return {
    valid: values.tests === values.pass + values.fail + (values.cancelled || 0),
    reason: values.tests === values.pass + values.fail + (values.cancelled || 0)
      ? null
      : "TAP totals do not reconcile.",
    ...values
  };
}

export function buildTestReceipt({ root = process.cwd(), command = "all", shards = [], generatedAt = new Date().toISOString(), sourceRevision = null } = {}) {
  if (!shards.length || shards.some((entry) => entry.status !== 0 || !entry.summary?.valid)) {
    throw new Error("A green receipt requires valid direct summaries for every requested shard.");
  }
  const surface = computeTestSurfaceDigest(root);
  const total = shards.reduce((sum, entry) => sum + entry.summary.tests, 0);
  const passed = shards.reduce((sum, entry) => sum + entry.summary.pass, 0);
  const failed = shards.reduce((sum, entry) => sum + entry.summary.fail, 0);
  if (failed !== 0 || passed !== total) throw new Error("A green receipt cannot contain failed or unreconciled tests.");
  return {
    schemaVersion: TEST_RECEIPT_SCHEMA_VERSION,
    kind: "direct-test-receipt",
    generatedAt,
    command,
    sourceRevision,
    passed,
    total,
    failed,
    testSurface: surface,
    shards: shards.map((entry) => ({
      name: entry.name,
      passed: entry.summary.pass,
      total: entry.summary.tests,
      failed: entry.summary.fail,
      durationMs: entry.summary.durationMs ?? null
    }))
  };
}

export function writeTestReceiptAtomic(root, receipt) {
  const target = path.join(root, TEST_RECEIPT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
  return target;
}

export function inspectTestReceipt(root = process.cwd()) {
  const target = path.join(root, TEST_RECEIPT_RELATIVE_PATH);
  if (!fs.existsSync(target)) return { exists: false, valid: false, fresh: false, reason: "receipt missing", target };
  try {
    const receipt = JSON.parse(fs.readFileSync(target, "utf8"));
    const surface = computeTestSurfaceDigest(root);
    const valid = receipt?.schemaVersion === TEST_RECEIPT_SCHEMA_VERSION
      && receipt?.kind === "direct-test-receipt"
      && Number.isInteger(receipt.passed)
      && Number.isInteger(receipt.total)
      && receipt.failed === 0
      && receipt.passed === receipt.total
      && Array.isArray(receipt.shards)
      && receipt.shards.length > 0;
    const fresh = valid
      && receipt.testSurface?.algorithm === surface.algorithm
      && receipt.testSurface?.digest === surface.digest;
    return {
      exists: true,
      valid,
      fresh,
      reason: !valid ? "receipt schema or totals invalid" : !fresh ? "verified source or test surface changed after receipt" : null,
      receipt,
      surface,
      target
    };
  } catch (error) {
    return { exists: true, valid: false, fresh: false, reason: error.message, target };
  }
}
