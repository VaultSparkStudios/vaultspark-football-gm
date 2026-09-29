import { test, expect } from "@playwright/test";

/**
 * S109 — the client-only engine runs in a module Worker. The page thread must
 * stay responsive while a long simulation runs: a tab click during an
 * in-flight season advance has to activate within 750 ms, and the page thread
 * must never stall for a full second (the reading that separates the arms).
 *
 * The gate declares its population: the runtime kind is asserted to be
 * "worker" first, so a silent fallback to the in-page runtime cannot pass
 * this test by accident.
 */

const SEED = 20260306;
const TAB_ACTIVATION_BUDGET_MS = 750;

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function waitGameReady(page, timeout = 60_000) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await decline.click();
    await expect(page.locator("#firstDebriefPulse")).toHaveCount(0);
  }
}

async function dismissTutorialIfVisible(page) {
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

async function createClientLeague(page, { workerRuntime = true } = {}) {
  // Client mode from the first byte: the spec is about the browser runtime and
  // must not depend on the dev server's server-mode bootstrap.
  await page.addInitScript((useWorker) => {
    try {
      window.localStorage.setItem("vsfgm:runtime-mode", "client");
      if (useWorker) window.localStorage.removeItem("vsfgm:runtime-worker");
      else window.localStorage.setItem("vsfgm:runtime-worker", "off");
    } catch { /* storage blocked */ }
  }, workerRuntime);
  await page.goto("/");
  await waitSetupReady(page);
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("client");
  const advancedSettings = page.locator("details:has(#seedInput)");
  if (!(await advancedSettings.getAttribute("open"))) {
    await advancedSettings.locator(":scope > summary").click();
  }
  await page.fill("#seedInput", String(SEED));
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await waitGameReady(page);
  await dismissTutorialIfVisible(page);
}

async function readRuntimeKind(page) {
  return page.evaluate(async () => {
    const { getLocalRuntimeKind, warmLocalRuntime } = await import("./lib/api/createApiClient.js");
    await warmLocalRuntime();
    return getLocalRuntimeKind();
  });
}

// advanceSeasonSequential reports "Advancing season step N..."; the week
// loop reports "Simulating week N/M...". Either is a live simulation step.
function parseSimulationStep(text) {
  const match = String(text || "").match(/(?:Advancing season step|Simulating week) (\d+)/i);
  return match ? Number(match[1]) : null;
}

const SIM_STEP_PATTERN = /Advancing season step \d+|Simulating week \d+/i;

async function declineAutoPlan(page) {
  const skipPlan = page.locator("#halftimeAdjustModal .tactic-skip-btn");
  await expect(skipPlan).toBeVisible({ timeout: 15_000 });
  await skipPlan.click();
}

/**
 * Starts a season advance, waits until a step is live, clicks a tab and
 * measures how long activation took. Returns the measurement; the caller
 * decides what to assert, so the same probe serves the gate and its control.
 */
async function probeTabActivationDuringSeason(page, { budgetMs, requireLiveStep = true }) {
  // Long-task probe: the largest main-thread stall observed while the season
  // runs. Reported, not asserted — it is the mechanism behind the click gate.
  await page.evaluate(() => {
    window.__vsfgmLongTasks = { max: 0, count: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__vsfgmLongTasks.count += 1;
          window.__vsfgmLongTasks.max = Math.max(window.__vsfgmLongTasks.max, entry.duration);
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      window.__vsfgmLongTasks = null;
    }
  });

  await page.click("#advanceSeasonBtn");
  // The season advance first asks for an auto-plan; decline it so the loop starts.
  await declineAutoPlan(page);

  const status = page.locator("#statusChip");
  let stepAtClick = null;
  if (requireLiveStep) {
    await expect(status).toContainText(SIM_STEP_PATTERN, { timeout: 30_000 });
    // Measure while a step is genuinely in flight in the worker, not during the
    // pre-step decision prompt: wait until at least the second step has started.
    await expect.poll(() => status.textContent().then(parseSimulationStep), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    stepAtClick = parseSimulationStep(await status.textContent());
  }
  // (An in-page runtime never shows a live step to the driver: the thread is
  // blocked from the first step to the checkpoint, so the control clicks now.)

  // Not `locator.click()`: its actionability checks retry with their own
  // timing. A raw click through the driver, then the DOM assertion, measures
  // only what the page thread took to dispatch and handle the event.
  const started = Date.now();
  await page.locator('[data-tab="rosterTab"]').first().dispatchEvent("click");
  await expect(page.locator("#rosterTab")).toHaveClass(/active/, { timeout: Math.max(budgetMs, 10_000) });
  const elapsed = Date.now() - started;

  // The simulation kept going underneath the click: the gate measured a live run.
  await expect.poll(async () => {
    const text = (await status.textContent()) || "";
    const step = parseSimulationStep(text);
    return /Ready|Checkpoint|Paused|Done/i.test(text) || (stepAtClick != null && step != null && step > stepAtClick);
  }, { timeout: 120_000 }).toBe(true);

  const longTasks = await page.evaluate(() => window.__vsfgmLongTasks);
  const summary = `tab activation ${elapsed}ms; long tasks ${longTasks ? `${longTasks.count} (max ${Math.round(longTasks.max)}ms)` : "unobservable"}`;
  test.info().annotations.push({ type: "main-thread", description: summary });
  console.log(`[worker-runtime] ${summary}`);
  return { elapsed, longTasks };
}

// Two readings, one mechanism. The wall-clock bound is what a player feels and
// is noisy on a loaded host (151 ms on one run, 387 ms on the next, same code);
// the largest main-thread stall is the mechanism and separates the arms by
// fifty times (worker 162 ms, in-page 8,100 ms), so it carries the gate.
const LONG_TASK_BUDGET_MS = 1_000;

test("the engine runs in a worker: a tab activates during a season advance and the page thread never stalls for a second", async ({ page }) => {
  await createClientLeague(page);
  expect(await readRuntimeKind(page)).toBe("worker");
  const { elapsed, longTasks } = await probeTabActivationDuringSeason(page, { budgetMs: TAB_ACTIVATION_BUDGET_MS });
  expect(elapsed, `tab activation took ${elapsed}ms while the season was simulating`).toBeLessThan(TAB_ACTIVATION_BUDGET_MS);
  if (longTasks) {
    expect(longTasks.max, `largest main-thread stall ${Math.round(longTasks.max)}ms while the season was simulating`).toBeLessThan(LONG_TASK_BUDGET_MS);
  }
});

// Negative control (opt-in: VSFGM_WORKER_NEGATIVE_CONTROL=1). The same probe
// with the worker switched off, so the measurement can be read against the
// in-page runtime. It records; it does not assert a number, because the
// in-page stall depends on the host.
test("negative control: the same probe against the in-page runtime", async ({ page }) => {
  test.skip(!process.env.VSFGM_WORKER_NEGATIVE_CONTROL, "set VSFGM_WORKER_NEGATIVE_CONTROL=1 to run");
  await createClientLeague(page, { workerRuntime: false });
  expect(await readRuntimeKind(page)).toBe("in-page");
  const { elapsed, longTasks } = await probeTabActivationDuringSeason(page, { budgetMs: TAB_ACTIVATION_BUDGET_MS, requireLiveStep: false });
  console.log(`[worker-runtime] in-page control: tab activation ${elapsed}ms (gate is ${TAB_ACTIVATION_BUDGET_MS}ms)`);
  // The control proves the gate has bite: the in-page thread stalls for seconds.
  if (longTasks) expect(longTasks.max).toBeGreaterThan(LONG_TASK_BUDGET_MS);
});

test("the worker's storage mirror lands in the page's localStorage", async ({ page }) => {
  await createClientLeague(page);
  expect(await readRuntimeKind(page)).toBe("worker");
  // Four weeks share the season path's single auto-plan prompt; one week would
  // open the Weekly Plan Composer and wait on a human.
  await page.click("#advance4WeeksBtn");
  await declineAutoPlan(page);
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 120_000 });
  // The automatic backup is written by the worker and replayed to the page:
  // the slot META record (localStorage truth) must be visible here.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("vsfgm:meta:auto-")).length), { timeout: 30_000 }).toBeGreaterThan(0);
});
