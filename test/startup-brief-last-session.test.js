import assert from "node:assert/strict";
import test from "node:test";

import { renderLastCompleted } from "../scripts/lib/brief-blocks.mjs";

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

test("missing structured session cannot silently satisfy an expected session", () => {
  const rendered = renderLastCompleted({ shipped: ["unbound claim"] }, { expectedSession: 80 });
  assert.match(rendered, /summary says S\?/);
  assert.doesNotMatch(rendered, /unbound claim/);
});
