import assert from "node:assert/strict";
import test from "node:test";

import { applyTheme, normalizeThemeSelection, resolveTheme, THEME_ACCENTS, THEME_MODES } from "../public/lib/themeCustomizer.js";

function installDom({ prefersLight = false } = {}) {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
  globalThis.window = { matchMedia: () => ({ matches: prefersLight }) };
  globalThis.document = { documentElement: { dataset: {} }, body: { dataset: {} } };
  return values;
}

test("theme customizer contract exposes System, Light, Dark and five stable accents", () => {
  assert.deepEqual(THEME_MODES.map((entry) => entry.id), ["system", "light", "dark"]);
  assert.deepEqual(THEME_ACCENTS.map((entry) => entry.id), ["gold", "emerald", "azure", "crimson", "violet"]);
  assert.deepEqual(normalizeThemeSelection("unknown", "neon"), { mode: "system", accent: "gold" });
});

test("system mode resolves from the OS and explicit selections persist on root and body", () => {
  const values = installDom({ prefersLight: true });
  assert.equal(resolveTheme("system"), "light");
  assert.deepEqual(applyTheme("dark", "violet"), { theme: "dark", mode: "dark", accent: "violet" });
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(document.body.dataset.accent, "violet");
  assert.equal(values.get("franchise-architect-theme-mode"), "dark");
  assert.equal(values.get("franchise-architect-accent"), "violet");
});

test("gold is the semantic default and removes stale accent attributes", () => {
  installDom();
  document.documentElement.dataset.accent = "crimson";
  document.body.dataset.accent = "crimson";
  const result = applyTheme("light", "gold");
  assert.equal(result.accent, "gold");
  assert.equal("accent" in document.documentElement.dataset, false);
  assert.equal("accent" in document.body.dataset, false);
});
