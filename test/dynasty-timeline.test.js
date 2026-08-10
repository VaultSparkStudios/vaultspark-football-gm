import assert from "node:assert/strict";
import test from "node:test";

import { isActivationKey, mount, renderNodesHTML } from "../public/lib/dynastyTimeline.js";

// dynastyTimeline.js's season nodes were mouse-only (click-only expand/collapse,
// no role/tabindex/aria-expanded). This repo has no jsdom, so — matching the
// existing pattern in test/modal-manager.test.js — we exercise the module
// against a minimal hand-built fake DOM implementing exactly the surface the
// module calls (innerHTML, querySelectorAll, addEventListener, dataset).

const seasons = [
  { year: 2026, record: "12-5", champion: false, playoffRound: "wildcard" },
  { year: 2027, record: "14-3", champion: true, playoffRound: null },
  { year: 2028, record: "8-9", champion: false, playoffRound: null }
];

function fakeNode(idx) {
  const listeners = {};
  return {
    dataset: { idx: String(idx) },
    addEventListener(type, handler) { listeners[type] = handler; },
    _fireClick() { listeners.click?.(); },
    _fireKeydown(event) { listeners.keydown?.(event); }
  };
}

function fakeContainer(nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => fakeNode(i));
  let html = "";
  return {
    nodes,
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; },
    querySelectorAll(selector) { return selector === "[data-idx]" ? nodes : []; },
    querySelector(selector) { return selector === ".tl-detail-panel" ? { scrollIntoView() {} } : null; }
  };
}

// ── isActivationKey (pure) ──────────────────────────────────────────────────

test("Enter and Space are activation keys; other keys are not", () => {
  assert.equal(isActivationKey({ key: "Enter" }), true);
  assert.equal(isActivationKey({ key: " " }), true);
  assert.equal(isActivationKey({ key: "Tab" }), false);
  assert.equal(isActivationKey({ key: "a" }), false);
  assert.equal(isActivationKey(null), false);
});

// ── renderNodesHTML markup (pure) ───────────────────────────────────────────

test("every season node carries role=button, tabindex=0, and aria-controls pointing at the detail panel", () => {
  const html = renderNodesHTML(seasons, -1, "#4a8fb5", "tl-detail-panel-x");
  const matches = [...html.matchAll(/<div class="[^"]*" data-idx="\d+"[^>]*>/g)];
  assert.equal(matches.length, seasons.length);
  for (const [tag] of matches) {
    assert.match(tag, /role="button"/);
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /aria-controls="tl-detail-panel-x"/);
  }
});

test("aria-expanded reflects activeIdx and only the active node is true", () => {
  const html = renderNodesHTML(seasons, 1, "#4a8fb5", "tl-detail-panel-x");
  const matches = [...html.matchAll(/data-idx="(\d+)"[^>]*aria-expanded="(true|false)"/g)];
  assert.deepEqual(
    matches.map(([, idx, expanded]) => [Number(idx), expanded]),
    [[0, "false"], [1, "true"], [2, "false"]]
  );
});

test("no active node (activeIdx -1) renders every node collapsed", () => {
  const html = renderNodesHTML(seasons, -1, "#4a8fb5", "tl-detail-panel-x");
  assert.equal([...html.matchAll(/aria-expanded="true"/g)].length, 0);
  assert.equal([...html.matchAll(/aria-expanded="false"/g)].length, seasons.length);
});

test("node order in the generated markup matches visual/data order (focus order parity)", () => {
  const html = renderNodesHTML(seasons, -1, "#4a8fb5", "tl-detail-panel-x");
  const order = [...html.matchAll(/data-idx="(\d+)"/g)].map(([, idx]) => Number(idx));
  assert.deepEqual(order, [0, 1, 2]);
});

// ── mount() integration: keyboard parity with click ────────────────────────

test("Enter on a season node expands it exactly like a click does", () => {
  const container = fakeContainer(seasons.length);
  mount(container, { seasons, teamId: "BUF" });

  container.nodes[1]._fireKeydown({ key: "Enter", preventDefault() {} });
  assert.match(container.innerHTML, /data-idx="1"[^>]*aria-expanded="true"/);
});

test("Space on a season node expands it exactly like a click does", () => {
  const container = fakeContainer(seasons.length);
  mount(container, { seasons, teamId: "BUF" });

  container.nodes[2]._fireKeydown({ key: " ", preventDefault() {} });
  assert.match(container.innerHTML, /data-idx="2"[^>]*aria-expanded="true"/);
});

test("activating the same node twice (click then Enter) collapses it again, matching click-toggle behavior", () => {
  const container = fakeContainer(seasons.length);
  mount(container, { seasons, teamId: "BUF" });

  container.nodes[0]._fireClick();
  assert.match(container.innerHTML, /data-idx="0"[^>]*aria-expanded="true"/);

  container.nodes[0]._fireKeydown({ key: "Enter", preventDefault() {} });
  assert.match(container.innerHTML, /data-idx="0"[^>]*aria-expanded="false"/);
});

test("a non-activation key on a season node does nothing", () => {
  const container = fakeContainer(seasons.length);
  mount(container, { seasons, teamId: "BUF" });

  container.nodes[0]._fireKeydown({ key: "Tab", preventDefault() {} });
  assert.match(container.innerHTML, /data-idx="0"[^>]*aria-expanded="false"/);
});

test("mount on an empty history renders the empty state without throwing", () => {
  const container = fakeContainer(0);
  assert.doesNotThrow(() => mount(container, { seasons: [], teamId: "BUF" }));
  assert.match(container.innerHTML, /No franchise history yet/);
});
