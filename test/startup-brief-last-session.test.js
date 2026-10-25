import assert from "node:assert/strict";
import test from "node:test";

import { renderLastCompleted, describeDeploymentReceipt } from "../scripts/lib/brief-blocks.mjs";
import { closedSessionFromSil, closedSessionFromStatus, resolveRunSession, sessionIdFromLock } from "../scripts/lib/session-identity.mjs";
import { readFileSync } from "node:fs";

test("structured last-session summaries fail closed on expected-session drift", () => {
  const rendered = renderLastCompleted({ session: 79, shipped: ["old truth"], tests: "green", deploy: "staged" }, { expectedSession: 80 });
  assert.match(rendered, /STALE LAST SESSION SUMMARY/);
  assert.match(rendered, /Expected S80; PROJECT_STATUS summary says S79/);
  assert.doesNotMatch(rendered, /old truth/);
});

test("structured summary renders only when its session matches", () => {
  const rendered = renderLastCompleted({ session: "S80", shipped: ["current truth"], tests: "12\/12", deploy: "staged" }, { expectedSession: 80 });
  assert.match(rendered, /LAST SESSION \(S80\)/);
  assert.match(rendered, /current truth/);
  assert.doesNotMatch(rendered, /STALE/);
});

test('deployment objects report evidence without inventing a verified verdict', () => {
  assert.equal(describeDeploymentReceipt(null), '—');
  assert.equal(describeDeploymentReceipt('staged'), 'staged');
  assert.equal(describeDeploymentReceipt({ checksPassed: 14, checksTotal: 14, sourceRevision: 'abcdef0123456789' }), 'recorded 14/14 checks @abcdef01');
  assert.equal(describeDeploymentReceipt({ summary: { status: 'blocked', checksPassed: 3, checksTotal: 14 } }), 'blocked 3/14 checks');
  assert.equal(describeDeploymentReceipt({ summary: { status: 'verified', checksPassed: 14, checksTotal: 14 } }), 'verified 14/14 checks');
  assert.equal(describeDeploymentReceipt({ checksPassed: 99, checksTotal: 14 }), 'recorded');
  for (const summary of ['S80 current truth', { session: 80, shipped: ['current truth'], deploy: {} }]) {
    const rendered = renderLastCompleted(summary, { expectedSession: 80, deploy: { status: 'failed', sourceRevision: 'abcdef0123456789' } });
    assert.match(rendered, /Deploy failed @abcdef01/);
    assert.doesNotMatch(rendered, /\[object Object\]/);
  }
});

test("string summaries render supplied verification receipts instead of blank placeholders", () => {
  const rendered = renderLastCompleted("S98 -- current truth", {
    expectedSession: 98,
    tests: "1,303/1,303 across six shards",
    deploy: "10/10 production provenance"
  });
  assert.match(rendered, /Tests\s+1,303\/1,303/);
  assert.match(rendered, /Deploy\s+10\/10 production provenance/);
  assert.doesNotMatch(rendered, /Tests\s+-/);
});

test("missing structured session cannot silently satisfy an expected session", () => {
  const rendered = renderLastCompleted({ shipped: ["unbound claim"] }, { expectedSession: 80 });
  assert.match(rendered, /summary says S\?/);
  assert.doesNotMatch(rendered, /unbound claim/);
});

test("where-we-left-off falls back to the verified production receipt", () => {
  const source = readFileSync(new URL("../scripts/render-startup-brief.mjs", import.meta.url), "utf8");
  assert.match(source, /status\.lastVerification\?\.production/);
  assert.match(source, /Deploy: \$\{lastDeploySignal\}/);
});

test("session identity gives the active lock authority over closed-session surfaces", () => {
  assert.equal(sessionIdFromLock("session_id: 99\n"), 99);
  assert.equal(closedSessionFromStatus({ currentSession: 96, lastSession: 98, silLastSession: 97 }), 98);
  assert.equal(closedSessionFromSil("## Session 97 — old\n## Session 98 — latest\n"), 98);
  assert.deepEqual(resolveRunSession("unused", { lockText: "session_id: 99\n" }), {
    session: 99,
    source: "lock",
    outOfBand: false
  });
});

test("session lock writer declares a non-mutating help path, trigger, and session id", () => {
  const source = readFileSync(new URL("../scripts/write-session-lock.mjs", import.meta.url), "utf8");
  assert.match(source, /args\.includes\('--help'\)/);
  assert.match(source, /trigger: \$\{triggerArg\}/);
  assert.match(source, /session_id: \$\{sessionId\}/);
});
