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

  const teamOptions = await page.locator("#teamSelect option").evaluateAll((options) =>
    options
      .map((option) => option.textContent?.split(" - ")[0]?.trim())
      .filter(Boolean)
  );
  const scheduleAway = ((await page.locator("#scheduleTable tr:nth-child(2) td:nth-child(1)").textContent()) || "").trim();
  const scheduleHome = ((await page.locator("#scheduleTable tr:nth-child(2) td:nth-child(2)").textContent()) || "").trim();
  expect(teamOptions).toContain(scheduleAway);
  expect(teamOptions).toContain(scheduleHome);

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

test("depth chart controls and game guide modal are operational", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-depth"]');
  await page.click("#loadDepthBtn");
  await waitGameReady(page);

  const firstPlayer = (await page.locator("#depthTable tr:nth-child(2) td:nth-child(3)").textContent())?.trim();
  const secondPlayer = (await page.locator("#depthTable tr:nth-child(3) td:nth-child(3)").textContent())?.trim();
  expect(firstPlayer).toBeTruthy();
  expect(secondPlayer).toBeTruthy();

  await page.locator('#depthTable button[data-depth-move="down"]').first().click();
  await expect(page.locator("#depthTable tr:nth-child(2) td:nth-child(3)")).toContainText(secondPlayer || "");

  const firstShareInput = page.locator('#depthTable input[data-depth-share-input]').first();
  await firstShareInput.fill("85");
  await page.click("#saveDepthBtn");
  await waitGameReady(page);
  await page.click("#loadDepthBtn");
  await waitGameReady(page);
  await expect(page.locator('#depthTable input[data-depth-share-input]').first()).toHaveValue("85");

  await page.click("#openGuideBtn");
  await expect(page.locator("#guideModal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#guideModalContent")).toContainText("League Setup");
  await page.click("#closeGuideModalBtn");
  await expect(page.locator("#guideModal")).toHaveClass(/hidden/);
});

test("designation and retirement override flows use table selection", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-roster"]');
  await page.click("#loadRosterBtn");
  await waitGameReady(page);

  await expect(page.locator("#designationPlayerId")).toHaveCount(0);
  const designationSelect = page.locator('#rosterTable tr:has(button[data-act="ps"]) button[data-designation-select]').first();
  const selectedPlayerId = await designationSelect.getAttribute("data-designation-select");
  expect(selectedPlayerId).toBeTruthy();
  await designationSelect.click();
  await expect(page.locator("#designationSelectedPlayerText")).not.toContainText("Selected: None");

  await page.click("#applyDesignationBtn");
  await waitGameReady(page);
  await expect(page.locator(`#rosterTable tr:has(button[data-player-id="${selectedPlayerId}"])`)).toContainText("gameDayInactive");

  await page.click("#clearDesignationBtn");
  await waitGameReady(page);
  await expect(page.locator(`#rosterTable tr:has(button[data-player-id="${selectedPlayerId}"])`)).not.toContainText("gameDayInactive");

  await page.click('[data-testid="tab-transactions"]');
  await page.click("#loadRetiredBtn");
  await waitGameReady(page);

  await expect(page.locator("#retirementOverridePlayerId")).toHaveCount(0);
  const retiredSelect = page.locator('#retiredTable button[data-retired-override-id]');
  if (await retiredSelect.count()) {
    await retiredSelect.first().click();
    await expect(page.locator("#retirementOverrideSelectedPlayerText")).not.toContainText("Selected: None");
    await expect(page.locator("#retirementOverrideBtn")).toBeEnabled();
  } else {
    await expect(page.locator("#retirementOverrideSelectedPlayerText")).toContainText("Selected: None");
    await expect(page.locator("#retirementOverrideBtn")).toBeDisabled();
  }
});

test("contracts, trade, calendar, and transaction log are operational", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-contracts"]');
  await page.click("#loadContractsBtn");
  await waitGameReady(page);
  const selectButtons = page.locator('#contractsRosterTable button[data-contract-select]');
  await expect(selectButtons.first()).toBeVisible();
  await selectButtons.first().click();
  await page.click("#contractsRestructureBtn");
  await waitGameReady(page);
  await expect(page.locator("#contractActionText")).toContainText("restructured");

  await page.click('[data-testid="tab-transactions"]');
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
  await page.click('[data-testid="tab-scouting"]');
  await page.click("#loadScoutingBtn");
  await waitGameReady(page);

  const idsToLock = [];
  const addButtons = page.locator('#scoutingTable button[data-board-toggle="add"]');
  const addCount = await addButtons.count();
  for (let i = 0; i < Math.min(3, addCount); i += 1) {
    const id = await addButtons.nth(i).getAttribute("data-player-id");
    if (id) idsToLock.push(id);
  }
  expect(idsToLock.length).toBeGreaterThan(0);

  for (const playerId of idsToLock) {
    await page.locator(`#scoutingTable button[data-board-toggle="add"][data-player-id="${playerId}"]`).click();
  }
  await expect(page.locator("#scoutingBoardText")).toContainText(`Board: ${idsToLock.length} / 20`);
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
  await page.click('[data-testid="tab-scouting"]');
  await page.click("#loadScoutingBtn");
  await waitGameReady(page);
  await expect(page.locator("#scoutingLockText")).toContainText("Locked");
  await expect(page.locator("#scoutingBoardText")).toContainText(`Board: ${idsToLock.length} / 20`);
});

test("switching runtime mode reloads setup state", async ({ page }) => {
  await createLeagueFromSetup(page);

  const slot = `runtime-switch-${Date.now()}`;
  await page.click('[data-testid="tab-settings"]');
  await page.fill("#saveSlotInput", slot);
  await page.click("#saveBtn");
  await waitGameReady(page);

  await page.click("#backSetupBtn");
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await waitSetupReady(page);
  await expect(page.locator("#savesTable")).toContainText(slot, { timeout: 20_000 });

  await page.selectOption("#runtimeModeSelect", "client");
  await waitSetupReady(page);
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("client");
  await expect(page.locator("#pfrPathInput")).toBeDisabled();
  await expect(page.locator("#profilePathInput")).toBeDisabled();
  await expect(page.locator("#savesTable")).not.toContainText(slot);
  await expect(page.locator("#resumeLatestBtn")).toBeDisabled();

  await page.selectOption("#runtimeModeSelect", "server");
  await waitSetupReady(page);
  await expect(page.locator("#runtimeModeSelect")).toHaveValue("server");
  await expect(page.locator("#savesTable")).toContainText(slot, { timeout: 20_000 });
  await expect(page.locator("#resumeLatestBtn")).toBeEnabled();
});
