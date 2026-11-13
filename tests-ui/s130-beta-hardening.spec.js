import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  startStaticClientHost, configureClient, createClientLeague, assertRuntime,
  readClient, waitGameReady
} from "./helpers/static-client.js";
import { createPlayScenario } from "./helpers/weekly-scenarios.js";

// Explicit runtime fault fixtures below intercept browser requests or native
// browser capabilities. They never add product hooks or contact Community API.
test.use({ serviceWorkers: "block" });
test.setTimeout(120_000);
let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });

const COMMUNITY = "https://api-franchise-architect-football.vaultsparkstudios.com/community/v1";
const CONSENT = "fa:community-participation:v1";
const TOMBSTONE = "fa:community-pending-deletion:v1";
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const captureRun = new Date().toISOString().replace(/\D/g, "");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function frameRetryError(page) {
  await page.locator("#coachingMarketPanel .panel-error-state").evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  if (page.viewportSize().width <= 430) {
    await page.mouse.move(200, 600);
    await page.mouse.wheel(0, -220);
    await settle(page);
  }
}

async function captureState(page, state) {
  const directory = "output/playwright/s130-browser-states";
  await fs.mkdir(directory, { recursive: true });
  if (state.startsWith("community-")) await page.locator("[data-community-consent-shell]").scrollIntoViewIfNeeded();
  if (state === "coaching-module-retry-error") await frameRetryError(page);
  const viewport = page.viewportSize(), theme = await page.locator("html").getAttribute("data-theme");
  const device = viewport.width <= 430 ? "mobile" : "desktop";
  const file = `${directory}/${state}-${device}-${theme}-${captureRun}.png`;
  await page.screenshot({ path: file, animations: "disabled" });
  const manifest = JSON.parse(await fs.readFile("static/deploy-manifest.json", "utf8"));
  const receipt = { state, device, theme, viewport, file, sha256: hash(await fs.readFile(file)),
    capturedAt: new Date().toISOString(), test: test.info().titlePath,
    sourceRevision: manifest.sourceRevision, artifactDigest: manifest.artifactFingerprint.digest,
    harnessSha256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
    scope: "Ordinary viewport pixels from explicitly labelled local runtime fault tests; no production API writes or release acceptance.", inspected: false };
  await fs.writeFile(file.replace(/\.png$/, ".json"), JSON.stringify(receipt, null, 2) + "\n");
  const index = `${directory}/CAPTURES.json`;
  let captures = [];
  try { captures = JSON.parse(await fs.readFile(index, "utf8")).captures; } catch (error) { if (error.code !== "ENOENT") throw error; }
  captures.push(receipt);
  await fs.writeFile(index, JSON.stringify({ session: 130, captures }, null, 2) + "\n");
}

async function mockCommunity(page) {
  const requests = [];
  await page.route(`${COMMUNITY}/**`, async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push({ method: request.method(), pathname });
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-allow-headers": "content-type" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (pathname.endsWith("/capability")) return route.fulfill({ status: 200, headers, contentType: "application/json",
      body: JSON.stringify({ capability: "s130-test-only-capability", expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingUses: 10 }) });
    return route.fulfill({ status: 503, headers, contentType: "application/json",
      body: JSON.stringify({ status: "unavailable", periods: {}, error: "S130 explicit local Community outage fixture" }) });
  });
  return requests;
}

async function watchUnhandled(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    globalThis.__s130Unhandled = [];
    addEventListener("unhandledrejection", event => globalThis.__s130Unhandled.push(String(event.reason?.message || event.reason)));
  });
  return async () => {
    await settle(page);
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => globalThis.__s130Unhandled)).toEqual([]);
  };
}

async function workerLeague(page) {
  await configureClient(page, true);
  await page.addInitScript(() => localStorage.setItem("vsfgm_mobile_loop", "0"));
  await createClientLeague(page, host.origin);
  await assertRuntime(page, true);
}

