import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertBrowserPromiseObservability,
  scanSourceForSilentPromiseSinks
} from "../scripts/check-browser-promise-observability.mjs";
import {
  createClientDiagnosticsLedger,
  observeBackgroundTask
} from "../public/lib/clientDiagnostics.js";

const root = path.resolve(import.meta.dirname, "..");

test("static guard rejects empty promise catches and the public tree is clean", async () => {
  assert.equal(scanSourceForSilentPromiseSinks("work().catch(() => {});", "fixture.js").length, 1);
  assert.equal(scanSourceForSilentPromiseSinks("work().catch(() => []);", "fixture.js").length, 1);
  assert.equal(scanSourceForSilentPromiseSinks("// observability-allow-silent: optional parse\nwork().catch(() => ({}));", "fixture.js").length, 0);
  assert.equal(scanSourceForSilentPromiseSinks("observeBackgroundTask(work);", "fixture.js").length, 0);
  const result = await assertBrowserPromiseObservability({ publicDir: path.join(root, "public") });
  assert.equal(result.findings, 0);
  assert.ok(result.checkedFiles > 20);
});

test("background failures are sanitized, coalesced, and recover through the matching retry", async () => {
  const ledger = createClientDiagnosticsLedger();
  let shouldFail = true;
  const task = async () => {
    if (shouldFail) throw new Error("GET https://game.test/jobs?token=secret Bearer abc.def");
    return "recovered";
  };
  assert.equal(await observeBackgroundTask(task, {
    surface: "jobs",
    operation: "poll",
    authorityKey: "league-1",
    ledger
  }), undefined);
  const degraded = ledger.snapshot();
  assert.equal(degraded.unresolved, 1);
  assert.equal(degraded.retryable, 1);
  assert.doesNotMatch(degraded.entries[0].message, /secret|abc\.def/);

  shouldFail = false;
  assert.deepEqual(await ledger.retryAll(), { attempted: 1, recovered: 1, remaining: 0 });
  assert.equal(ledger.snapshot().status, "healthy");
});

test("direct actions notify on failure while explicit optional absence stays healthy", async () => {
  const ledger = createClientDiagnosticsLedger();
  let shown = "";
  await observeBackgroundTask(async () => {
    throw new Error("clipboard denied");
  }, {
    surface: "action",
    operation: "copy",
    ledger,
    onError: (error) => { shown = error.message; }
  });
  assert.equal(shown, "clipboard denied");
  assert.equal(ledger.snapshot().unresolved, 1);

  const absent = new Error("optional route absent");
  absent.status = 404;
  await observeBackgroundTask(Promise.reject(absent), {
    surface: "optional",
    operation: "capability",
    optional: true,
    ledger
  });
  assert.equal(ledger.snapshot().entries.some((entry) => entry.surface === "optional"), false);
});

test("Pages build and Studio shard enforce the browser observability guard", async () => {
  const build = await fs.readFile(path.join(root, "scripts", "build-pages.mjs"), "utf8");
  const shard = await fs.readFile(path.join(root, "scripts", "run-test-shard.mjs"), "utf8");
  assert.match(build, /assertBrowserPromiseObservability\(\{ publicDir \}\)/);
  assert.match(shard, /browser-promise-observability\.test\.js/);
});
