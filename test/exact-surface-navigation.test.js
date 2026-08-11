import test from "node:test";
import assert from "node:assert/strict";
import { navigateToExactSurface } from "../public/lib/exactSurfaceNavigation.js";

function targetFixture() {
  const attributes = new Map();
  return {
    scrollOptions: null,
    focusOptions: null,
    hasAttribute(name) { return attributes.has(name); },
    setAttribute(name, value) { attributes.set(name, value); },
    scrollIntoView(options) { this.scrollOptions = options; },
    focus(options) { this.focusOptions = options; },
    attribute(name) { return attributes.get(name); }
  };
}

test("exact navigation waits for tab hydration before scrolling and focusing", async () => {
  const target = targetFixture();
  const order = [];
  const result = await navigateToExactSurface({ targetTab: "contractsTab", targetId: "contractsSpotlight" }, {
    activateTab: async (tabId) => {
      order.push(`activate:${tabId}`);
      await Promise.resolve();
      order.push("hydrated");
    },
    documentRef: { getElementById: (id) => id === "contractsSpotlight" ? target : null },
    schedule: (callback) => { order.push("scheduled"); callback(); }
  });

  assert.deepEqual(order, ["activate:contractsTab", "hydrated", "scheduled"]);
  assert.deepEqual(result, { targetTab: "contractsTab", targetId: "contractsSpotlight", focused: true, reason: "focused" });
  assert.deepEqual(target.scrollOptions, { behavior: "smooth", block: "center" });
  assert.deepEqual(target.focusOptions, { preventScroll: true });
  assert.equal(target.attribute("tabindex"), "-1");
});

test("exact navigation fails visibly when a declared surface is unavailable", async () => {
  const messages = [];
  const result = await navigateToExactSurface({ targetTab: "draftTab", targetId: "draftWarRoomPanel", label: "Draft room" }, {
    activateTab: () => undefined,
    documentRef: { getElementById: () => null },
    announce: (message) => messages.push(message),
    missingMessage: ({ label }) => `Opened the tab, but ${label} is unavailable.`
  });

  assert.equal(result.focused, false);
  assert.equal(result.reason, "target-unavailable");
  assert.deepEqual(messages, ["Opened the tab, but Draft room is unavailable."]);
});

test("a tab-only action remains explicit and never fabricates a focused surface", async () => {
  const result = await navigateToExactSurface({ targetTab: "overviewTab" }, { activateTab: () => undefined });
  assert.deepEqual(result, { targetTab: "overviewTab", targetId: null, focused: false, reason: "target-not-declared" });
});

test("exact navigation honors the player's reduced-motion preference", async () => {
  const target = targetFixture();
  await navigateToExactSurface({ targetTab: "contractsTab", targetId: "contractsSpotlight" }, {
    activateTab: () => undefined,
    documentRef: { getElementById: () => target },
    windowRef: { matchMedia: () => ({ matches: true }) }
  });

  assert.deepEqual(target.scrollOptions, { behavior: "auto", block: "center" });
});