async function serverLeague(page) {
  await page.addInitScript(() => localStorage.setItem("vsfgm_mobile_loop", "0"));
  await createPlayScenario(page);
  for (const selector of ["#firstDebriefDecline", "#tutSkipBtn"]) {
    if (await page.locator(selector).isVisible()) await page.locator(selector).click();
  }
  expect(await page.evaluate(async () => (await import("/lib/api/createApiClient.js")).getRuntimeMode())).toBe("server");
}

async function openGameTab(page, tabId) {
  const toggle = page.locator("#mobileNavToggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const button = page.locator(`[data-tab="${tabId}"]`).first();
  const groupToggle = page.locator(".menu-group").filter({ has: button }).locator(":scope > .menu-group-toggle");
  if (await groupToggle.isVisible() && await groupToggle.getAttribute("aria-expanded") !== "true") await groupToggle.click();
  await button.click();
}

async function boardroom(page) {
  await openGameTab(page, "boardroomTab");
  await expect(page.locator("#boardroomTab")).toHaveClass(/active/);
}

async function openBrief(page) {
  await openGameTab(page, "overviewTab");
  const drawer = page.locator("details").filter({ has: page.locator("#coGmBriefPanel") });
  if (await drawer.getAttribute("open") === null) await drawer.locator(":scope > summary").click();
  await expect(page.locator("#coGmCopyBtn")).toBeVisible();
}

async function otherStaffTeam(page) {
  const selected = await page.locator("#staffTeamSelect").inputValue();
  const other = await page.locator("#staffTeamSelect option").evaluateAll((options, current) =>
    options.map(option => option.value).find(value => value && value !== current), selected);
  expect(other).toBeTruthy();
  return other;
}

async function downloadBrief(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    expect(page.locator("#toastStack")).toContainText("Assistant brief downloaded"),
    page.locator("#coGmDownloadBtn").click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^co-gm-brief-.+\.json$/);
  expect(await download.failure()).toBeNull();
  await assertBriefRecovered(page);
  return download;
}

async function assertBriefRecovered(page) {
  await expect(page.locator("#statusChip")).toHaveText(/^Ready(?: · .+)?$/);
  await expect.poll(() => page.evaluate(async () => {
    const { getClientDiagnosticsSnapshot } = await import("/lib/clientDiagnostics.js");
    return getClientDiagnosticsSnapshot().entries.filter(entry => entry.surface === "action" && entry.operation === "co-gm-export");
  })).toEqual([]);
}

for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
for (const theme of ["dark", "light"]) {
test.describe(`${device} ${theme}`, () => {
  test.use({ viewport, colorScheme: theme });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(value => {
      localStorage.setItem("franchise-architect-theme", value);
      localStorage.setItem("franchise-architect-theme-mode", value);
    }, theme);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) {
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(page.viewportSize()).toEqual(viewport);
    }
  });

test("worker: coaching stays cold until staff intent and a real hire respects club authority", async ({ page }) => {
  await mockCommunity(page);
  const moduleRequests = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith("/lib/coachingMarketPanel.js")) moduleRequests.push(request.url());
  });
  await workerLeague(page);
  expect(moduleRequests).toEqual([]);
  await boardroom(page);
  const panel = page.locator("#coachingMarketPanel");
  await expect(panel.locator(".coaching-market-head")).toBeVisible();
  expect(moduleRequests.length).toBe(1);
  const controlled = await page.locator("#staffTeamSelect").inputValue();
  const rival = await otherStaffTeam(page);
  const hire = panel.locator(".cm-hire").first();
  await expect(hire).toBeEnabled();
  const hiredName = await hire.evaluate(button => button.closest(".cm-candidate").querySelector("strong").textContent.trim());
  await hire.click();
  await expect(page.locator("#staffTable")).toContainText(hiredName);
  await expect(panel.locator(".coaching-market-incumbent")).toContainText(hiredName);
  const rivalBefore = await readClient(page, `/api/staff?team=${encodeURIComponent(rival)}`);
  await page.locator("#staffTeamSelect").selectOption(rival);
  await expect(panel).toContainText("only its own front office can change it");
  await expect(panel.locator("[data-coach-action]")).toHaveCount(0);
  expect(await readClient(page, `/api/staff?team=${encodeURIComponent(rival)}`)).toEqual(rivalBefore);
  await page.locator("#staffTeamSelect").selectOption(controlled);
  await expect(panel.locator(".coaching-market-incumbent")).toContainText(hiredName);
  await assertRuntime(page, true);
});

