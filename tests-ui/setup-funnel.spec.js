import { test, expect } from "@playwright/test";

// S70 root-funnel contract: first-time visitors get a one-click start and no
// returning-player furniture; returning players get Continue/Resume instead.

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

// The dev Playwright server is stateful across spec files, so first-visit
// behavior is exercised in the client runtime, where a fresh browser context
// is genuinely a fresh player.
async function gotoAsFreshClientVisitor(page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("vsfgm:runtime-mode", "client"));
  await page.reload();
  await waitSetupReady(page);
}

test("fresh visitor: one-click instant start reaches the game with a random team", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);

  // New-visitor hero: instant start visible; Continue/Resume hidden (not disabled).
  await expect(page.locator('[data-testid="instant-start-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="continue-active-btn"]')).toBeHidden();
  await expect(page.locator('[data-testid="resume-latest-btn"]')).toBeHidden();

  // No server-first language on the first paint of a zero-backend runtime.
  await expect(page.locator("#activeLeagueText")).not.toContainText("server");

  // Saved Leagues stays collapsed when there is nothing to show.
  await expect(page.locator("#savedLeaguesSection")).not.toHaveAttribute("open", "");
  // Backups stay reachable on a fresh browser: they are the way back when the
  // slots and the active league are gone (S133 review).
  await expect(page.locator("summary", { hasText: "Auto Backups" })).toBeVisible();

  // Team select defaults to the random option.
  await expect(page.locator("#teamSelect")).toHaveValue("__random__");
  await expect(page.locator("#heroTeamSelect")).toBeVisible();
  await expect(page.locator("#heroTeamSelect")).toHaveValue("__random__");
  await expect(page.locator("#heroTeamSelect option").first()).toHaveText("Team: Surprise me");

  // One click: instant start creates a league and lands in the game.
  await page.click('[data-testid="instant-start-btn"]');
  await expect(page).toHaveURL(/\/game\.html\?resume=tab$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
});

// S133: the detailed Community Stats choice is offered before setup as an
// unticked box beside the start button; the in-game card is only a fallback.
for (const ticked of [true, false]) {
  test(`fresh visitor: the sharing choice before setup is honoured when ${ticked ? "ticked" : "left unticked"}`, async ({ page }) => {
    await page.route(/api-franchise-architect-football\.vaultsparkstudios\.com/, (route) => route.abort());
    await gotoAsFreshClientVisitor(page);
    const choice = page.locator('[data-testid="hero-share-choice"]');
    await expect(choice).toBeVisible();
    await expect(page.locator('[data-testid="share-detailed-stats"]')).not.toBeChecked();
    if (ticked) await page.check('[data-testid="share-detailed-stats"]');
    await page.click('[data-testid="instant-start-btn"]');
    await expect(page).toHaveURL(/\/game\.html\?resume=tab$/, { timeout: 90_000 });
    const stored = await page.evaluate(() => ({
      offer: window.localStorage.getItem("fa:community-offer:v1"),
      consent: window.localStorage.getItem("fa:community-participation:v1")
    }));
    expect(stored.offer).toBe("offered");
    if (ticked) expect(stored.consent).toBe("participating");
    else expect(stored.consent === null || stored.consent === "declined" ? "not-participating" : stored.consent).toBe("not-participating");
    await page.goto("/");
    await waitSetupReady(page);
    await expect(choice).toBeHidden();
  });
}

test("fresh visitor: a scenario card below the box does not count as seeing the sharing offer", async ({ page }) => {
  await page.route(/api-franchise-architect-football\.vaultsparkstudios\.com/, (route) => route.abort());
  await gotoAsFreshClientVisitor(page);
  await expect(page.locator('[data-testid="hero-share-choice"]')).toBeVisible();
  await page.locator("[data-scenario]").first().click();
  await expect(page).toHaveURL(/\/game\.html\?resume=tab$/, { timeout: 90_000 });
  const stored = await page.evaluate(() => ({
    offer: window.localStorage.getItem("fa:community-offer:v1"),
    consent: window.localStorage.getItem("fa:community-participation:v1")
  }));
  expect(stored.offer, "the in-game card after season 1 stays available").toBeNull();
  expect(stored.consent === null || stored.consent === "declined").toBe(true);
});

test("fresh visitor: the team picked beside the start button is the team they get", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);
  await expect(page.locator('#heroTeamSelect option[value="BUF"]')).toHaveCount(1);
  await page.selectOption("#heroTeamSelect", "BUF");
  // One team choice, two pickers: the hero pick sets the league's team.
  await expect(page.locator("#teamSelect")).toHaveValue("BUF");
  await page.selectOption("#teamSelect", "KC");
  await expect(page.locator("#heroTeamSelect")).toHaveValue("KC");
  await page.selectOption("#heroTeamSelect", "BUF");

  await page.click('[data-testid="instant-start-btn"]');
  await expect(page).toHaveURL(/\/game\.html\?resume=tab$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  expect(await page.evaluate(async () => (await import("./lib/appState.js")).state.dashboard.controlledTeamId)).toBe("BUF");
});

test("quick start cards state the difficulty and sim mode they set", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);
  await expect(page.locator('#presetModernBtn [data-preset-sets="modern"]')).toContainText("Standard difficulty");
  await expect(page.locator('#presetModernBtn [data-preset-sets="modern"]')).toContainText("Play-by-play sim");
  await expect(page.locator('#presetBalancedBtn [data-preset-sets="balanced"]')).toContainText("Drive-by-drive sim");
  await expect(page.locator('#presetLegacyBtn [data-preset-sets="legacy"]')).toContainText("Hard difficulty");
  await expect(page.locator('#presetLegacyBtn [data-preset-sets="legacy"]')).toContainText("Dynamic Narratives off");
});

test("quick start era card starts a league in the same click", async ({ page }) => {
  await gotoAsFreshClientVisitor(page);
  await page.click("#presetBalancedBtn");
  await expect(page).toHaveURL(/\/game\.html\?resume=tab$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
});

test("returning player sees Continue Franchise instead of instant start", async ({ page }) => {
  await page.goto("/");
  await waitSetupReady(page);
  await page.selectOption("#teamSelect", "BUF");
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });

  await page.goto("/");
  await waitSetupReady(page);
  await expect(page.locator('[data-testid="continue-active-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="instant-start-btn"]')).toBeHidden();
  await expect(page.locator("#heroTeamSelect")).toBeHidden();
});
