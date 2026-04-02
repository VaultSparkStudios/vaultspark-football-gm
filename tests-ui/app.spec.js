import { test, expect } from "@playwright/test";

function parseWeek(text) {
  const match = String(text || "").match(/W(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function waitSetupReady(page) {
  await expect(page.locator("#setupStatus")).toContainText("Ready", { timeout: 20_000 });
}

async function waitGameReady(page, timeout = 60_000) {
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout });
}

async function createLeagueFromSetup(page, { runtimeMode = null } = {}) {
  await page.goto("/");
  await waitSetupReady(page);
  if (runtimeMode) {
    await page.selectOption("#runtimeModeSelect", runtimeMode);
    await waitSetupReady(page);
    await expect(page.locator("#runtimeModeSelect")).toHaveValue(runtimeMode);
  }
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 45_000 });
  await waitGameReady(page);
}

async function simulateSeasonsByApi(page, count) {
  return page.evaluate(async (seasonCount) => {
    const response = await fetch("/api/advance-season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: seasonCount })
    });
    return response.json();
  }, count);
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
  await expect(page.locator("#tradeAIds")).toHaveCount(0);
  await page.selectOption("#tradeTeamA", "BUF");
  await waitGameReady(page);
  await page.selectOption("#tradeTeamB", "MIA");
  await waitGameReady(page);
  await page.locator('#tradeTeamARosterTable button[data-trade-player-id]').first().click();
  await page.locator('#tradeTeamBRosterTable button[data-trade-player-id]').first().click();
  await expect(page.locator("#tradeSelectedAText")).not.toContainText("None");
  await expect(page.locator("#tradeSelectedBText")).not.toContainText("None");
  await page.click("#evaluateTradeBtn");
  await waitGameReady(page);
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

test("compare and player history flows use search-driven selection", async ({ page }) => {
  await createLeagueFromSetup(page);

  await page.click('[data-testid="tab-roster"]');
  await page.click("#loadRosterBtn");
  await waitGameReady(page);
  const rosterPlayers = page.locator('#rosterTable button[data-player-id]');
  await expect(rosterPlayers.first()).toBeVisible();
  const firstPlayer = (await rosterPlayers.nth(0).textContent())?.trim() || "";
  const secondPlayer = (await rosterPlayers.nth(1).textContent())?.trim() || firstPlayer;
  expect(firstPlayer).toBeTruthy();

  await page.click('[data-testid="tab-stats"]');

  await expect(page.locator("#comparePlayerIdsInput")).toHaveCount(0);
  await page.fill("#comparePlayerSearchInput", firstPlayer);
  await page.click("#searchComparePlayersBtn");
  await waitGameReady(page);
  await page.locator('#comparePlayerSearchTable button[data-compare-player-toggle]').first().click();

  await page.fill("#comparePlayerSearchInput", secondPlayer);
  await page.click("#searchComparePlayersBtn");
  await waitGameReady(page);
  await page.locator('#comparePlayerSearchTable button[data-compare-player-toggle]').first().click();

  await page.click("#comparePlayersBtn");
  await waitGameReady(page);
  await expect(page.locator("#comparePlayersTable tr").nth(1)).toBeVisible();

  await page.click('[data-testid="tab-history"]');
  await page.click('[data-history-view="hall-of-fame"]');
  await expect(page.locator("#playerTimelineId")).toHaveCount(0);
  await page.fill("#playerTimelineSearchInput", firstPlayer);
  await page.click("#searchPlayerTimelineBtn");
  await waitGameReady(page);
  await page.locator('#playerTimelineSearchTable button[data-history-player-select]').first().click();
  await expect(page.locator("#playerTimelineSelectedPlayerText")).not.toContainText("Selected: None");
  await page.click("#loadPlayerTimelineBtn");
  await waitGameReady(page);
  await expect(page.locator("#playerTimelineTable")).toContainText(/No data|No rows|year/i);
});

test("season awards and hall of fame history render for a populated multi-year league", async ({ page }) => {
  test.setTimeout(240_000);

  await createLeagueFromSetup(page, { runtimeMode: "server" });
  const seeded = await simulateSeasonsByApi(page, 2);
  const dashboard = seeded?.state || {};
  expect(dashboard.currentYear).toBeGreaterThanOrEqual(2028);
  expect((dashboard.awards || []).length).toBeGreaterThanOrEqual(2);
  expect((dashboard.hallOfFame || []).length).toBeGreaterThan(0);
  const controlledTeamId = dashboard.controlledTeamId || "OS";
  const rosterPayload = await page.evaluate(async (teamId) => {
    const response = await fetch(`/api/roster?team=${encodeURIComponent(teamId)}`);
    return response.json();
  }, controlledTeamId);
  const retirementCandidate =
    (rosterPayload.roster || []).find((player) => Number.isFinite(player.jerseyNumber)) || rosterPayload.roster?.[0] || null;
  expect(retirementCandidate?.id).toBeTruthy();
  expect(retirementCandidate?.name).toBeTruthy();
  await page.reload();
  await waitGameReady(page);
  await page.click('[data-testid="tab-settings"]');
  await page.uncheck("#settingRetiredNumberRequireRetiredPlayer");
  await page.uncheck("#settingRetiredNumberRequireHallOfFame");
  await page.click("#saveSettingsBtn");
  await waitGameReady(page, 45_000);
  await page.click('[data-testid="tab-history"]');

  expect(await page.locator("#historyAwardYearSelect option").count()).toBeGreaterThanOrEqual((dashboard.awards || []).length);
  await expect(page.locator("#seasonAwardsSpotlight")).toContainText("Awards Class");
  await expect(page.locator("#awardWinnerGallery .history-card").first()).toBeVisible();
  await expect(page.locator("#allPro1Gallery .history-card").first()).toBeVisible();

  await page.click('[data-history-view="hall-of-fame"]');
  await expect(page.locator("#hallOfFameGallery .history-card").first()).toBeVisible();

  await page.fill("#playerTimelineSearchInput", retirementCandidate.name);
  await page.click("#searchPlayerTimelineBtn");
  await waitGameReady(page);
  const candidateSelect = page.locator(`[data-history-player-select="${retirementCandidate.id}"]`);
  if (await candidateSelect.count()) {
    await candidateSelect.first().click();
  } else {
    await page.locator("#playerTimelineSearchTable [data-history-player-select]").first().click();
  }
  await expect(page.locator("#playerTimelineSelectedPlayerText")).toContainText(retirementCandidate.name);

  await page.click("#loadPlayerTimelineBtn");
  await waitGameReady(page);
  await expect(page.locator("#playerTimelineGallery .history-card").first()).toBeVisible();
  await expect(page.locator("#playerTimelineTable tr").nth(1)).toBeVisible();

  await page.evaluate((teamId) => {
    const select = document.getElementById("teamHistorySelect");
    if (!select) throw new Error("teamHistorySelect not found");
    select.value = teamId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, controlledTeamId);
  await page.click("#loadTeamHistoryBtn");
  await waitGameReady(page);
  await expect(page.locator("#teamHistorySpotlight")).toBeVisible();

  await page.click("#retireSelectedJerseyBtn");
  await waitGameReady(page, 60_000);
  await expect(page.locator("#retiredNumbersGallery")).toContainText(retirementCandidate.name);
  if (Number.isFinite(retirementCandidate.jerseyNumber)) {
    await expect(page.locator("#retiredNumbersGallery")).toContainText(`#${retirementCandidate.jerseyNumber}`);
  }
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