test("server HTTP fixture: failed coaching action restores original controls; double click makes one request and retry hires once", async ({ page }) => {
  await mockCommunity(page);
  await serverLeague(page);
  await boardroom(page);
  const panel = page.locator("#coachingMarketPanel"), hire = panel.locator(".cm-hire").first();
  await expect(hire).toBeEnabled();
  const original = await panel.locator("[data-coach-action]").evaluateAll(buttons => buttons.map(button => ({
    action: button.dataset.coachAction, candidate: button.dataset.candidate || null, disabled: button.disabled
  })));
  const hiredName = await hire.evaluate(button => button.closest(".cm-candidate").querySelector("strong").textContent.trim());
  let attempts = 0, release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route("**/api/coaching-market", async route => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    if (attempts !== 1) return route.continue();
    await held;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "S130 coaching POST outage fixture" }) });
  });
  try {
    await hire.scrollIntoViewIfNeeded();
    const box = await hire.boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => attempts).toBe(1);
    await expect(hire).toBeDisabled();
    release();
    await expect(page.locator("#statusChip")).toContainText("S130 coaching POST outage fixture");
    await expect(hire).toBeEnabled();
    expect(await panel.locator("[data-coach-action]").evaluateAll(buttons => buttons.map(button => ({
      action: button.dataset.coachAction, candidate: button.dataset.candidate || null, disabled: button.disabled
    })))).toEqual(original);
    expect(attempts).toBe(1);
    await captureState(page, "coaching-action-error");
    await hire.click();
    await expect(page.locator("#staffTable")).toContainText(hiredName);
    await expect(panel.locator(".coaching-market-incumbent")).toContainText(hiredName);
    expect(attempts).toBe(2);
  } finally { release(); }
});

test("server HTTP fixture: failed stale role and club reads cannot replace the latest coaching surface", async ({ page }) => {
  await mockCommunity(page);
  await serverLeague(page);
  await boardroom(page);
  await expect(page.locator("#coachingMarketPanel .coaching-market-head")).toBeVisible();
  let gate = null;
  await page.route("**/api/coaching-market?*", async route => {
    const params = new URL(route.request().url()).searchParams;
    if (!gate || gate.held || params.get("role") !== gate.role) return route.continue();
    const current = gate;
    current.held = true;
    await current.promise;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "S130 deliberately late stale market failure" }) });
    current.delivered = true;
  });
  const hold = role => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    gate = { role, promise, release, held: false, delivered: false };
    return gate;
  };
  const first = hold("offensiveCoordinator");
  try {
    await page.locator("#staffRoleSelect").selectOption("offensiveCoordinator");
    await expect.poll(() => first.held).toBe(true);
    await page.locator("#staffRoleSelect").selectOption("defensiveCoordinator");
    await expect(page.locator("#coachingMarketPanel h3")).toContainText("Defensive Coordinator");
    first.release();
    await expect.poll(() => first.delivered).toBe(true);
    await settle(page);
    await expect(page.locator("#coachingMarketPanel h3")).toContainText("Defensive Coordinator");
    await expect(page.locator("#coachingMarketPanel")).not.toContainText("late stale");
    const rival = await otherStaffTeam(page), second = hold("headCoach");
    try {
      await page.locator("#staffRoleSelect").selectOption("headCoach");
      await expect.poll(() => second.held).toBe(true);
      await page.locator("#staffTeamSelect").selectOption(rival);
      await expect(page.locator("#coachingMarketPanel")).toContainText("only its own front office can change it");
      second.release();
      await expect.poll(() => second.delivered).toBe(true);
      await settle(page);
      await expect(page.locator("#coachingMarketPanel")).toContainText("only its own front office can change it");
      await expect(page.locator("#coachingMarketPanel [data-coach-action]")).toHaveCount(0);
    } finally { second.release(); }
  } finally { first.release(); }
});

