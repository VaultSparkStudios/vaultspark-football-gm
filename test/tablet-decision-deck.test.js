import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/lib/mobileLoop.js", import.meta.url), "utf8");

/**
 * The gate reads `localStorage` and `window.innerWidth`, so these tests stand up
 * the two globals it touches rather than a full DOM.
 */
function withEnvironment({ stored = null, innerWidth = 1280 }, run) {
  const priorStorage = globalThis.localStorage;
  const priorWindow = globalThis.window;
  const store = new Map();
  if (stored !== null) store.set("vsfgm_mobile_loop", stored);
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  globalThis.window = { innerWidth, addEventListener() {} };
  try {
    return run();
  } finally {
    globalThis.localStorage = priorStorage;
    globalThis.window = priorWindow;
  }
}

const loadGate = async () => (await import("../public/lib/mobileLoop.js"));

test("the tablet band now reaches the decision deck", async () => {
  const { isMobileModeEnabled, MOBILE_AUTO_MAX_WIDTH } = await loadGate();
  assert.equal(MOBILE_AUTO_MAX_WIDTH, 980);

  for (const width of [320, 480, 481, 640, 768, 834, 980]) {
    const on = withEnvironment({ innerWidth: width }, () => isMobileModeEnabled());
    assert.equal(on, true, `${width}px should auto-enable the deck`);
  }
});

test("desktop widths still get the full shell", async () => {
  const { isMobileModeEnabled } = await loadGate();
  for (const width of [981, 1024, 1440, 1920]) {
    const on = withEnvironment({ innerWidth: width }, () => isMobileModeEnabled());
    assert.equal(on, false, `${width}px must stay on the desktop layout`);
  }
});

test("an explicit preference wins in both directions, at every width", async () => {
  const { isMobileModeEnabled } = await loadGate();
  // Chose full view on a phone — must not be dragged back into the deck.
  assert.equal(withEnvironment({ stored: "0", innerWidth: 320 }, () => isMobileModeEnabled()), false);
  assert.equal(withEnvironment({ stored: "0", innerWidth: 768 }, () => isMobileModeEnabled()), false);
  // Chose the deck on a desktop — must keep it.
  assert.equal(withEnvironment({ stored: "1", innerWidth: 1920 }, () => isMobileModeEnabled()), true);
});

test("the gate accepts an explicit width so it is testable without a window", async () => {
  const { isMobileModeEnabled } = await loadGate();
  assert.equal(withEnvironment({ innerWidth: 1920 }, () => isMobileModeEnabled(700)), true);
  assert.equal(withEnvironment({ innerWidth: 320 }, () => isMobileModeEnabled(1400)), false);
});

test("the gate re-evaluates on viewport change rather than only at boot", () => {
  assert.match(source, /addEventListener\("resize"/, "a resize listener must exist");
  assert.match(source, /export function syncMobileMode/, "resize and toggle must share one path");
  assert.match(source, /resizeWired/, "the listener must bind once, not per render");
});

test("syncMobileMode hides the overlay when the gate turns off", () => {
  // The boot path only ever un-hid the overlay; leaving the deck on screen after
  // a resize back to desktop would be worse than never showing it.
  assert.match(source, /overlay\.classList\.add\("hidden"\)/);
});

test("the 480px gate is gone from live code, and only survives as history", () => {
  // The module header deliberately documents the old gate and why it was wrong.
  // Strip comments before asserting, so the explanation is allowed to mention
  // `480` while the executable path is not.
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join(" ");

  assert.ok(!/innerWidth <= 480/.test(executable), "the phone-only gate must not survive in live code");
  assert.ok(/innerWidth <= 480/.test(source), "but the header should still explain what changed and why");
});

test("the documented band matches the implemented band", () => {
  assert.match(source, /≤ 980px/, "the module header must state the band it actually enforces");
});
