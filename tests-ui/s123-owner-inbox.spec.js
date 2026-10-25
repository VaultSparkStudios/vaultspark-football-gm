import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";

const phase = process.env.S123_OWNER_CAPTURE_PHASE || "after";
const output = path.resolve("output/playwright/s123-owner-inbox", phase);
const beforeSource = phase === "before"
  ? spawnSync("git", ["show", "57c77b5c:public/lib/engagementFeatures.js"], { encoding: "utf8" }).stdout : null;

for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  for (const theme of ["dark", "light"]) {
    test(`${device} ${theme}: owner inbox action reaches ownership controls`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (beforeSource) await page.route("**/lib/engagementFeatures.js", (route) => route.fulfill({ contentType: "text/javascript", body: beforeSource }));
      await page.addInitScript((value) => localStorage.setItem("franchise-architect-theme", value), theme);
      await page.goto("/");
      await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 30_000 });
      const advanced = page.locator("details:has(#seedInput)");
      if (!(await advanced.getAttribute("open"))) await advanced.locator(":scope > summary").click();
      await page.fill("#seedInput", "20260306");
      await page.selectOption("#teamSelect", "BUF");
      await page.click("#createLeagueBtn");
      await expect(page).toHaveURL(/\/game(?:\.html)?(?:\?.*)?$/, { timeout: 90_000 });
      await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
      for (const id of ["firstDebriefDecline", "tutSkipBtn", "mlFullViewBtn"]) {
        const button = page.locator(`#${id}`);
        if (await button.isVisible()) await button.click();
      }
      await page.evaluate(async (isBefore) => {
        const inbox = await import("/lib/engagementFeatures.js");
        inbox.ingestNewsIntoInbox([{ id: "s123-owner", ...(isBefore ? { type: "owner-ultimatum" } : { details: { type: "owner-ultimatum" } }), headline: "Ownership issues an ultimatum", detail: "Review the owner's current mandate before your next decision.", year: 2026, week: 1 }]);
        inbox.openInbox();
      }, phase === "before");
      await expect(page.locator(".inbox-type-icon").first()).toHaveText("⚠️");
      await expect.poll(() => page.locator("#inboxDrawer").evaluate((element) => Math.round(element.getBoundingClientRect().right))).toBe(width);
      await fs.mkdir(output, { recursive: true });
      await page.screenshot({ path: path.join(output, `${device}-${theme}-inbox.png`) });
      await page.locator('[data-inbox-key="id:s123-owner"]').click();
      if (phase === "before") {
        await expect(page.locator("#overviewTab")).toHaveClass(/\bactive\b/);
        await expect(page.locator("#inboxDrawer")).toHaveClass(/\bopen\b/);
      } else {
        await expect(page.locator("#boardroomTab")).toHaveClass(/\bactive\b/);
        await expect(page.locator("#inboxDrawer")).not.toHaveClass(/\bopen\b/);
        await expect(page.locator("#ownerSpotlight")).toBeVisible();
        await expect(page.locator("#ownerSpotlight")).toBeFocused();
        await expect(page.locator(".tab-panel.active")).toHaveCount(1);
        await expect.poll(() => page.locator("#inboxDrawer").evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(width);
      }
      await page.screenshot({ path: path.join(output, `${device}-${theme}-destination.png`) });
      if (phase !== "before") {
        for (const boundary of ["before-import", "during-navigation"]) {
          const result = await page.evaluate(async (boundary) => {
            const inbox = await import("/lib/engagementFeatures.js");
            const { state } = await import("/lib/appState.js");
            const flow = await import("/lib/gameFlow.js");
            const { clientDiagnostics } = await import("/lib/clientDiagnostics.js");
            await flow.activateTab("overviewTab");
            const original = state.dashboard;
            const event = { id: `scope-${boundary}`, type: "owner-ultimatum", headline: "Ownership scope regression" };
            state.dashboard = { ...original, franchiseId: `${boundary}-origin` };
            inbox.ingestNewsIntoInbox([event]);
            inbox.openInbox();
            clientDiagnostics.record({ surface: "inbox", operation: "owner", error: "Pending scope regression" });
            const completed = new Promise((resolve) => {
              const unsubscribe = clientDiagnostics.subscribe((snapshot) => {
                if (!snapshot.entries.some((row) => row.surface === "inbox" && row.operation === "owner")) {
                  unsubscribe(); resolve();
                }
              });
            });
            let switched = false;
            const switchScope = () => {
              switched = true;
              state.dashboard = { ...original, franchiseId: `${boundary}-recipient` };
              inbox.ingestNewsIntoInbox([event]);
            };
            const observer = new MutationObserver(() => {
              if (document.getElementById("boardroomTab").classList.contains("active")) {
                observer.disconnect(); switchScope();
              }
            });
            if (boundary === "during-navigation") observer.observe(document.getElementById("boardroomTab"), { attributes: true, attributeFilter: ["class"] });
            document.querySelector(`[data-inbox-key="id:${event.id}"]`).click();
            if (boundary === "before-import") switchScope();
            await completed;
            observer.disconnect();
            const recipient = inbox.getInboxSnapshot();
            const value = { switched, scope: recipient.scope, resolvedAt: recipient.items.find((row) => row.id === event.id)?.resolvedAt };
            state.dashboard = original;
            inbox.closeInbox();
            inbox.syncInboxScope(original);
            return value;
          }, boundary);
          expect(result).toEqual({ switched: true, scope: `${boundary}-recipient`, resolvedAt: null });
        }
      }
    });
  }
}

test("cloud export remains usable when browser storage operations are denied", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const originals = Object.fromEntries(["getItem", "setItem", "removeItem"].map((name) => [name, Storage.prototype[name]]));
    const originalFetch = globalThis.fetch;
    const methods = [];
    try {
      for (const name of Object.keys(originals)) Storage.prototype[name] = () => { throw new DOMException("Storage is disabled", "SecurityError"); };
      const cloud = await import("/lib/gistSync.js");
      cloud.saveToken("synthetic-browser-fixture");
      cloud.saveGistId("");
      globalThis.fetch = async (_url, options) => {
        methods.push(options.method);
        return new Response(JSON.stringify({ id: "synthetic-gist", html_url: "https://example.invalid/gist" }), { status: 200, headers: { "content-type": "application/json" } });
      };
      await cloud.exportToGist({ league: { currentYear: 2026 } }, cloud.getSavedToken());
      await cloud.exportToGist({ league: { currentYear: 2026 } }, cloud.getSavedToken());
      const gistId = cloud.getSavedGistId();
      cloud.saveToken("");
      return { methods, gistId, token: cloud.getSavedToken() };
    } finally {
      Object.assign(Storage.prototype, originals);
      globalThis.fetch = originalFetch;
    }
  });
  expect(result).toEqual({ methods: ["POST", "PATCH"], gistId: "synthetic-gist", token: "" });
});