test("worker module-load fixture: coaching Retry observes repeated failure and a reload can recover", async ({ page }) => {
  await mockCommunity(page);
  const assertNoUnhandled = await watchUnhandled(page);
  let blocked = true, failures = 0;
  await page.route("**/lib/coachingMarketPanel.js*", async route => {
    if (!blocked) return route.continue();
    failures += 1;
    return route.abort("failed");
  });
  await workerLeague(page);
  await boardroom(page);
  const retry = page.locator("#retry-coachingMarketPanel");
  await expect(retry).toBeVisible();
  await frameRetryError(page);
  const marketBox = await page.locator("#coachingMarketPanel").boundingBox();
  const errorBox = await page.locator("#coachingMarketPanel .panel-error-state").boundingBox();
  const retryBox = await retry.boundingBox();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(errorBox.x).toBeGreaterThanOrEqual(marketBox.x);
  expect(errorBox.x + errorBox.width).toBeLessThanOrEqual(marketBox.x + marketBox.width + 1);
  expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect((await retry.boundingBox()).height, "Recovery Retry must meet the 44px touch target").toBeGreaterThanOrEqual(44);
  await expect(page.locator("#boardroomTab")).toHaveJSProperty("inert", false);
  await expect(page.locator("#boardroomTab")).not.toHaveAttribute("aria-busy", "true");
  await retry.click();
  await settle(page);
  await expect(retry).toBeVisible();
  await expect(page.locator("#coachingMarketPanel")).toContainText("could not load");
  await expect(page.locator("#boardroomTab")).toHaveJSProperty("inert", false);
  await captureState(page, "coaching-module-retry-error");
  expect(failures).toBeGreaterThanOrEqual(1); // A browser may retain the failed module-map entry.
  await assertNoUnhandled();
  blocked = false;
  await page.reload();
  await waitGameReady(page);
  await boardroom(page);
  await expect(page.locator("#coachingMarketPanel .coaching-market-head")).toBeVisible();
  await expect(page.locator("#coachingMarketPanel .cm-hire").first()).toBeEnabled();
  await assertNoUnhandled();
});

test("worker module-load fixture: Co-GM copy reports a failed import and recovers after a valid load", async ({ page }) => {
  await mockCommunity(page);
  const assertNoUnhandled = await watchUnhandled(page);
  let blocked = true;
  await page.route("**/lib/coGmBriefPanel.js*", route => blocked ? route.abort("failed") : route.continue());
  await workerLeague(page);
  await openBrief(page);
  await page.locator("#coGmCopyBtn").click();
  await expect(page.locator("#statusChip")).toContainText("Error:");
  await expect(page.locator("#toastStack")).toContainText(/failed to fetch|dynamically imported module|module script/i);
  await captureState(page, "co-gm-module-error");
  await assertNoUnhandled();
  blocked = false;
  await page.reload();
  await waitGameReady(page);
  await openBrief(page);
  await downloadBrief(page);
  await assertNoUnhandled();
});

