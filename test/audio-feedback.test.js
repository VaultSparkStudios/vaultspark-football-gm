import assert from "node:assert/strict";
import test from "node:test";

// audioFeedback.js (S70) is live at 7 call sites across 5 browser modules but
// had zero automated coverage before S78. It reads `localStorage`,
// `window.AudioContext`, and `navigator.vibrate` as ambient globals, so —
// matching the pattern in test/tablet-decision-deck.test.js — these tests
// stand up minimal fakes for exactly the globals the module touches rather
// than a full DOM/Web-Audio stack.
//
// This repo's shard runner uses `--test-isolation=none`, so every test below
// sets its globals fresh and restores them in a `finally`, per the discipline
// already established in test/modal-manager.test.js and test/tablet-decision-deck.test.js.

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
}

function fakeAudioContext() {
  const created = [];
  class FakeOscillator {
    constructor() {
      this.type = null;
      this.frequency = { value: 0 };
      this.started = null;
      this.stopped = null;
    }
    connect(target) { return target; }
    start(at) { this.started = at; }
    stop(at) { this.stopped = at; }
  }
  class FakeGain {
    constructor() {
      this.ramps = [];
      this.gain = {
        setValueAtTime: (v, t) => this.ramps.push(["set", v, t]),
        exponentialRampToValueAtTime: (v, t) => this.ramps.push(["exp", v, t])
      };
    }
    connect(target) { return target; }
  }
  const context = {
    currentTime: 0,
    destination: {},
    state: "running",
    createOscillator() { const o = new FakeOscillator(); created.push({ kind: "oscillator", node: o }); return o; },
    createGain() { const g = new FakeGain(); created.push({ kind: "gain", node: g }); return g; },
    resume: async () => {}
  };
  return { context, created };
}

// Node defines a built-in `navigator` global as a non-writable accessor, so a
// plain `globalThis.navigator = ...` assignment throws. Override it with
// defineProperty (configurable so it can be restored) instead.
function setGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
  return descriptor;
}
function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

function withEnvironment({ storage = {}, audioCtor, navigatorVibrate } = {}, run) {
  const priorStorage = setGlobal("localStorage", fakeStorage(storage));
  const priorWindow = setGlobal("window", audioCtor ? { AudioContext: audioCtor } : {});
  const priorNavigator = setGlobal("navigator", navigatorVibrate !== undefined ? { vibrate: navigatorVibrate } : {});
  try {
    return run();
  } finally {
    restoreGlobal("localStorage", priorStorage);
    restoreGlobal("window", priorWindow);
    restoreGlobal("navigator", priorNavigator);
  }
}

const loadModule = () => import(`../public/lib/audioFeedback.js?t=${Date.now()}-${Math.random()}`);

// ── isSoundEnabled reflects persisted setting ───────────────────────────────

test("isSoundEnabled defaults to true when nothing is persisted", async () => {
  const { isSoundEnabled } = await loadModule();
  const result = withEnvironment({}, () => isSoundEnabled());
  assert.equal(result, true);
});

test("isSoundEnabled reflects a persisted false value", async () => {
  const { isSoundEnabled } = await loadModule();
  const result = withEnvironment({ storage: { "fa:sound-enabled": "0" } }, () => isSoundEnabled());
  assert.equal(result, false);
});

test("isSoundEnabled reflects a persisted true value", async () => {
  const { isSoundEnabled } = await loadModule();
  const result = withEnvironment({ storage: { "fa:sound-enabled": "1" } }, () => isSoundEnabled());
  assert.equal(result, true);
});

test("setSoundEnabled persists the flag isSoundEnabled subsequently reads", async () => {
  const { isSoundEnabled, setSoundEnabled } = await loadModule();
  withEnvironment({}, () => {
    setSoundEnabled(false);
    assert.equal(isSoundEnabled(), false);
    setSoundEnabled(true);
    assert.equal(isSoundEnabled(), true);
  });
});

// ── playSound: palette lookup + gating ──────────────────────────────────────

const KNOWN_SOUNDS = [
  "advance-tick", "win-chime", "loss-thud", "sign-thunk",
  "draft-brass", "tier-fanfare", "td-flourish", "trophy-unlock"
];

