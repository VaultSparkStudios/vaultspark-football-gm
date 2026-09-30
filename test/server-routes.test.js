import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "../scripts/lib/safe-spawn.mjs";

/**
 * Live HTTP coverage for src/server.js.
 *
 * Every other test in this repo exercises the *browser* adapter
 * (src/app/api/localApiRuntime.js) or reads src/server.js as source text for
 * contract-parity greps. Nothing ever executed the server's route handlers, so
 * a server-only defect could ship with a fully green suite — and one did: the
 * S63 press-conference POST route called `sendJson(status, payload)` without
 * its `res` argument, which every node test passed straight over and which
 * surfaced only as `res.writeHead is not a function` in a browser session.
 *
 * These tests boot the real server on a free port and speak HTTP to it, so the
 * two adapters are proved equivalent by execution rather than by grep.
 */

const CONTROLLED = "BUF";

/**
 * The real `fetch`, captured at module load.
 *
 * Other files in this shard stub `globalThis.fetch` to test client behaviour,
 * and the runtime shard shares one process across every file
 * (`--test-isolation=none`). Those stubs used to leak — this file's requests
 * resolved instantly against a stub and failed with "Unexpected end of JSON
 * input" only in the full shard. The leak is fixed at its source (both stubbing
 * files now restore the global), and binding the real implementation here means
 * these tests cannot be poisoned by a future stub that forgets to.
 */
const realFetch = globalThis.fetch;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForReady(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await realFetch(`${base}/api/state`);
      if (response.ok) return true;
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

/**
 * One server for the whole file.
 *
 * The runtime shard runs all of its files in a single process
 * (`--test-isolation=none`), so booting a server per test put six full league
 * generations on an already-saturated event loop and blew the readiness window —
 * green in isolation, six failures in the shard. A single long-lived server is
 * both far cheaper and far more tolerant of load.
 *
 * Sharing it is safe here because no test depends on a pristine baseline: the
 * two that mutate touch different subsystems (the podium and the coaching
 * market), and the rival-untouched test reads its own before/after pair.
 */
let server = null;
let serverBase = null;
let saveDirectory = null;

before(async () => {
  const port = await freePort();
  saveDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fa-server-routes-"));
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: process.cwd(),
    // One fixture executes many independent HTTP assertions in seconds; use
    // the existing harness budget without changing the production 50/min limit.
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", VSFGM_SAVE_DIR: saveDirectory, VSFGM_RATE_LIMIT_PER_MIN: "500" },
    // stdout is discarded rather than piped. A piped stream that nobody drains
    // fills its ~64KB buffer and then blocks the child on write — the server
    // stays alive but stops answering, which surfaced as an empty response body
    // ("Unexpected end of JSON input") only in the full 78-file runtime shard,
    // where this hook runs once and the server then idles for many minutes
    // while every other file executes. stderr stays piped and *is* drained, so
    // a real crash still reports its reason.
    stdio: ["ignore", "ignore", "pipe"]
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  child.on("error", (error) => stderr.push(`spawn error: ${error.message}`));
  server = { child, stderr };
  serverBase = `http://127.0.0.1:${port}`;

  const ready = await waitForReady(serverBase, 180_000);
  assert.ok(ready, `server never became ready\n${stderr.join("")}`);
});

after(async () => {
  if (!server) return;
  server.child.kill();
  await new Promise((resolve) => server.child.once("exit", resolve));
  server = null;
  // Only this fixture's verified temporary directory is eligible for cleanup.
  if (saveDirectory && path.dirname(path.resolve(saveDirectory)) === path.resolve(os.tmpdir()) &&
      path.basename(saveDirectory).startsWith("fa-server-routes-")) {
    fs.rmSync(saveDirectory, { recursive: true, force: true });
  }
});

/** Run `body` against the shared server. */
async function withServer(run) {
  assert.ok(serverBase, "server base URL missing — did the before hook run?");
  return run(serverBase);
}

const getJson = async (base, path) => {
  const response = await realFetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
};

const postJson = async (base, path, payload) => {
  const response = await realFetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { status: response.status, body: await response.json() };
};

test("the real server answers core routes over HTTP", async () => {
  await withServer(async (base) => {
    const state = await getJson(base, "/api/state");
    assert.equal(state.status, 200);
    assert.ok(state.body.controlledTeamId);

    const unknown = await getJson(base, "/api/definitely-not-a-route");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.ok, false);
  });
});

