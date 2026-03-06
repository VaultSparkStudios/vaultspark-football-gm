import { test, expect } from "@playwright/test";

function parseWeek(text) {
  const match = String(text || "").match(/W(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function waitGameReady(page) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 25_000 });
}

async function createLeagueFromSetup(page) {
  await page.goto("/");
  await waitSetupReady(page);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 25_000 });
  await waitGameReady(page);
}

async function firstTableCell(page, selector, columnIndex = 1) {
  return (await page.locator(`${selector} tr:nth-child(2) td:nth-child(${columnIndex})`).textContent())?.trim();
}

test("create league, advance week, and open player modal", async ({ page }) => {
  await createLeagueFromSetup(page);

  const before = parseWeek(await page.locator("#yearCard").textContent());
  await page.click("#advanceWeekBtn");
  await waitGameReady(page);
  const after = parseWeek(await page.locator("#yearCard").textContent());
  expect(after).not.toBeNull();
  expect(before).not.toBeNull();
  expect(after).toBeGreaterThanOrEqual(before + 1);

  await page.click('[data-testid="tab-roster"]');
  await page.click("#loadRosterBtn");
  await waitGameReady(page);

  const playerButtons = page.locator("#rosterTable button[data-player-id]");
  await expect(playerButtons.first()).toBeVisible();
  await playerButtons.first().click();

  await expect(page.locator("#playerModal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#playerModalTitle")).not.toHaveText(/^Player$/);
  await page.click("#closePlayerModalBtn");
  await expect(page.locator("#playerModal")).toHaveClass(/hidden/);
});

test("contracts, trade, calendar, and transaction log are operational", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-roster"]');
  await page.click("#loadRosterBtn");
  await waitGameReady(page);
  const playerId = await firstTableCell(page, "#rosterTable", 1);
  expect(playerId).toBeTruthy();

  await page.click('[data-testid="tab-transactions"]');
  await page.fill("#restructurePlayerId", playerId);
  await page.click("#restructureBtn");
  await waitGameReady(page);

  await page.selectOption("#tradeTeamA", "BUF");
  await page.selectOption("#tradeTeamB", "MIA");
  await page.click("#tradeBtn");
  await waitGameReady(page);

  await page.click('[data-testid="tab-calendar"]');
  await page.click("#loadCalendarBtn");
  await waitGameReady(page);
  await expect(page.locator("#calendarWeeksTable tr").nth(1)).toBeVisible();

  await page.click('[data-testid="tab-log"]');
  await page.selectOption("#txTypeFilter", "restructure");
  await page.click("#loadTxBtn");
  await waitGameReady(page);
  await expect(page.locator("#txTable tr").nth(1)).toBeVisible();
  await expect(page.locator("#txTable tr:nth-child(2) td:last-child")).not.toContainText("{");

  await page.selectOption("#txTypeFilter", "trade");
  await page.click("#loadTxBtn");
  await waitGameReady(page);
  await expect(page.locator("#txTable tr").nth(1)).toBeVisible();
});

test("scouting lock persists across save and load", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-draft"]');
  await page.click("#prepareDraftBtn");
  await waitGameReady(page);
  await page.click("#loadScoutingBtn");
  await waitGameReady(page);

  const idsToLock = [];
  for (let i = 2; i <= 4; i += 1) {
    const id = (await page.locator(`#scoutingTable tr:nth-child(${i}) td:nth-child(1)`).textContent())?.trim();
    if (id) idsToLock.push(id);
  }
  expect(idsToLock.length).toBeGreaterThan(0);
  await page.fill("#lockBoardIdsInput", idsToLock.join(","));
  await page.click("#lockBoardBtn");
  await waitGameReady(page);
  await expect(page.locator("#scoutingLockText")).toContainText("Locked");

  await page.click('[data-testid="tab-settings"]');
  const slot = `pw-lock-${Date.now()}`;
  await page.fill("#saveSlotInput", slot);
  await page.click("#saveBtn");
  await waitGameReady(page);

  await page.click("#backSetupBtn");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await waitSetupReady(page);
  await page.click("#refreshSavesBtn");
  await page.locator("#savesTable button[data-resume]").first().click();

  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 25_000 });
  await waitGameReady(page);
  await page.click('[data-testid="tab-draft"]');
  await page.click("#loadScoutingBtn");
  await waitGameReady(page);
  await expect(page.locator("#scoutingLockText")).toContainText("Locked");

  const firstBoardId = await firstTableCell(page, "#scoutingTable", 1);
  expect(firstBoardId).toBeTruthy();
  expect(idsToLock).toContain(firstBoardId);
});