test("playSound looks up and plays every defined PALETTE entry, including td-flourish", async () => {
  // audioFeedback.js caches its AudioContext at module scope once created, so
  // each sound gets a fresh module instance to keep its fake context isolated.
  for (const name of KNOWN_SOUNDS) {
    const { playSound } = await loadModule();
    const { context, created } = fakeAudioContext();
    const played = withEnvironment({ audioCtor: function () { return context; } }, () => playSound(name));
    assert.equal(played, true, `${name} should report it played`);
    assert.ok(created.some((c) => c.kind === "oscillator"), `${name} should create at least one oscillator`);
  }
});

test("playSound is a no-op — no AudioContext constructed at all — when sound is disabled", async () => {
  const { playSound } = await loadModule();
  let contextsConstructed = 0;
  const AudioCtorSpy = function () { contextsConstructed += 1; return fakeAudioContext().context; };
  const played = withEnvironment(
    { storage: { "fa:sound-enabled": "0" }, audioCtor: AudioCtorSpy },
    () => playSound("win-chime")
  );
  assert.equal(played, false);
  assert.equal(contextsConstructed, 0, "a disabled sound setting must never touch the Web Audio API");
});

test("an unknown sound name does not throw and reports it did not play", async () => {
  const { playSound } = await loadModule();
  const { context } = fakeAudioContext();
  let result;
  withEnvironment({ audioCtor: function () { return context; } }, () => {
    assert.doesNotThrow(() => { result = playSound("does-not-exist"); });
  });
  assert.equal(result, false);
});

test("playSound fails closed (returns false, does not throw) when no AudioContext constructor exists", async () => {
  const { playSound } = await loadModule();
  const played = withEnvironment({}, () => playSound("win-chime"));
  assert.equal(played, false);
});

// ── determinism ──────────────────────────────────────────────────────────────

test("the same sound name produces identical envelope parameters on repeated calls", async () => {
  // Fresh module instance per call so each gets its own isolated fake context
  // (module-cached AudioContext would otherwise make the second call reuse
  // the first call's context object instead of exercising its own).
  async function paramsFor() {
    const { playSound } = await loadModule();
    const { context, created } = fakeAudioContext();
    withEnvironment({ audioCtor: function () { return context; } }, () => playSound("tier-fanfare"));
    return created.map((c) => (c.kind === "oscillator"
      ? { kind: "oscillator", type: c.node.type, frequency: c.node.frequency.value, started: c.node.started, stopped: c.node.stopped }
      : { kind: "gain", ramps: c.node.ramps }));
  }
  const first = await paramsFor();
  const second = await paramsFor();
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
});

// ── haptics (navigator.vibrate) gating ──────────────────────────────────────

test("vibrate calls navigator.vibrate with the given pattern when haptics are enabled", async () => {
  const { vibrate } = await loadModule();
  const calls = [];
  const result = withEnvironment(
    { navigatorVibrate: (pattern) => { calls.push(pattern); return true; } },
    () => vibrate([30, 40, 60])
  );
  assert.equal(result, true);
  assert.deepEqual(calls, [[30, 40, 60]]);
});

test("vibrate is a no-op when haptics are disabled in settings", async () => {
  const { vibrate } = await loadModule();
  const calls = [];
  const result = withEnvironment(
    { storage: { "fa:haptics-enabled": "0" }, navigatorVibrate: (pattern) => { calls.push(pattern); return true; } },
    () => vibrate([30])
  );
  assert.equal(result, false);
  assert.equal(calls.length, 0);
});

test("vibrate fails closed when navigator.vibrate does not exist", async () => {
  const { vibrate } = await loadModule();
  const result = withEnvironment({ navigatorVibrate: undefined }, () => vibrate([30]));
  assert.equal(result, false);
});

test("HAPTIC_PATTERNS exposes the named patterns every call site depends on", async () => {
  const { HAPTIC_PATTERNS } = await loadModule();
  assert.deepEqual(Object.keys(HAPTIC_PATTERNS).sort(), ["loss", "tick", "unlock", "win"].sort());
});
