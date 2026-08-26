import { test, expect } from "@playwright/test";

// S94 public-surface contract.
//
// Three things this session changed that only a real browser can prove: the
// pitch reaching the root page without displacing the one-click start (the S70
// canon), the community widget refusing to render a row of zeros before a
// cohort exists, and the new measured-realism page rendering figures generated
// from the engine's own constants.

test("the root page argues the case, below the one-click start rather than in front of it", async ({ page }) => {
  await page.goto("/");
  // The hero branches on save presence (DECISIONS S70) and the dev server is
  // stateful across specs, so take whichever start control is being offered.
  const start = page.locator("#instantStartBtn, #continueActiveBtn, #resumeLatestBtn").locator("visible=true").first();
  const why = page.locator("#why");
  await expect(start).toBeVisible({ timeout: 20_000 });
  await expect(why).toBeAttached();

  // DECISIONS 2026-08-04 settled that the root URL belongs to the newcomer and
  // that one click starts a league. The pitch is additive to that, never ahead
  // of it — so assert the geometry, not just the presence.
  const startBox = await start.boundingBox();
  const whyBox = await why.boundingBox();
  expect(startBox.y).toBeLessThan(whyBox.y);

  await expect(page.locator("#why .why-card")).toHaveCount(9);
  await expect(page.locator('#why a[href$="simulation.html"]')).toBeVisible();
});

test("the community pulse offers an invitation, never zero contributors, before a cohort exists", async ({ page }) => {
  await page.route("**/community/v1/snapshot", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "1.0",
        status: "warming",
        suppressionThreshold: 5,
        periods: {
          "30d": { key: "30d", label: "Past 30 days", status: "warming", sampleSize: 0, headline: [], categories: [] }
        }
      })
    })
  );
  await page.goto("/");
  const pulse = page.locator("[data-community-pulse]");
  await expect(pulse).toHaveAttribute("data-state", "pre-cohort", { timeout: 20_000 });
  await expect(pulse.locator("[data-community-invitation]")).toBeVisible();
  await expect(pulse).not.toContainText("0 contributors");
  await expect(pulse).not.toContainText("Warming up");
});

test("a real cohort still renders the scoreboard", async ({ page }) => {
  const stat = (id) => ({ id, label: id, status: "live", value: 42, sampleSize: 30, period: "Past 30 days" });
  await page.route("**/community/v1/snapshot", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "1.0",
        status: "live",
        computedAt: new Date().toISOString(),
        suppressionThreshold: 5,
        periods: {
          "30d": {
            key: "30d",
            label: "Past 30 days",
            status: "live",
            sampleSize: 30,
            headline: [stat("participating-browsers"), stat("weeks-managed")],
            categories: []
          }
        }
      })
    })
  );
  await page.goto("/");
  const pulse = page.locator("[data-community-pulse]");
  await expect(pulse.locator(".community-pulse-grid")).toBeVisible({ timeout: 20_000 });
  await expect(pulse.locator("[data-community-invitation]")).toHaveCount(0);
});

test("the simulation page publishes its anchor and, more importantly, its limits", async ({ page }) => {
  await page.goto("/simulation.html");
  await expect(page.locator("h1")).toContainText("How honest is this simulation");

  const anchor = page.locator("[data-simulation-anchor]");
  await expect(anchor).toBeVisible();
  // Generated from progressionParity's own constants at build time.
  await expect(anchor).toContainText("26");
  await expect(anchor).toContainText("88");
  await expect(anchor).toContainText("1,696");
  await expect(anchor).toContainText("1.53");

  // The limits section is the reason the page is credible; it is not optional.
  const limits = page.locator(".sim-limits li");
  await expect(limits).toHaveCount(5);
  await expect(page.locator(".sim-section--limits")).toContainText("analogy, not an identity");
});

test("retired routes do not resurface as pages", async ({ page }) => {
  for (const gone of ["/landing.html", "/changelog.html", "/ip.html"]) {
    const response = await page.goto(gone, { waitUntil: "domcontentloaded" });
    // The dev server has no edge redirect layer, so the contract asserted here
    // is only that no meta-refresh document survived in the artifact.
    if (response && response.ok()) {
      await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
    }
  }
});

