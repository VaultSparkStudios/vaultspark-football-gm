import { test, expect } from "@playwright/test";

/**
 * Browser coverage for the GM Profile tab.
 *
 * The career summary itself is proved at node level (test/gm-profile.test.js).
 * What only a real browser can prove is the wiring: the page module is imported
 * on demand, the save and share controls kept their ids and still work after
 * moving out of Settings, and the page fits a phone in both themes.
 */

async function startFranchise(page) {
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
  await page.click(".setup-details-toggle");
  await page.selectOption("#modeInput", "play");
  await page.selectOption("#teamSelect", "BUF");
  // The setup form starts from the active league's settings, so the rules are
  // always chosen explicitly.
  await page.selectOption("#rulesPresetInput", "standard");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
}

// A phone opens on the weekly loop view, and its section menu is a closed
// drawer; the tab rail is in the full view.
async function leaveWeeklyLoop(page) {
  const fullView = page.locator("#mlFullViewBtn");
  if (await fullView.isVisible().catch(() => false)) {
    await fullView.click();
    await expect(page.locator("#mobileLoopOverlay")).toBeHidden();
  }
}

async function waitForProfile(page) {
  const profile = page.locator("#gmProfileTab");
  await expect(profile).toHaveClass(/active/);
  await expect(profile).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });
  // The career record is drawn by the on-demand module; its stat cards are the
  // proof that the module loaded and ran.
  await expect(profile.locator('[data-testid="gm-profile-stats"]')).toBeVisible({ timeout: 30_000 });
  return profile;
}

async function openProfile(page) {
  await leaveWeeklyLoop(page);
  await page.evaluate(() => document.querySelector('[data-tab="gmProfileTab"]').click());
  return waitForProfile(page);
}

test("the GM Profile opens from the rail and shows the career record, trophies, share and saves in order", async ({ page }) => {
  await startFranchise(page);
  await page.locator('[data-testid="tab-gm-profile"]').click();
  const profile = await waitForProfile(page);
  await expect(page.locator('[data-testid="tab-gm-profile"]')).toHaveAttribute("aria-selected", "true");

  // Career record: a new general manager has one club and no finished season.
  const stats = profile.locator('[data-testid="gm-profile-stats"]');
  for (const label of ["Seasons", "Record", "Playoff berths", "Titles", "Clubs managed"]) {
    await expect(stats).toContainText(label);
  }
  const clubs = profile.locator(".gm-profile-club");
  await expect(clubs).toHaveCount(1);
  await expect(clubs.first()).toHaveClass(/is-current/);
  await expect(clubs.first()).toContainText("Current club");
  await expect(profile.locator(".gm-profile-tier")).toContainText("Legacy tier 1 of 6");
  await expect(profile.locator(".gm-profile-tier")).toContainText("Next tier");
  await expect(profile.locator("#gmProfileCareer")).not.toContainText(/NaN|undefined/);

  // Trophy Case: every achievement, with progress on the locked ones that can be measured.
  const trophies = profile.locator("#trophyCaseContent .trophy");
  await expect(trophies.first()).toBeVisible();
  expect(await trophies.count()).toBeGreaterThanOrEqual(25);
  await expect(profile.locator(".trophy-case-summary")).toContainText("/");
  await expect(profile.locator("#trophyCaseContent .trophy-locked [data-trophy-progress] progress").first()).toBeVisible();

  // Share and saves moved here with their ids.
  for (const id of ["shareDynastyBtn", "leagueStoryCardBtn", "franchiseNewsletterBtn", "saveBtn", "loadBtn", "deleteSaveBtn", "exportSnapshotBtn", "importSnapshotBtn", "gistExportBtn", "refreshRewindBtn"]) {
    await expect(profile.locator(`#${id}`)).toBeVisible();
  }

  // The four parts appear in the promised order.
  const tops = await page.evaluate(() => ["gmProfileCareerPanel", "trophyCasePanel", "gmProfileSharePanel", "gmProfileSavesPanel"]
    .map((id) => document.getElementById(id).getBoundingClientRect().top));
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
});

test("the moved share and save controls still work", async ({ page }) => {
  await startFranchise(page);
  const profile = await openProfile(page);

  // League Story Card downloads a file through the on-demand export module.
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await profile.locator("#leagueStoryCardBtn").click();
  expect((await download).suggestedFilename()).toMatch(/story\.html$/);

  // Saving a slot from the GM Profile lists it beside the save buttons.
  const slot = `gm-profile-${Date.now()}`;
  await profile.locator("#saveSlotInput").fill(slot);
  await profile.locator("#saveBtn").click();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  await expect(profile.locator("#saveListText")).toContainText(slot, { timeout: 30_000 });
});

