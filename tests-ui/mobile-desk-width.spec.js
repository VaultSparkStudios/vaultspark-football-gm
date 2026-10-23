import { test, expect } from "@playwright/test";

// S119 — the phone Desk was clipped for sessions on end. One widget caused it:
// the situational-calls switch was `width: max-content`, and inside a grid's
// intrinsic sizing `max-width: 100%` cannot resolve, so its single-row width
// became the minimum width of the whole Desk column (356 px in a 321 px
// column at 390 px). Every Desk card then ran past the panel's right edge,
// where overflow:hidden clipped it. This proves every card fits on a phone.

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

// Every rendered child of the Desk's hero column, with its right edge compared
// to the hero panel's content box (inside its padding and border).
async function deskOverflow(page) {
  return page.evaluate(() => {
    const panel = document.querySelector("#overviewTab .overview-hero-panel");
    const column = panel?.querySelector(".overview-hero-copy");
    if (!panel || !column) return null;
    const style = getComputedStyle(panel);
    const contentRight = panel.getBoundingClientRect().right
      - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    const cards = [...column.children].filter((el) => el.getBoundingClientRect().width > 0);
    return {
      cards: cards.length,
      overflowing: cards
        .map((el) => ({ id: el.id || el.className, over: Math.round((el.getBoundingClientRect().right - contentRight) * 10) / 10 }))
        .filter((row) => row.over > 0.5),
      columnFits: column.getBoundingClientRect().right <= contentRight + 0.5
    };
  });
}

test("every Desk card fits inside the panel on a phone", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await createLeague(page);
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible({ timeout: 5_000 }).catch(() => false)) await fullView.click();

  // The card that caused the defect must actually be on screen, or a pass
  // here would prove nothing.
  await expect(page.locator("#overviewTab #situationalCallsCard .situational-calls-switch").first()).toBeVisible();

  for (const [width, height] of [[390, 844], [320, 700]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => (await deskOverflow(page))?.cards ?? 0).toBeGreaterThan(3);
    const report = await deskOverflow(page);
    expect(report.overflowing, `${width}px: Desk cards past the panel edge`).toEqual([]);
    expect(report.columnFits, `${width}px: Desk column wider than its panel`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // The switch wraps rather than overflowing its own card.
    const switchFits = await page.evaluate(() => {
      const card = document.querySelector("#situationalCallsCard");
      return [...card.querySelectorAll(".situational-calls-switch")]
        .every((el) => el.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5);
    });
    expect(switchFits, `${width}px: a situational-calls switch overflows its card`).toBe(true);
  }
});
