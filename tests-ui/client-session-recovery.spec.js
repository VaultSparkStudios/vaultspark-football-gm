import { test, expect } from "@playwright/test";
import {
  CHECKPOINT_KEY, PENDING_KEY, CLIENT_SCENARIO, startStaticClientHost, configureClient,
  prepareClientSetup, createClientLeague, waitSetupReady, waitGameReady, readClient,
  readIdentity, assertRuntime, advanceClientWeek, saveSlot, openSetup, revealTable,
  installCheckpointFault, installCheckpointQuota, installCompressionGate,
  installWorkerCheckpointGate, assertWorkerCheckpointWire
} from "./helpers/static-client.js";

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
test.use({ serviceWorkers: "allow" });

async function routeCount(page, route) {
  return (await readClient(page, "/api/observability")).server.routeHits[route] || 0;
}

async function checkpointPresent(page) {
  return page.evaluate((key) => Boolean(sessionStorage.getItem(key)), CHECKPOINT_KEY);
}

async function checkpointSummary(page) {
  return page.evaluate(({ checkpointKey, pendingKey }) => {
    const raw = sessionStorage.getItem(checkpointKey);
    const envelope = raw ? JSON.parse(raw) : null;
    return { kind: envelope?.kind, slot: envelope?.reference?.slot,
      loadRoute: envelope?.reference?.loadRoute, bytes: raw?.length || 0,
      pending: sessionStorage.getItem(pendingKey) !== null,
      rejected: globalThis.__checkpointQuota?.rejected || 0 };
  }, { checkpointKey: CHECKPOINT_KEY, pendingKey: PENDING_KEY });
}

