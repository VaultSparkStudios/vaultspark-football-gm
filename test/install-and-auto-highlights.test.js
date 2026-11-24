import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shouldAutoPlayHighlights, isAutoHighlightsEnabled, setAutoHighlightsEnabled } from "../public/lib/autoHighlights.js";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

function withStorage(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); }
    }
  });
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  };
  let result;
  try {
    result = run(store);
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

// ── Play highlights automatically ────────────────────────────────────────────

test("automatic highlights are off until the player turns them on, and the choice persists", () => {
  withStorage((store) => {
    assert.equal(isAutoHighlightsEnabled(), false, "off by default");
    setAutoHighlightsEnabled(true);
    assert.equal(store.get("fa:auto-highlights"), "1");
    assert.equal(isAutoHighlightsEnabled(), true);
    setAutoHighlightsEnabled(false);
    assert.equal(isAutoHighlightsEnabled(), false);
  });
});

test("automatic highlights read as off when storage is unavailable", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    assert.equal(isAutoHighlightsEnabled(), false);
    assert.doesNotThrow(() => setAutoHighlightsEnabled(true));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("the replay opens by itself only for a played game, with the setting on, full motion and nothing else open", () => {
  const game = { gameId: "g1", week: 3 };
  const on = { enabled: true, reducedMotion: false, modalOpen: false };
  assert.equal(shouldAutoPlayHighlights(game, on), true);
  assert.equal(shouldAutoPlayHighlights(game, { ...on, enabled: false }), false, "off by default means the recap card");
  assert.equal(shouldAutoPlayHighlights(game, { ...on, reducedMotion: true }), false, "reduced motion is never overridden");
  assert.equal(shouldAutoPlayHighlights(game, { ...on, modalOpen: true }), false, "never on top of an open dialog");
  assert.equal(shouldAutoPlayHighlights(null, on), false, "a bye has no game");
  assert.equal(shouldAutoPlayHighlights({ week: 3 }, on), false, "no game id, no replay");
});

test("the recap reaches the replay lazily and falls back to the recap card", () => {
  const recap = read("../public/lib/rewardBeats.js");
  assert.match(recap, /shouldAutoPlayHighlights\(game, \{\s*enabled: isAutoHighlightsEnabled\(\),\s*reducedMotion: prefersReducedMotion\(\),\s*modalOpen: hasOpenModal\(\)/);
  assert.match(recap, /if \(await \(await import\("\.\/simWatchDirector\.js"\)\)\.runSimWatch\(game\.gameId\)\) return true;/);
  assert.doesNotMatch(recap, /^import [^;]*simWatchDirector/m, "the replay stays out of the recap's static imports");
  const start = recap.indexOf("export async function presentWeekRecap");
  assert.ok(recap.indexOf("showBeatCard({", start) > recap.indexOf("runSimWatch(game.gameId)", start), "the card is the fallback after the replay attempt");

  const settings = read("../public/game.html");
  const tab = settings.slice(settings.indexOf('<section id="settingsTab"'));
  assert.match(tab, /<input id="autoHighlightsInput" type="checkbox" \/> Play highlights automatically after my game/);
  assert.doesNotMatch(tab, /id="autoHighlightsInput"[^>]*checked/, "the box ships unchecked");
  const app = read("../public/app.js");
  assert.match(app, /autoHighlightsInput\.checked = isAutoHighlightsEnabled\(\)/);
  assert.match(app, /setAutoHighlightsEnabled\(autoHighlightsInput\.checked\)/);
});

// ── Install the app ──────────────────────────────────────────────────────────

function fakeScope({ standalone = false } = {}) {
  const handlers = new Map();
  return {
    handlers,
    addEventListener: (type, handler) => handlers.set(type, handler),
    matchMedia: (query) => ({ matches: standalone && query === "(display-mode: standalone)" }),
    navigator: {},
    document: null
  };
}

function fakeDocument() {
  const byId = new Map();
  const element = (tag) => {
    const node = {
      tag, children: [], listeners: {}, attributes: {}, hidden: false, id: "", className: "", textContent: "", type: "",
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      append(...nodes) { this.children.push(...nodes); },
      prepend(child) { this.children.unshift(child); if (child.id) byId.set(child.id, child); child.parent = this; },
      remove() { byId.delete(this.id); if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
    };
    return node;
  };
  const doc = { createElement: element, getElementById: (id) => byId.get(id) || null };
  const host = element("section");
  host.ownerDocument = doc;
  return { doc, host };
}

test("install offer rules: only when the browser can install, never when installed, hint once after a played week", async () => {
  const { installOffer, isInstalled } = await import("../public/lib/installPrompt.js");
  assert.deepEqual(installOffer({ hasPrompt: false, installed: false, hintDone: false, weekPlayed: true }), { action: false, hint: false }, "no browser offer, nothing shown");
  assert.deepEqual(installOffer({ hasPrompt: true, installed: true, hintDone: false, weekPlayed: true }), { action: false, hint: false }, "already installed");
  assert.deepEqual(installOffer({ hasPrompt: true, installed: false, hintDone: false, weekPlayed: false }), { action: true, hint: false }, "the hint waits for a played week");
  assert.deepEqual(installOffer({ hasPrompt: true, installed: false, hintDone: false, weekPlayed: true }), { action: true, hint: true });
  assert.deepEqual(installOffer({ hasPrompt: true, installed: false, hintDone: true, weekPlayed: true }), { action: true, hint: false }, "a dismissed hint never returns");
  assert.equal(isInstalled(fakeScope({ standalone: true })), true);
  assert.equal(isInstalled(fakeScope()), false);
  assert.equal(isInstalled({ navigator: { standalone: true } }), true, "iOS home-screen app");
});

test("the captured prompt drives the Settings button and a one-time Desk hint", async () => {
  await withStorage(async (store) => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const previousMatchMedia = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
    const { doc, host } = fakeDocument();
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    try {
      const install = await import("../public/lib/installPrompt.js");
      const scope = fakeScope();
      const button = doc.createElement("button");
      button.id = "installAppBtn";
      button.hidden = true;
      scope.document = { getElementById: (id) => (id === "installAppBtn" ? button : null) };
      assert.equal(install.maybeShowInstallHint(host), false, "no hint without a browser offer");

      let prompted = 0;
      const offer = () => ({ prompt: async () => { prompted += 1; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
      install.offerInstall(offer(), scope);
      assert.equal(button.hidden, false, "the Settings button appears once the browser can install");

      assert.equal(install.maybeShowInstallHint(host), true);
      assert.equal(install.maybeShowInstallHint(host), false, "one hint at a time");
      const hint = doc.getElementById("installHint");
      assert.equal(hint.attributes.role, "status");
      assert.deepEqual(hint.children.map((child) => child.textContent).slice(1), ["Install the app", "Not now"]);

      hint.children[2].listeners.click();
      assert.equal(doc.getElementById("installHint"), null, "Not now removes it");
      assert.equal(store.get("fa:install-hint-done"), "1");
      assert.equal(install.maybeShowInstallHint(host), false, "and it never returns");
      assert.equal(button.hidden, false, "Settings still offers installing on request");

      assert.equal(await install.promptInstall(), "accepted");
      assert.equal(prompted, 1);
      assert.equal(button.hidden, true, "a used prompt cannot be offered again");
      assert.equal(await install.promptInstall(), "unavailable");

      install.offerInstall(offer(), scope);
      assert.equal(button.hidden, false);
      assert.equal(Object.keys(button.listeners).length, 1, "the button is wired once");
      scope.handlers.get("appinstalled")();
      assert.equal(button.hidden, true, "installed: nothing left to offer");
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete globalThis.document;
      if (previousMatchMedia) Object.defineProperty(globalThis, "matchMedia", previousMatchMedia); else delete globalThis.matchMedia;
    }
  });
});

test("install wiring: captured at boot, offered in Settings and after a played week, nothing founder-gated touched", () => {
  const app = read("../public/app.js");
  assert.match(app, /^addEventListener\("beforeinstallprompt", \(event\) => \{\s*event\.preventDefault\(\);\s*installOffer = import\("\.\/lib\/installPrompt\.js"\)/m, "the shell catches the announcement, holds back the browser banner, and only then loads the offer");
  assert.doesNotMatch(app, /^import [^;]*installPrompt/m, "the offer stays out of the boot payload");
  assert.match(app, /installOffer\?\.then\(\(install\) => install\?\.maybeShowInstallHint\(\)\);\s*return hydration;/, "offered after a week has been played");
  const game = read("../public/game.html");
  const tab = game.slice(game.indexOf('<section id="settingsTab"'));
  assert.match(tab, /<button type="button" id="installAppBtn" hidden>Install the app<\/button>/, "hidden until the browser can install");
  const module = read("../public/lib/installPrompt.js");
  assert.doesNotMatch(module, /fetch\(|api\(|XMLHttpRequest|sendBeacon/, "the install offer sends nothing");
});

// ── Canvas and crest text use the bundled face ───────────────────────────────

test("crest and chart text name the bundled face first and wait for it without blocking", async () => {
  const { buildTeamCrestSvg } = await import("../public/lib/teamCrest.js");
  assert.match(buildTeamCrestSvg({ code: "BUF", city: "Buffalo", name: "Bills" }), /font-family="'Barlow Semi Condensed', /);
  const stats = read("../public/lib/tabStats.js");
  assert.match(stats, /const CHART_FONT = '700 11px "Barlow Semi Condensed", /);
  assert.match(stats, /document\.fonts\.load\(CHART_FONT\)\.then\(renderAnalyticsChart, \(\) => \{\}\)/, "redraws when the face arrives; a failed load is ignored");
  assert.doesNotMatch(stats, /await document\.fonts/, "drawing never waits on the font");
  for (const file of ["../public/lib/teamCrest.js", "../public/lib/tabStats.js", "../scripts/generate-cover-image.mjs"]) {
    assert.doesNotMatch(read(file), /Bahnschrift(?! SemiCondensed)/, `${file} no longer leads with a Windows-only face`);
  }
});