test("the Desk's own GM Profile link opens the page", async ({ page }) => {
  await startFranchise(page);
  await leaveWeeklyLoop(page);
  // The link sits in the Desk's career group, which starts folded.
  await page.evaluate(() => { document.getElementById("deskGroupCareer").open = true; });
  const link = page.locator('#overviewTab [data-desk-tab-link="gmProfileTab"]');
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await waitForProfile(page);
});

test("from the Desk, the Trophy Case and a share button are two clicks away", async ({ page }) => {
  await startFranchise(page);
  await expect(page.locator("#overviewTab")).toHaveClass(/active/);
  await page.locator('[data-testid="tab-gm-profile"]').click(); // click one
  const profile = await waitForProfile(page);
  await expect(profile.locator("#trophyCaseContent .trophy").first()).toBeVisible();
  const share = profile.locator("#leagueStoryCardBtn");
  await expect(share).toBeVisible();
  const download = page.waitForEvent("download", { timeout: 30_000 });
  await share.click(); // click two
  await download;
});

test("Settings keeps preferences and no longer holds saves, exports or trophies", async ({ page }) => {
  await startFranchise(page);
  await leaveWeeklyLoop(page);
  await page.evaluate(() => document.querySelector('[data-tab="settingsTab"]').click());
  const settings = page.locator("#settingsTab");
  await expect(settings).toHaveClass(/active/);
  await expect(settings).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });

  await expect(settings.locator([
    "#saveSlotInput", "#saveBtn", "#loadBtn", "#deleteSaveBtn", "#exportSnapshotBtn", "#importSnapshotBtn",
    "#gistExportBtn", "#gistImportBtn", "#rewindTimelineList", "#shareDynastyBtn", "#leagueStoryCardBtn",
    "#franchiseNewsletterBtn", "#dynastyTimelineContainer", "#trophyCaseContent"
  ].join(", "))).toHaveCount(0);
  // The moved controls are hidden while Settings is the open tab.
  await expect(page.locator("#saveBtn")).toBeHidden();
  await expect(page.locator("#leagueStoryCardBtn")).toBeHidden();

  for (const id of ["soundEnabledInput", "hapticsEnabledInput", "mobileLoopToggle", "saveSettingsBtn"]) {
    await expect(settings.locator(`#${id}`)).toBeVisible();
  }
});

for (const theme of ["dark", "light"]) {
  test(`the GM Profile fits a phone screen in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem("franchise-architect-theme", value), theme);
    await startFranchise(page);
    const profile = await openProfile(page);
    await expect(profile.locator("#trophyCaseContent .trophy").first()).toBeVisible();
    await expect(profile.locator("#saveBtn")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const tab = document.getElementById("gmProfileTab");
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.id || node.className || node.tagName, left: rect.left, right: rect.right, height: rect.height, width: rect.width };
      };
      // The dynasty timeline scrolls sideways inside its own box by design.
      const outsideTimeline = (node) => !node.closest("#dynastyTimelineContainer");
      const shown = (node) => node.getClientRects().length > 0;
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabOverflow: tab.scrollWidth - tab.clientWidth,
        panels: [...tab.querySelectorAll(".panel")].filter(shown).map(box),
        controls: [...tab.querySelectorAll("button, input:not([type='file']), .trophy, .gm-profile-club, .control-spotlight-card")]
          .filter(shown).filter(outsideTimeline).map(box),
        saveButtons: ["saveBtn", "loadBtn", "deleteSaveBtn", "exportSnapshotBtn", "importSnapshotBtn"].map((id) => box(document.getElementById(id)))
      };
    });
    expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
    expect(metrics.tabOverflow).toBeLessThanOrEqual(1);
    for (const item of [...metrics.panels, ...metrics.controls]) {
      expect(item.left, `${item.id} starts on screen`).toBeGreaterThanOrEqual(-1);
      expect(item.right, `${item.id} ends on screen`).toBeLessThanOrEqual(391);
    }
    for (const button of metrics.saveButtons) {
      expect(button.height, `${button.id} is a full touch target`).toBeGreaterThanOrEqual(44);
    }
  });
}
