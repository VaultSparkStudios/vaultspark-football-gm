import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../public/lib/appState.js";

const KEY = "fa:achievements:v1";
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let moduleId = 0;
const record = (date = "2026-01-01T00:00:00.000Z", franchise = "BUF 2026") => ({ earnedAt: date, franchise });

async function fixture(t, initial = null) {
  const data = new Map(initial == null ? [] : [[KEY, initial]]);
  const controls = { readDenied: false, writeDenied: false, getterDenied: false, writes: 0 };
  const storage = {
    getItem(key) { if (controls.readDenied) throw Error("denied"); return data.get(key) ?? null; },
    setItem(key, value) { if (controls.writeDenied) throw Error("quota"); controls.writes++; data.set(key, value); }
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { if (controls.getterDenied) throw Error("getter denied"); return storage; } });
  const content = { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; } };
  const kicker = { textContent: "" };
  globalThis.document = { getElementById(id) { return id === "trophyCaseContent" ? content : id === "trophyCasePanel" ? { querySelector: () => kicker } : null; } };
  state.dashboard = null;
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else delete globalThis.localStorage;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete globalThis.document;
    state.dashboard = null;
  });
  const trophies = await import(`../public/lib/achievements.js?continuity=${++moduleId}`);
  return { trophies, controls, data, content, kicker };
}

for (const failure of ["writeDenied", "readDenied", "getterDenied"]) {
  test(`trophies remain visible and deduplicate after ${failure}`, async t => {
    const f = await fixture(t);
    f.controls[failure] = true;
    assert.deepEqual(f.trophies.recordAchievementEvent("draft-pick").unlocked.map(a => a.id), ["first-pick"]);
    assert.ok(f.trophies.readEarnedAchievements()["first-pick"]);
    assert.deepEqual(f.trophies.recordAchievementEvent("draft-pick").unlocked, []);
    f.trophies.renderTrophyCase();
    assert.match(f.content.innerHTML, /1 \/ 29 trophies earned/);
    assert.match(f.content.innerHTML, /new trophies stay in this tab only/);
    assert.doesNotMatch(f.kicker.textContent, /Permanent/);
    assert.equal(f.controls.writes, 0);
  });
}

test("recovery merges durable trophies with tab awards and retries persistence", async t => {
  const f = await fixture(t, JSON.stringify({ "first-trade": record() }));
  f.controls.getterDenied = true;
  f.trophies.recordAchievementEvent("draft-pick");
  f.controls.getterDenied = false;
  const earned = f.trophies.readEarnedAchievements();
  assert.deepEqual(Object.keys(earned).sort(), ["first-pick", "first-trade"]);
  assert.deepEqual(JSON.parse(f.data.get(KEY)), earned);
  assert.deepEqual(f.trophies.recordAchievementEvent("trade-committed").unlocked, []);
  f.trophies.renderTrophyCase();
  assert.match(f.content.innerHTML, /Saved across every franchise in this browser/);
  assert.doesNotMatch(f.content.innerHTML, /this tab only/);
});

test("quota recovery keeps other-tab awards and the earliest unlock", async t => {
  const f = await fixture(t);
  f.controls.writeDenied = true;
  f.trophies.recordAchievementEvent("draft-pick");
  f.data.set(KEY, JSON.stringify({ "first-trade": record(), "first-pick": record() }));
  f.controls.writeDenied = false;
  const earned = f.trophies.readEarnedAchievements();
  assert.deepEqual(earned["first-pick"], record());
  assert.ok(earned["first-trade"]);
  assert.deepEqual(JSON.parse(f.data.get(KEY)), earned);
});

test("registry validation discards malformed and unknown records without inventing awards", async t => {
  const f = await fixture(t, JSON.stringify({
    "first-pick": record(), "first-trade": true, "first-win": { earnedAt: "invalid" },
    champion: { earnedAt: 123 }, dynasty: [], unknown: record(),
    "first-season": { earnedAt: "2026-02-01", franchise: { secret: "not rendered" } }
  }));
  assert.deepEqual(f.trophies.readEarnedAchievements(), { "first-pick": record(), "first-season": { earnedAt: "2026-02-01", franchise: "" } });
  for (const malformed of ["null", "[]", "7", '"value"', "{broken"]) {
    f.data.set(KEY, malformed);
    assert.deepEqual(f.trophies.readEarnedAchievements(), {});
  }
});

test("browser-wide trophies persist across franchise changes and callers cannot mutate cached records", async t => {
  const f = await fixture(t);
  state.dashboard = { controlledTeamId: "BUF", controlledTeam: { abbrev: "BUF" }, currentYear: 2026 };
  f.trophies.recordAchievementEvent("draft-pick");
  state.dashboard = { controlledTeamId: "MIA", controlledTeam: { abbrev: "MIA" }, currentYear: 2027 };
  assert.deepEqual(f.trophies.recordAchievementEvent("draft-pick").unlocked, []);
  f.controls.readDenied = true;
  const earned = f.trophies.readEarnedAchievements();
  earned["first-pick"].franchise = "tampered";
  delete earned["first-pick"];
  assert.equal(f.trophies.readEarnedAchievements()["first-pick"].franchise, "BUF 2026");
});
