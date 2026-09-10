import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state } from "../public/lib/appState.js";
import { renderTradeDeadlineAlert } from "../public/lib/tabOverview.js";

// ── S102 · the frenzy board became a lazy root, so its wiring needs a gate ────
//
// `tradeDeadlineFrenzy.js` was downloaded on every boot to be used in the two
// or three weeks a season the declared trade window is open, which is what put
// the initial shell over its 650 KB target. Its call site was already guarded
// to that window; only its download was not. It is now a declared lazy root.
//
// Nothing else covers the new seam. The unit tests exercise the renderer
// directly, and the responsive captures are taken in Week 1 — outside the
// deadline window — so the rendered-pixel evidence for this release cannot see
// this path at all. A dynamic import that never resolves would look exactly
// like a board that correctly stayed hidden.

const DEADLINE_WEEK = 11;

function fakeElement(id) {
  return {
    id,
    hidden: false,
    textContent: "",
    innerHTML: "",
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
}

/**
 * Minimal DOM. Restored in a `finally` on every path: shards run in one process,
 * so an unrestored global stub poisons every file that runs after this one.
 *
 * `await`ing the callback is load-bearing rather than incidental. The seam under
 * test is a dynamic import, so the work happens after the callback's first
 * suspension point — a plain `try { return run() } finally { restore }` tears
 * the globals down while the import is still in flight, and the assertion then
 * reports a broken seam when the only broken thing is the harness. That is
 * exactly what this test did on its first draft.
 */
async function withFakeDocument(run) {
  const previousDocument = globalThis.document;
  const previousDashboard = state.dashboard;
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement(id));
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => fakeElement(tag),
    addEventListener() {}
  };
  try {
    return await run(elements);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    state.dashboard = previousDashboard;
  }
}

function deadlineDashboard(week = DEADLINE_WEEK) {
  return {
    phase: "regular-season",
    currentWeek: week,
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", abbrev: "BUF", capSpace: 12_000_000 },
    settings: { tradeDeadlineWeek: DEADLINE_WEEK },
    latestStandings: [
      { team: "BUF", wins: 8, losses: 2, ties: 0 },
      { team: "MIA", wins: 3, losses: 7, ties: 0 },
      { team: "NYJ", wins: 5, losses: 5, ties: 0 }
    ],
    rosterNeeds: [{ position: "WR", delta: -3 }]
  };
}

test("the deadline panel opens inside the declared window", async () => {
  await withFakeDocument((elements) => {
    state.dashboard = deadlineDashboard();
    renderTradeDeadlineAlert();
    assert.equal(elements.get("tradeDeadlinePanel").hidden, false, "the panel must be visible inside the window");
    assert.match(
      elements.get("tradeDeadlineStatus").textContent,
      /Week 11 of 18/,
      "the panel must still describe the week it is open in"
    );
  });
});

test("the lazily imported frenzy board actually resolves and renders", async () => {
  await withFakeDocument(async (elements) => {
    state.dashboard = deadlineDashboard();
    renderTradeDeadlineAlert();

    // The import is asynchronous by construction. Give the microtask queue and
    // the module load a bounded chance to settle rather than a fixed sleep.
    const container = globalThis.document.getElementById("tradeDeadlineFrenzy");
    for (let attempt = 0; attempt < 50 && !container.innerHTML; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.ok(
      container.innerHTML.length > 0,
      "the dynamic import resolved but painted nothing — the lazy seam is broken"
    );
  });
});

test("outside the window the board is neither shown nor downloaded", async () => {
  await withFakeDocument((elements) => {
    state.dashboard = deadlineDashboard(3);
    renderTradeDeadlineAlert();
    assert.equal(elements.get("tradeDeadlinePanel").hidden, true, "the panel must stay hidden in Week 3");
    assert.equal(
      globalThis.document.getElementById("tradeDeadlineFrenzy").innerHTML,
      "",
      "nothing may be painted outside the declared window"
    );
  });
});

// NEGATIVE CONTROL — a static import would defeat the entire change, and the
// boot-budget gate would only catch it as a byte count. Assert the seam
// structurally: the module must be reached through `import(` and must not
// appear in a top-level import statement.
test("negative control: the frenzy board is reached dynamically, not statically", () => {
  const source = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
  assert.ok(
    /import\(\s*["']\.\/tradeDeadlineFrenzy\.js["']\s*\)/.test(source),
    "the board must be loaded through a dynamic import"
  );
  assert.ok(
    !/^\s*import\s[^\n]*tradeDeadlineFrenzy\.js/m.test(source),
    "a static import would put the board back in the boot graph"
  );

  const manifest = JSON.parse(readFileSync(new URL("../public/boot-manifest.json", import.meta.url), "utf8"));
  assert.ok(
    manifest.lazyRoots.includes("lib/tradeDeadlineFrenzy.js"),
    "a lazy module that is not a declared lazy root is an undeclared boot leak"
  );
});