test("the press-conference routes actually execute on the server adapter", async () => {
  await withServer(async (base) => {
    const read = await getJson(base, "/api/press-conference");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.equal(read.body.ok, true);
    assert.ok("pending" in read.body);
    assert.ok(Array.isArray(read.body.receipts));

    // Advance until the room asks something, then answer it over real HTTP.
    let pending = read.body.pending;
    for (let week = 0; week < 5 && !pending; week += 1) {
      let advanced = await postJson(base, "/api/advance-week", { count: 1 });
      if (advanced.status === 409 && advanced.body.reasonCode === "ADVANCE_WEEK_GM_DECISION_REQUIRED") {
        const decision = advanced.body.pendingDecision;
        assert.ok(decision?.options?.length, JSON.stringify(advanced.body));
        advanced = await postJson(base, "/api/advance-week", {
          count: 1,
          gmDecisionChoice: {
            decisionId: decision.id,
            occurrenceKey: decision.occurrenceKey,
            choiceId: decision.options[0].id
          }
        });
      }
      assert.equal(advanced.status, 200, JSON.stringify(advanced.body));
      pending = (await getJson(base, "/api/press-conference")).body.pending;
    }
    assert.ok(pending, "the server must open a podium after a controlled-team game");

    const answered = await postJson(base, "/api/press-conference", {
      teamId: CONTROLLED,
      responseId: "take-the-blame",
      questionId: pending.id
    });
    // The original defect produced a 500 with `res.writeHead is not a function`.
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.equal(answered.body.receipt.responseId, "take-the-blame");
    assert.ok(answered.body.state, "the answer must carry fresh state back");
    assert.equal(answered.body.pressRoom.pending, null);
  });
});

test("the coaching-market routes actually execute on the server adapter", async () => {
  await withServer(async (base) => {
    const market = await getJson(base, "/api/coaching-market?role=headCoach");
    assert.equal(market.status, 200, JSON.stringify(market.body));
    assert.equal(market.body.ok, true);
    assert.ok(market.body.candidates.length > 0);
    assert.ok(market.body.budget > 0);

    const pick = market.body.candidates.find((candidate) => candidate.affordable);
    assert.ok(pick, "a starting franchise must be able to afford someone");

    const hired = await postJson(base, "/api/coaching-market", {
      teamId: CONTROLLED,
      role: "headCoach",
      action: "hire",
      candidateId: pick.id
    });
    assert.equal(hired.status, 200, JSON.stringify(hired.body));
    assert.equal(hired.body.receipt.name, pick.name);

    const staff = await getJson(base, `/api/staff?team=${CONTROLLED}`);
    assert.equal(staff.body.staff.staff.headCoach.name, pick.name, "the hire must persist on the server");
  });
});

test("the franchise authority boundary is enforced by the server, not just the browser adapter", async () => {
  await withServer(async (base) => {
    for (const [path, payload] of [
      ["/api/staff", { teamId: "NYJ", role: "headCoach", name: "Saboteur" }],
      ["/api/owner", { teamId: "NYJ", staffBudget: 10_000_000, ticketPrice: 450 }],
      ["/api/coaching-market", { teamId: "NYJ", role: "headCoach", action: "fire" }],
      ["/api/press-conference", { teamId: "NYJ", responseId: "back-the-room" }],
      ["/api/release", { teamId: "NYJ", playerId: "p-1" }],
      ["/api/trade", { teamA: "NYJ", teamB: "MIA" }]
    ]) {
      const denied = await postJson(base, path, payload);
      assert.equal(denied.status, 403, `${path} must refuse a foreign franchise`);
      assert.equal(denied.body.reasonCode, "team-authority", `${path} must deny for the right reason`);
    }
  });
});

test("a denied server command leaves the rival untouched", async () => {
  await withServer(async (base) => {
    // Named to avoid shadowing the imported before/after hooks.
    const priorOwner = await getJson(base, "/api/owner?team=NYJ");
    await postJson(base, "/api/owner", { teamId: "NYJ", staffBudget: 10_000_000, ticketPrice: 450 });
    const laterOwner = await getJson(base, "/api/owner?team=NYJ");

    assert.equal(laterOwner.body.owner.owner.staffBudget, priorOwner.body.owner.owner.staffBudget);
    assert.equal(laterOwner.body.owner.owner.ticketPrice, priorOwner.body.owner.owner.ticketPrice);
  });
});