for (const worker of [true, false]) {
  test.describe(worker ? "built worker client" : "built in-page client", () => {
    test.beforeEach(async ({ page }) => { await configureClient(page, worker); });

    test("chosen franchise and one committed week survive navigation and reload", async ({ page }) => {
      const opening = await createClientLeague(page, host.origin);
      await assertRuntime(page, worker);
      expect(await checkpointPresent(page)).toBe(true);
      const committed = await advanceClientWeek(page);
      expect(committed).toMatchObject({ ...opening, week: opening.week + 1, rngSeed: committed.rngSeed });
      expect(await routeCount(page, "/api/advance-week")).toBe(1);
      await page.reload();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(committed);
      await openSetup(page);
      await expect(page.locator("#continueActiveBtn")).toBeVisible();
      await page.locator("#continueActiveBtn").click();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(committed);
      expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await assertRuntime(page, worker);
      if (worker) await assertWorkerCheckpointWire(page);
    });

    test("explicit older named slot and backup restore their own exact snapshot", async ({ page }) => {
      const opening = await createClientLeague(page, host.origin);
      await assertRuntime(page, worker);
      await saveSlot(page, "opening-slot");
      const advanced = await advanceClientWeek(page);
      await saveSlot(page, "newer-slot");
      let backup;
      await expect.poll(async () => {
        backup = (await readClient(page, "/api/backups")).slots.find((slot) => slot.meta?.currentWeek === advanced.week && slot.meta?.controlledTeamId === opening.team);
        return Boolean(backup);
      }).toBe(true);
      await openSetup(page);
      await revealTable(page, "#savesTable");
      await expect(page.locator('[data-resume="newer-slot"]')).toBeVisible();
      await page.locator('[data-resume="opening-slot"]').click();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(opening);
      await openSetup(page);
      await revealTable(page, "#backupsTable");
      await page.locator("#refreshBackupsBtn").click();
      await page.locator(`[data-backup-resume="${backup.slot}"]`).click();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(advanced);
    });

    test("navigation waits for the real asynchronous checkpoint result", async ({ page }) => {
      await prepareClientSetup(page, host.origin);
      await assertRuntime(page, worker);
      // Expose the same selector capability as a server-capable deployment.
      // The held command still belongs to the actual client runtime.
      await page.evaluate(() => {
        document.querySelector('meta[name="vsfgm-server-available"]').content = "true";
        document.querySelector('#runtimeModeSelect option[value="server"]').disabled = false;
      });
      if (worker) await installWorkerCheckpointGate(page);
      else await installCompressionGate(page);
      await page.locator("#createLeagueBtn").click();
      await expect.poll(() => page.evaluate(() => globalThis.__checkpointGate.held)).toBeGreaterThan(0);
      expect(new URL(page.url()).pathname).toBe("/");
      expect(await page.evaluate((key) => Boolean(sessionStorage.getItem(key)), PENDING_KEY)).toBe(true);
      expect(await checkpointPresent(page)).toBe(false);
      await expect(page.locator("#runtimeModeSelect")).toBeDisabled();
      const attemptedSwitch = await page.evaluate(async () => {
        const { getRuntimeMode } = await import("./lib/api/createApiClient.js");
        const selector = document.getElementById("runtimeModeSelect");
        selector.value = "server";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
        return { mode: getRuntimeMode(), selection: selector.value };
      });
      expect(attemptedSwitch).toEqual({ mode: "client", selection: "client" });
      await page.evaluate(() => globalThis.__checkpointGate.release());
      await waitGameReady(page);
      expect(await readIdentity(page)).toMatchObject({ franchiseId: `fa-${CLIENT_SCENARIO.seed}-${CLIENT_SCENARIO.team}`, team: CLIENT_SCENARIO.team, year: CLIENT_SCENARIO.year, mode: CLIENT_SCENARIO.mode });
    });

    test("rejected setup checkpoint holds navigation and Retry resumes the applied league", async ({ page }) => {
      await prepareClientSetup(page, host.origin);
      await assertRuntime(page, worker);
      await installCheckpointFault(page);
      await page.evaluate(() => { globalThis.__checkpointFault.reject = true; });
      await page.locator("#createLeagueBtn").click();
      // Creation has its own bounded completion budget. Assert the rejected
      // checkpoint UI after that action settles, not while it is still running.
      await expect(page.locator("#setupStatus")).toContainText(/^Error:/, { timeout: 60_000 });
      await expect(page.locator("#runtimeModeSelect")).toBeEnabled();
      await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
      await expect(page.locator("#retryClientCheckpointBtn")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
      const applied = await readIdentity(page);
      expect(applied).toMatchObject({ franchiseId: `fa-${CLIENT_SCENARIO.seed}-${CLIENT_SCENARIO.team}`, team: CLIENT_SCENARIO.team, year: CLIENT_SCENARIO.year, mode: CLIENT_SCENARIO.mode });
      expect(await routeCount(page, "/api/new-league")).toBe(1);
      await page.evaluate(() => { globalThis.__checkpointFault.reject = false; });
      await page.locator("#retryClientCheckpointBtn").click();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(applied);
      if (worker) {
        expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:observed-client-commands") || "[]").filter((entry) => entry.path === "/api/new-league").length)).toBe(1);
      }
    });

    test("an applied week remains visible when checkpointing fails and Retry never advances twice", async ({ page }) => {
      const opening = await createClientLeague(page, host.origin);
      await assertRuntime(page, worker);
      await installCheckpointFault(page);
      await page.evaluate(() => { globalThis.__checkpointFault.reject = true; });
      const applied = await advanceClientWeek(page);
      expect(applied.week).toBe(opening.week + 1);
      await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
      expect(await routeCount(page, "/api/advance-week")).toBe(1);
      expect(await page.evaluate((key) => Boolean(sessionStorage.getItem(key)), PENDING_KEY)).toBe(true);
      await page.evaluate(() => { globalThis.__checkpointFault.reject = false; });
      await page.locator("#retryClientCheckpointBtn").click();
      await expect(page.locator("#clientRecoveryNotice")).toBeHidden();
      expect(await readIdentity(page)).toEqual(applied);
      expect(await routeCount(page, "/api/advance-week")).toBe(1);
      await page.reload();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(applied);
    });

    test("quota-limited checkpoint reopens the explicit older slot and refuses a changed source", async ({ page, context }) => {
      const opening = await createClientLeague(page, host.origin);
      await assertRuntime(page, worker);
      await saveSlot(page, "quota-opening");
      await advanceClientWeek(page);
      await saveSlot(page, "quota-newer");
      expect((await checkpointSummary(page)).bytes).toBeGreaterThan(2048);
      await openSetup(page);
      await installCheckpointQuota(page);
      await revealTable(page, "#savesTable");
      await expect(page.locator('[data-resume="quota-newer"]')).toBeVisible();
      await page.locator('[data-resume="quota-opening"]').click();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(opening);
      expect(await checkpointSummary(page)).toMatchObject({ kind: "save-reference", slot: "quota-opening", loadRoute: "/api/saves/load", pending: false });
      expect((await checkpointSummary(page)).bytes).toBeLessThanOrEqual(2048);
      await page.reload();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(opening);

      // A different tab may legitimately overwrite this named save. The first
      // tab must not accept its replacement as the checkpoint it selected.
      const other = await context.newPage();
      await configureClient(other, worker);
      const replacement = await createClientLeague(other, host.origin, { seed: 20260307, year: 2025, team: "MIA", mode: "play" });
      expect(replacement.franchiseId).not.toBe(opening.franchiseId);
      await saveSlot(other, "quota-opening");
      await page.reload();
      await expect(page.locator('#gameBootOverlay[role="alert"]')).toBeVisible();
      await expect(page.locator("#gameBootOverlay")).toContainText("saved checkpoint has changed");
      expect(await page.evaluate(async () => (await import("./lib/api/createApiClient.js")).getLocalSessionRecoveryStatus().reasonCode)).toBe("RECOVERY_REFERENCE_CHANGED");
      await expect(page.locator("#statusChip")).not.toContainText("Ready");
    });

    test("quota-limited applied week needs an explicit new save before recovery can resume", async ({ page }) => {
      const opening = await createClientLeague(page, host.origin);
      await assertRuntime(page, worker);
      await saveSlot(page, "quota-before-week");
      await installCheckpointQuota(page);
      const applied = await advanceClientWeek(page);
      expect(applied.week).toBe(opening.week + 1);
      await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
      expect((await checkpointSummary(page)).rejected).toBeGreaterThan(0);
      expect((await checkpointSummary(page)).pending).toBe(true);
      expect(await routeCount(page, "/api/advance-week")).toBe(1);
      await page.locator("#retryClientCheckpointBtn").click();
      await expect(page.locator("#clientRecoveryNotice")).toContainText("Checkpoint is still unavailable");
      expect(await readIdentity(page)).toEqual(applied);

      await saveSlot(page, "quota-after-week");
      await expect(page.locator("#clientRecoveryNotice")).toBeHidden();
      expect(await checkpointSummary(page)).toMatchObject({ kind: "save-reference", slot: "quota-after-week", pending: false });
      expect((await checkpointSummary(page)).bytes).toBeLessThanOrEqual(2048);
      expect(await routeCount(page, "/api/advance-week")).toBe(1);
      await page.reload();
      await waitGameReady(page);
      expect(await readIdentity(page)).toEqual(applied);
    });
  });
}

test("two tabs keep separate active franchises across mutations and reloads", async ({ page, context }) => {
  await configureClient(page, true);
  const first = await createClientLeague(page, host.origin);
  const other = await context.newPage();
  await configureClient(other, true);
  const second = await createClientLeague(other, host.origin, { seed: 20260307, year: 2025, team: "MIA", mode: "play" });
  expect(second.franchiseId).not.toBe(first.franchiseId);
  const advanced = await advanceClientWeek(page);
  await other.reload();
  await waitGameReady(other);
  expect(await readIdentity(other)).toEqual(second);
  await page.reload();
  await waitGameReady(page);
  expect(await readIdentity(page)).toEqual(advanced);
});

test("a later rejected pending marker preserves the applied week warning, unload guard and checkpoint-only Retry", async ({ page }) => {
  await configureClient(page, true);
  await createClientLeague(page, host.origin);
  await installCheckpointFault(page);
  await page.evaluate(() => { globalThis.__checkpointFault.reject = true; });
  const applied = await advanceClientWeek(page);
  await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
  await page.evaluate(() => { globalThis.__checkpointFault.rejectPending = true; });
  const blocked = await page.evaluate(async () => {
    const { createApiClient, getLocalSessionRecoveryStatus } = await import("./lib/api/createApiClient.js");
    try {
      await createApiClient()("/api/advance-week", { method: "POST", body: { count: 1 } });
      return { rejected: false };
    } catch {
      return { rejected: true, status: getLocalSessionRecoveryStatus() };
    }
  });
  expect(blocked).toMatchObject({ rejected: true, status: { status: "recovery-required", dirty: true } });
  expect(await readIdentity(page)).toEqual(applied);
  expect(await routeCount(page, "/api/advance-week")).toBe(1);
  await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
  await expect(page.locator("#retryClientCheckpointBtn")).toBeVisible();

  const dialogPromise = page.waitForEvent("dialog");
  const navigation = page.goto(host.origin).catch(() => null);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await navigation;
  await expect(page).toHaveURL(/\/game(?:\?.*)?$/);
  await page.evaluate(() => { globalThis.__checkpointFault.reject = false; globalThis.__checkpointFault.rejectPending = false; });
  await page.locator("#retryClientCheckpointBtn").click();
  await expect(page.locator("#clientRecoveryNotice")).toBeHidden();
  expect(await routeCount(page, "/api/advance-week")).toBe(1);
  await page.reload();
  await waitGameReady(page);
  expect(await readIdentity(page)).toEqual(applied);
});

test("an interrupted checkpoint fails closed and only explicit recovery restores the earlier week", async ({ page }) => {
  await configureClient(page, true);
  const opening = await createClientLeague(page, host.origin);
  await installCheckpointFault(page);
  await page.evaluate(() => { globalThis.__checkpointFault.reject = true; });
  await advanceClientWeek(page);
  await expect(page.locator("#clientRecoveryNotice")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.locator('#gameBootOverlay[role="alert"]')).toBeVisible();
  await expect(page.locator("#gameBootOverlay")).toContainText("Your franchise could not open");
  await expect(page.locator("#restorePreviousCheckpointBtn")).toBeVisible();
  await page.locator("#restorePreviousCheckpointBtn").click();
  await waitGameReady(page);
  expect(await readIdentity(page)).toEqual(opening);
});

test("a corrupt required checkpoint cannot silently open a default franchise", async ({ page }) => {
  await configureClient(page, true);
  await createClientLeague(page, host.origin);
  await page.evaluate((key) => sessionStorage.setItem(key, "{broken"), CHECKPOINT_KEY);
  await page.reload();
  await expect(page.locator('#gameBootOverlay[role="alert"]')).toBeVisible();
  await expect(page.locator("#gameBootOverlay")).toContainText("Your franchise could not open");
  await expect(page.locator("#statusChip")).not.toContainText("Ready");
});