test("worker packet-build and clipboard fixtures: Co-GM clicks report failures truthfully and same-page valid retry downloads", async ({ page }) => {
  await mockCommunity(page);
  const assertNoUnhandled = await watchUnhandled(page);
  await page.addInitScript(() => { globalThis.__s130BriefBuildFault = false; });
  await page.route("**/lib/coGmBriefPanel.js*", async route => {
    const response = await route.fetch();
    const original = await response.text();
    const signature = "export function currentCoGmBriefingPacket() {";
    expect(original).toContain(signature);
    return route.fulfill({ response, body: original.replace(signature,
      `${signature}\n  if (globalThis.__s130BriefBuildFault) throw new Error("S130 explicit briefing-build fixture");`) });
  });
  await workerLeague(page);
  await openBrief(page);
  await expect(page.locator("#coGmBriefPanel .history-card-stat")).toHaveCount(4);
  await page.evaluate(() => { globalThis.__s130BriefBuildFault = true; });
  await page.locator("#coGmCopyBtn").click();
  await expect(page.locator("#statusChip")).toContainText("S130 explicit briefing-build fixture");
  expect(await page.evaluate(async () => {
    const { getClientDiagnosticsSnapshot, recordClientDiagnostic } = await import("/lib/clientDiagnostics.js");
    const ownFailure = getClientDiagnosticsSnapshot().entries.some(entry => entry.surface === "action" && entry.operation === "co-gm-export");
    recordClientDiagnostic({ surface: "s130-fixture", operation: "unrelated-panel", error: new Error("S130 explicit unrelated recovery warning") });
    return ownFailure;
  })).toBe(true);
  await captureState(page, "co-gm-build-error");
  await page.evaluate(() => {
    globalThis.__s130BriefBuildFault = false;
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async () => { throw new DOMException("S130 explicit clipboard refusal", "NotAllowedError"); } } });
  });
  await page.locator("#coGmCopyBtn").click();
  await expect(page.locator("#toastStack .toast").last()).toContainText("Download the briefing instead");
  await expect(page.locator("#toastStack .toast").last()).not.toHaveText("Done");
  await expect(page.locator("#toastStack .toast").last()).not.toContainText("Brief copied");
  await assertBriefRecovered(page);
  await expect(page.locator("#statusChip")).toContainText(/panels? to retry/);
  expect(await page.evaluate(async () => {
    const { getClientDiagnosticsSnapshot } = await import("/lib/clientDiagnostics.js");
    return getClientDiagnosticsSnapshot().entries.some(entry => entry.surface === "s130-fixture" && entry.operation === "unrelated-panel");
  })).toBe(true);
  const toast = page.locator("#toastStack .toast").last(), feedback = page.locator(".feedback-widget").first();
  await expect(feedback).toBeVisible();
  await toast.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const toastBox = await toast.boundingBox(), feedbackBox = await feedback.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(feedbackBox).not.toBeNull();
  const overlaps = toastBox.x < feedbackBox.x + feedbackBox.width && toastBox.x + toastBox.width > feedbackBox.x
    && toastBox.y < feedbackBox.y + feedbackBox.height && toastBox.y + toastBox.height > feedbackBox.y;
  expect(overlaps, "The actual feedback control must not cover the clipboard download fallback").toBe(false);
  await captureState(page, "co-gm-clipboard-refusal");
  await downloadBrief(page);
  expect(await page.evaluate(async () => {
    const { getClientDiagnosticsSnapshot } = await import("/lib/clientDiagnostics.js");
    return getClientDiagnosticsSnapshot().entries.some(entry => entry.surface === "s130-fixture" && entry.operation === "unrelated-panel");
  })).toBe(true);
  await assertNoUnhandled();
});