// ── In-game surfaces (S94 wave 4) ────────────────────────────────────────────

// The dev Playwright server is stateful across spec files, so by the time these
// run a save may already exist and the S70 hero has branched to Continue. Take
// whichever entry point the hero is actually offering.
async function startFranchise(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  for (const id of ["#continueActiveBtn", "#resumeLatestBtn", "#instantStartBtn"]) {
    const button = page.locator(id);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      break;
    }
  }
  await expect(page).toHaveURL(/game\.html/, { timeout: 60_000 });
  await expect(page.locator("#tab-overview")).toBeVisible({ timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
}

test("the Boardroom is a real surface and the owner economy lives there", async ({ page }) => {
  await startFranchise(page);
  await page.locator('[data-tab="boardroomTab"]').first().click();
  const boardroom = page.locator("#boardroomTab");
  await expect(boardroom).toHaveClass(/active/);
  await expect(boardroom.getByRole("heading", { name: "Owner Controls" })).toBeVisible({ timeout: 30_000 });
  await expect(boardroom.getByRole("heading", { name: "Facilities Market" })).toBeVisible();
  await expect(boardroom.getByRole("heading", { name: "Coaching Staff" })).toBeVisible();
  // S93's priced construction path must still be the only way in.
  await expect(boardroom.locator("#investFacilityBtn")).toBeVisible();
  // Hydrated from opening the Boardroom directly, without visiting Settings.
  await expect(boardroom.locator("#ownerTable")).not.toBeEmpty();
});

test("shared gameplay routes resolve to an exact target inside their declared tab", async ({ page }) => {
  await startFranchise(page);
  const routes = await page.evaluate(async () => {
    const { GAMEPLAY_SURFACE_ROUTES } = await import("./lib/gameplayNavigation.js");
    return GAMEPLAY_SURFACE_ROUTES;
  });

  for (const [name, route] of Object.entries(routes)) {
    const target = page.locator(`#${route.targetId}`);
    await expect(target, `${name} target exists`).toHaveCount(1);
    const owningTab = await target.evaluate((node) => node.closest(".tab-panel")?.id || null);
    expect(owningTab, `${name} target belongs to ${route.targetTab}`).toBe(route.targetTab);
  }
});

test("developer diagnostics do not ship to players, and open for ?dev=1", async ({ page }) => {
  await startFranchise(page);
  await page.locator('[data-tab="settingsTab"]').first().click();
  const dev = page.locator("[data-dev-surface]");
  await expect(dev).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Realism Verification/ })).toBeHidden();

  const url = new URL(page.url());
  url.searchParams.set("dev", "1");
  await page.goto(url.toString());
  await expect(page.locator("#tab-overview")).toBeAttached({ timeout: 40_000 });
  await page.locator('[data-tab="settingsTab"]').first().click();
  await expect(page.locator("[data-dev-surface]")).toBeVisible({ timeout: 30_000 });
});

test("there is one place to learn the game, with three views", async ({ page }) => {
  await startFranchise(page);
  await expect(page.locator('[data-tab="rulesTab"]')).toHaveCount(0);

  await page.locator("#openGuideBtn").click();
  const guide = page.locator("#guideModal");
  await expect(guide).toBeVisible();
  await expect(guide.locator("#guideHowToPanel")).toBeVisible();
  await expect(guide.locator("#guideRulesPanel")).toBeHidden();

  await guide.locator('[data-guide-view="guideRulesPanel"]').click();
  await expect(guide.locator("#guideRulesPanel")).toBeVisible();
  await expect(guide.locator("#guideHowToPanel")).toBeHidden();
  await expect(guide.locator("#rulesCoreTable")).not.toBeEmpty({ timeout: 20_000 });

  await guide.locator('[data-guide-view="guideActionsPanel"]').click();
  await expect(guide.locator("#rulesActionsTable")).not.toBeEmpty();
});