test("the server never answers a mutating route with an unhandled exception", async () => {
  // The defect class this file exists for surfaces as a 500 carrying a raw
  // JavaScript TypeError. Malformed input should always be a deliberate 4xx.
  await withServer(async (base) => {
    for (const [path, payload] of [
      ["/api/press-conference", { teamId: CONTROLLED }],
      ["/api/press-conference", { teamId: CONTROLLED, responseId: "nonsense" }],
      ["/api/coaching-market", { teamId: CONTROLLED, role: "headCoach", action: "hire" }],
      ["/api/coaching-market", { teamId: CONTROLLED, role: "waterBoy", action: "hire", candidateId: "x" }],
      ["/api/staff", { teamId: CONTROLLED, role: "headCoach", playcalling: 99 }]
    ]) {
      const response = await postJson(base, path, payload);
      assert.ok(response.status >= 400 && response.status < 500, `${path} answered ${response.status}`);
      assert.equal(response.body.ok, false);
      assert.ok(
        !/is not a function|undefined is not|Cannot read propert/i.test(String(response.body.error || "")),
        `${path} leaked a runtime error: ${response.body.error}`
      );
    }
  });
});

test("saved snapshot authority is checked over HTTP before replacing the active franchise", async () => {
  await withServer(async (base) => {
    const original = (await getJson(base, "/api/state")).body;
    const alternateTeam = original.controlledTeamId === "NYJ" ? "BUF" : "NYJ";
    const control = async teamId => {
      const response = await postJson(base, "/api/control-team", { teamId });
      assert.equal(response.status, 200, JSON.stringify(response.body));
    };
    for (const [route, slot] of [["/api/saves/load", "s112-source"], ["/api/backups/load", "auto-s112-source"]]) {
      await control(original.controlledTeamId);
      const saved = await postJson(base, "/api/saves/save", { slot });
      assert.equal(saved.status, 200);
      const expectedSavedSnapshotIntegrity = saved.body.savedSnapshotIntegrity;
      assert.equal(expectedSavedSnapshotIntegrity.algo, "fnv1a32");
      assert.ok(expectedSavedSnapshotIntegrity.length > 0);
      await control(alternateTeam);
      const active = (await getJson(base, "/api/state")).body;
      for (const expected of [null, {}, { ...expectedSavedSnapshotIntegrity, length: expectedSavedSnapshotIntegrity.length + 1 }]) {
        const denied = await postJson(base, route, { slot, expectedSavedSnapshotIntegrity: expected });
        assert.equal(denied.status, 409);
        assert.equal(denied.body.reasonCode, "RECOVERY_REFERENCE_CHANGED");
        const after = (await getJson(base, "/api/state")).body;
        assert.equal(after.franchiseId, active.franchiseId, "failed evidence must preserve the current franchise");
        assert.equal(after.controlledTeamId, active.controlledTeamId);
      }
      const restored = await postJson(base, route, { slot, expectedSavedSnapshotIntegrity });
      assert.equal(restored.status, 200);
      assert.equal(restored.body.state.controlledTeamId, original.controlledTeamId);
      assert.deepEqual(restored.body.savedSnapshotIntegrity, expectedSavedSnapshotIntegrity, "restoration normalization cannot change raw saved authority");

      await control(alternateTeam);
      assert.equal((await postJson(base, "/api/saves/save", { slot })).status, 200);
      await control(original.controlledTeamId);
      const stale = await postJson(base, route, { slot, expectedSavedSnapshotIntegrity });
      assert.equal(stale.status, 409, "an overwritten slot must reject the old authority");
      assert.equal((await getJson(base, "/api/state")).body.controlledTeamId, original.controlledTeamId);
      const explicitlySelected = await postJson(base, route, { slot });
      assert.equal(explicitlySelected.status, 200, "explicit selection remains available without a prior authority stamp");
      assert.equal(explicitlySelected.body.state.controlledTeamId, alternateTeam);
    }
  });
});
