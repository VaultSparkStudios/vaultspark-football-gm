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
  const start = page.locator("#instantStartBtn");
  const why = page.locator("#why");
  await expect(start).toBeVisible();
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
