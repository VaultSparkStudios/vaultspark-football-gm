import test from "node:test";
import assert from "node:assert/strict";
import { createTabHydrationAuthority, TAB_HYDRATION_DOMAINS, validateHydrationTopology } from "../public/lib/tabHydration.js";

test("cold Overview requests no secondary domains and first tab visit loads exact owners once", async () => {
  const calls = [];
  const authority = createTabHydrationAuthority({
    loaders: {
      roster: async () => calls.push("roster")
    },
    getAuthority: () => "fa-a",
    domainsByTab: { overviewTab: [], rosterTab: ["roster"] }
  });
  assert.deepEqual((await authority.hydrateTab("overviewTab")).requested, []);
  assert.deepEqual(calls, []);
  assert.deepEqual((await authority.hydrateTab("rosterTab")).loaded, ["roster"]);
  assert.deepEqual((await authority.hydrateTab("rosterTab")).cached, ["roster"]);
  assert.deepEqual(calls, ["roster"]);
});

test("concurrent repeated activation coalesces one in-flight domain", async () => {
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const authority = createTabHydrationAuthority({
    loaders: { roster: async () => { calls += 1; await gate; } },
    getAuthority: () => "fa-a",
    domainsByTab: { rosterTab: ["roster"] }
  });
  const first = authority.hydrateTab("rosterTab");
  const second = authority.hydrateTab("rosterTab");
  await Promise.resolve();
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual([...left.loaded, ...right.loaded], ["roster"]);
  assert.deepEqual([...left.coalesced, ...right.coalesced], ["roster"]);
});

test("authority changes and explicit invalidation reload only stale domains", async () => {
  let scope = "fa-a";
  let calls = 0;
  const authority = createTabHydrationAuthority({
    loaders: { roster: async () => { calls += 1; } },
    getAuthority: () => scope,
    domainsByTab: { rosterTab: ["roster"] }
  });
  await authority.hydrateTab("rosterTab");
  scope = "fa-b";
  await authority.hydrateTab("rosterTab");
  authority.invalidate(["roster"]);
  await authority.hydrateTab("rosterTab");
  assert.equal(calls, 3);
});

test("failures are receipt-visible and retryable instead of cached", async () => {
  let calls = 0;
  const authority = createTabHydrationAuthority({
    loaders: { roster: async () => { calls += 1; if (calls === 1) throw new Error("offline"); } },
    getAuthority: () => "fa-a",
    domainsByTab: { rosterTab: ["roster"] }
  });
  const failed = await authority.hydrateTab("rosterTab");
  assert.deepEqual(failed.failures, [{ name: "roster", message: "offline" }]);
  assert.deepEqual((await authority.hydrateTab("rosterTab")).loaded, ["roster"]);
  assert.equal(calls, 2);
});

test("every public game tab has an explicit hydration declaration", () => {
  assert.deepEqual(Object.keys(TAB_HYDRATION_DOMAINS).sort(), [
    "calendarTab", "contractsTab", "depthTab", "draftTab", "faTab", "historyTab", "logTab",
    "overviewTab", "rosterTab", "rulesTab", "scoutingTab", "settingsTab", "statsTab", "transactionsTab"
  ]);
});

test("hydration topology proves shell parity and rejects missing or orphaned loaders", async () => {
  const html = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/game.html", import.meta.url), "utf8"));
  const shellTabs = [...html.matchAll(/class="menu-btn[^"]*"[^>]*data-tab="([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(shellTabs, Object.keys(TAB_HYDRATION_DOMAINS).sort());
  assert.throws(
    () => validateHydrationTopology({ loaders: {}, domainsByTab: { rosterTab: ["roster"] } }),
    /missing loader roster/
  );
  assert.throws(
    () => validateHydrationTopology({ loaders: { roster: async () => {}, ghost: async () => {} }, domainsByTab: { rosterTab: ["roster"] } }),
    /orphaned loaders: ghost/
  );
});

test("game flow boots Overview through the demand authority instead of all secondary panels", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8"));
  assert.match(source, /queueStartupHydration\(\)[\s\S]*hydrateTab\("overviewTab"\)/);
  assert.doesNotMatch(source, /queueStartupHydration\(\)[\s\S]{0,160}loadSecondaryPanels/);
  assert.match(source, /activateTab\(tabId\)[\s\S]*hydrateTab\(tabId\)/);
});
