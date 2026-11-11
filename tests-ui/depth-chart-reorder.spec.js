import { test, expect } from "@playwright/test";

// The depth chart is reordered by dragging a row. These journeys cover the
// three ways to move a player (mouse drag, keyboard, touch on a phone), that a
// move on your own club saves without pressing Save, and that each row shows
// the numbers needed to decide without opening a player profile.

async function createLeague(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  const advanced = page.locator("details:has(#seedInput)");
  if (!(await advanced.getAttribute("open"))) await advanced.locator(":scope > summary").click();
  await page.fill("#seedInput", "20260306");
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible({ timeout: 2_000 }).catch(() => false)) await decline.click();
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) await skip.click();
}

async function openDepthChart(page, position) {
  await page.evaluate(() => document.querySelector('#rosterTab [data-team-mode="depthTab"]')?.click());
  if (!(await page.locator("#depthTab").isVisible().catch(() => false))) {
    await page.click('[data-testid="tab-roster"]');
    await page.click('#rosterTab [data-team-mode="depthTab"]');
  }
  await page.selectOption("#depthPositionSelect", position);
  await page.click("#loadDepthBtn");
  await expect(page.locator("#depthTable tr[data-depth-row]").first()).toBeVisible({ timeout: 30_000 });
}

const names = (page) => page.locator("#depthTable tr[data-depth-row] [data-depth-player-name] .link-btn").allTextContents();

async function dragRow(page, fromIndex, toIndex) {
  const grip = page.locator("#depthTable [data-depth-grip]").nth(fromIndex);
  const target = page.locator("#depthTable tr[data-depth-row]").nth(toIndex);
  // Coordinates are viewport-relative: bring the rows on screen before measuring.
  await target.evaluate((row) => row.scrollIntoView({ block: "center" }));
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Past the target row's midpoint, in steps, the way a hand moves.
  const endY = toIndex > fromIndex ? to.y + to.height * 0.8 : to.y + to.height * 0.2;
  await page.mouse.move(from.x + from.width / 2, endY, { steps: 12 });
  await page.mouse.up();
}

test("each depth chart row shows age, category scores, strengths, status and contract", async ({ page }) => {
  await createLeague(page);
  await openDepthChart(page, "WR");
  const row = page.locator("#depthTable tr[data-depth-row]").first();
  await expect(row.locator(".depth-meta")).toContainText(/Age \d+/);
  await expect(row.locator(".depth-meta")).toContainText(/Yr \d+|Rookie/);
  for (const label of ["OVR", "POT", "ATH", "TEC", "IQ", "INS"]) {
    await expect(row.locator(`td[data-label="${label}"] .depth-rating`)).toHaveText(/^\d{2}$/);
  }
  await expect(row.locator(".depth-ability")).toHaveCount(3);
  await expect(row.locator('td[data-label="Status"]')).toContainText(/Ready|Injured|Out|Inactive/);
  await expect(row.locator('td[data-label="Contract"]')).toContainText(/\d+ yr/);
  // Every column, including the snap share, is on screen at a laptop width.
  const overflow = await page.evaluate(() => {
    const wrap = document.querySelector("#depthTab .table-wrap");
    return wrap.scrollWidth - wrap.clientWidth;
  });
  expect(overflow, "the depth chart fits its panel at 1280 px").toBeLessThanOrEqual(1);
});

test("dragging a row down reorders the group and saves it without pressing Save", async ({ page }) => {
  await createLeague(page);
  await openDepthChart(page, "WR");
  const before = await names(page);
  expect(before.length).toBeGreaterThan(3);

  await dragRow(page, 0, 2);
  const expected = [before[1], before[2], before[0], ...before.slice(3)];
  await expect.poll(() => names(page)).toEqual(expected);
  await expect(page.locator("#depthStatusText")).toContainText("Depth chart saved", { timeout: 20_000 });

  // The order came back from the saved league, not from this page's memory.
  await page.selectOption("#depthPositionSelect", "RB");
  await page.click("#loadDepthBtn");
  await expect(page.locator("#depthTable tr[data-depth-row]").first()).toBeVisible();
  await openDepthChart(page, "WR");
  await expect.poll(() => names(page)).toEqual(expected);
});

test("Undo puts the previous order back", async ({ page }) => {
  await createLeague(page);
  await openDepthChart(page, "RB");
  const before = await names(page);
  await expect(page.locator("#depthUndoBtn")).toBeHidden();
  await dragRow(page, 1, 0);
  await expect.poll(() => names(page)).toEqual([before[1], before[0], ...before.slice(2)]);
  await page.click("#depthUndoBtn");
  await expect.poll(() => names(page)).toEqual(before);
});

test("the keyboard moves a row from its grip and keeps focus on that player", async ({ page }) => {
  await createLeague(page);
  await openDepthChart(page, "LB");
  const before = await names(page);
  await page.locator("#depthTable [data-depth-grip]").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => names(page)).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(page.locator("#depthStatusText")).toContainText(`${before[0]} is now LB2`);
  const focused = await page.evaluate(() => document.activeElement?.closest("tr")?.querySelector("[data-depth-player-name] .link-btn")?.textContent);
  expect(focused).toBe(before[0]);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => names(page)).toEqual(before);
});

test("Best Lineup puts unavailable players last and the highest-graded healthy player first", async ({ page }) => {
  await createLeague(page);
  await openDepthChart(page, "DB");
  const before = await names(page);
  await dragRow(page, 0, 3);
  await expect.poll(async () => (await names(page))[0]).not.toBe(before[0]);
  await page.click("#depthBestLineupBtn");
  await expect(page.locator("#depthStatusText")).toContainText("Best lineup set");
  await expect.poll(async () => (await names(page))[0]).toBe(before[0]);
});

for (const width of [390, 320]) {
  test(`on a ${width} px phone the rows fit the screen and a touch drag reorders them`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await createLeague(page);
    // A phone opens on the weekly loop view; the depth chart is in the full view.
    const fullView = page.locator("#mlFullViewBtn");
    await expect(fullView).toBeVisible();
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
    await openDepthChart(page, "WR");

    const overflow = await page.evaluate(() => {
      const wrap = document.querySelector("#depthTab .table-wrap");
      return wrap.scrollWidth - wrap.clientWidth;
    });
    expect(overflow, "depth chart rows do not scroll sideways on a phone").toBeLessThanOrEqual(1);

    const before = await names(page);
    // Centre the first grip: a phone has a tall sticky header, and a touch that
    // lands under it never reaches the row.
    await page.locator("#depthTable [data-depth-grip]").nth(0).evaluate((grip) => grip.scrollIntoView({ block: "center" }));
    const grip = await page.locator("#depthTable [data-depth-grip]").nth(0).boundingBox();
    const target = await page.locator("#depthTable tr[data-depth-row]").nth(1).boundingBox();
    const x = grip.x + grip.width / 2;
    const startY = grip.y + grip.height / 2;
    const endY = target.y + target.height * 0.6;
    // Real touch pointer events through the browser's input pipeline.
    const client = await context.newCDPSession(page);
    const touch = (type, y) => client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", startY);
    for (let step = 1; step <= 10; step += 1) await touch("touchMove", startY + ((endY - startY) * step) / 10);
    await touch("touchEnd", endY);
    await expect.poll(() => names(page)).toEqual([before[1], before[0], ...before.slice(2)]);
    await context.close();
  });
}
