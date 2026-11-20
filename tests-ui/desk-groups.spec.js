import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the Desk's four groups.
 *
 * The grouping rules, the remembered open/closed choice and the lazy-render
 * guards are proved at node level (test/desk-groups.test.js). What only a real
 * browser can prove is the first view: four headings, only "This week" open,
 * collapsed groups that open and fill themselves, and no sideways scroll on a
 * 390 px phone.
 */

const GROUPS = [
  ["#deskGroupWeekTitle", "This week"],
  ["#deskGroupClub > summary .desk-group-title", "Your club"],
  ["#deskGroupLeague > summary .desk-group-title", "The league"],
  ["#deskGroupCareer > summary .desk-group-title", "Your career"]
];

async function startFranchise(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  await page.selectOption("#rulesPresetInput", "standard");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  // A phone opens on the weekly loop view; the Desk is the full view.
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible().catch(() => false)) {
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
  }
  await expect(page.locator("#overviewTab")).toHaveClass(/active/);
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the Desk shows four groups, with only This week open", async ({ page }) => {
  await startFranchise(page);

  for (const [selector, heading] of GROUPS) {
    await expect(page.locator(selector)).toHaveText(heading);
    await expect(page.locator(selector)).toBeVisible();
  }
  const order = await page.locator("#overviewTab .desk-group-title").allTextContents();
  expect(order.map((text) => text.trim())).toEqual(GROUPS.map(([, heading]) => heading));

  // What needs the GM now is on screen without opening anything.
  await expect(page.locator("#franchiseCommandCenter")).toBeVisible();
  await expect(page.locator("#weeklyPlanSummaryText")).toBeVisible();

  // The other three groups start collapsed, and their panels are not shown.
  for (const id of ["deskGroupClub", "deskGroupLeague", "deskGroupCareer"]) {
    await expect(page.locator(`#${id}`)).not.toHaveAttribute("open", /.*/);
  }
  await expect(page.locator("#needsTable")).toBeHidden();
  await expect(page.locator("#scheduleTable")).toBeHidden();
  await expect(page.locator("#trophyRoadPanel")).toBeHidden();
  // A collapsed group has not done its rendering yet.
  await expect(page.locator("#scheduleTable tr")).toHaveCount(0);
  await expect(page.locator("#franchiseArchitectureContent")).toBeEmpty();
});

test("each collapsed group opens, fills itself, and is remembered", async ({ page }) => {
  await startFranchise(page);

  await page.locator("#deskGroupClub > summary").click();
  await expect(page.locator("#deskGroupClub")).toHaveAttribute("open", /.*/);
  await expect(page.locator("#needsTable")).toBeVisible();
  await expect(page.locator("#capCard")).toBeVisible();
  await expect(page.locator("#capCard")).not.toHaveText("-");

  await page.locator("#deskGroupLeague > summary").click();
  await expect(page.locator("#scheduleTable")).toBeVisible();
  // No "Load" button: the schedule fills itself the moment the group opens.
  await expect(page.locator("#scheduleTable tr").nth(1)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#deskGroupLeague [data-desk-tab-link="calendarTab"]')).toBeVisible();

  await page.locator("#deskGroupCareer > summary").click();
  await expect(page.locator("#trophyRoadPanel")).toBeVisible();
  await expect(page.locator("#gmLegacyCardWrap")).toBeVisible();
  await expect(page.locator("#franchiseArchitectureContent")).not.toBeEmpty();
  await expect(page.locator("#overviewTab button", { hasText: /^Load\b/ })).toHaveCount(0);

  // The GM Profile link shows only when that tab exists, and then it opens it.
  const profileLink = page.locator('#deskGroupCareer [data-desk-tab-link="gmProfileTab"]');
  if (await page.locator('.menu-btn[data-tab="gmProfileTab"]').count()) {
    await expect(profileLink).toBeVisible();
  } else {
    await expect(profileLink).toBeHidden();
  }

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("franchise-architect-desk-groups:v1") || "{}"));
  expect(saved).toMatchObject({ club: true, league: true, career: true });

  // Closing one is remembered too, and survives a reload.
  await page.locator("#deskGroupClub > summary").click();
  await expect(page.locator("#needsTable")).toBeHidden();
  await page.reload();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible().catch(() => false)) await fullView.click();
  await expect(page.locator("#deskGroupLeague")).toHaveAttribute("open", /.*/);
  await expect(page.locator("#deskGroupClub")).not.toHaveAttribute("open", /.*/);
});

test("the grouped Desk has no horizontal overflow at 390 px, collapsed or open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFranchise(page);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  // The four headings fit the phone's width, and the three collapsed ones sit
  // together directly after the first group.
  const boxes = [];
  for (const id of ["deskGroupClub", "deskGroupLeague", "deskGroupCareer"]) {
    const box = await page.locator(`#${id} > summary`).boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    expect(box.height).toBeGreaterThanOrEqual(44);
    boxes.push(box);
  }
  expect(boxes[2].y + boxes[2].height - boxes[0].y).toBeLessThan(844);

  await page.evaluate(() => { for (const group of document.querySelectorAll("details.desk-group")) group.open = true; });
  await expect(page.locator("#needsTable")).toBeVisible();
  await expect(page.locator("#franchiseArchitectureContent")).not.toBeEmpty();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