test("worker download fixture: rejected anchor click removes its anchor and revokes its URL before a successful retry", async ({ page }) => {
  await mockCommunity(page);
  const assertNoUnhandled = await watchUnhandled(page);
  await workerLeague(page);
  await openBrief(page);
  await page.evaluate(() => {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL, click = HTMLAnchorElement.prototype.click;
    globalThis.__s130DownloadFixture = { created: [], revoked: [], active: true };
    URL.createObjectURL = function (blob) { const url = create.call(this, blob); globalThis.__s130DownloadFixture.created.push(url); return url; };
    URL.revokeObjectURL = function (url) { globalThis.__s130DownloadFixture.revoked.push(url); return revoke.call(this, url); };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.startsWith("co-gm-brief-") && globalThis.__s130DownloadFixture.active) throw new Error("S130 explicit download-click refusal");
      return click.call(this);
    };
  });
  await page.locator("#coGmDownloadBtn").click();
  await expect(page.locator("#statusChip")).toContainText("S130 explicit download-click refusal");
  expect(await page.evaluate(() => {
    const fixture = globalThis.__s130DownloadFixture;
    return { created: fixture.created.length, revoked: fixture.revoked.length,
      same: fixture.created[0] === fixture.revoked[0], anchors: document.querySelectorAll('a[download^="co-gm-brief-"]').length };
  })).toEqual({ created: 1, revoked: 1, same: true, anchors: 0 });
  await captureState(page, "co-gm-download-error");
  await page.evaluate(() => { globalThis.__s130DownloadFixture.active = false; });
  await downloadBrief(page);
  expect(await page.locator('a[download^="co-gm-brief-"]').count()).toBe(0);
  await assertNoUnhandled();
});

test("Community storage-refusal fixture: failed opt-in stays off and explains storage instead of claiming contribution", async ({ page }) => {
  const requests = await mockCommunity(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fa:community-participation:v1" && value === "participating") throw new DOMException("S130 explicit consent-storage refusal", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto(`${host.origin}/stats.html`);
  const shell = page.locator("[data-community-consent-shell]");
  await shell.getByRole("button", { name: "Share anonymous game stats", exact: true }).click();
  await expect(shell).toContainText("could not save your participation choice");
  await expect(shell).toContainText("sharing stays off");
  await expect(shell.locator(".community-consent")).toHaveAttribute("data-participating", "false");
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT)).not.toBe("participating");
  expect(requests.filter(request => request.method === "POST")).toEqual([]);
  await expect(shell.getByRole("button", { name: "Share anonymous game stats", exact: true })).toBeEnabled();
  await captureState(page, "community-storage-refusal");
});

test("Community deletion fixture: a retained deletion stays retry-first, keeps sharing off and never becomes a new opt-in", async ({ page }) => {
  const requests = await mockCommunity(page);
  await page.addInitScript(({ consent, tombstone }) => {
    localStorage.setItem(consent, "declined");
    localStorage.setItem(tombstone, "s130-test-existing-participant");
  }, { consent: CONSENT, tombstone: TOMBSTONE });
  await page.goto(`${host.origin}/stats.html`);
  const shell = page.locator("[data-community-consent-shell]"), retry = shell.getByRole("button", { name: "Retry deletion", exact: true });
  await expect(retry).toBeVisible();
  await expect(shell).toContainText(/Sharing is off — deletion (pending|retry failed)/);
  await expect(shell.locator(".community-consent")).toHaveAttribute("data-participating", "false");
  await expect(shell.locator("[data-community-consent]")).toHaveCount(0);
  await expect.poll(() => requests.filter(request => request.method === "DELETE").length).toBeGreaterThanOrEqual(1);
  await expect(shell).toContainText("deletion retry failed");
  await captureState(page, "community-deletion-pending");
  await settle(page);
  const before = requests.filter(request => request.method === "DELETE").length;
  await retry.click();
  await expect.poll(() => requests.filter(request => request.method === "DELETE").length).toBeGreaterThan(before);
  expect(await page.evaluate(key => localStorage.getItem(key), TOMBSTONE)).toBe("s130-test-existing-participant");
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT)).not.toBe("participating");
  expect(requests.filter(request => request.method === "POST" && request.pathname.endsWith("/events"))).toEqual([]);
  await expect(retry).toBeVisible();
});

});
}
}
