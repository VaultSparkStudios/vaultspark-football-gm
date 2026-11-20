import { test, expect } from "@playwright/test";
import { isoWeek } from "../public/lib/weeklyChallenge.js";
import { summarizeChallengeBoard, weeklyObjective } from "../public/lib/weeklyChallengeScoreContract.js";

const CONSENT_KEY = "fa:community-participation:v1";
const PARTICIPANT_KEY = "fa:community-participant:v1";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };

/**
 * The community service is replaced by a fixture: no request leaves the test
 * machine. `board(week)` decides what the shared board says.
 */
async function communityFixture(page, board) {
  const requests = [];
  await page.route("**/community/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const path = url.pathname.split("/community/v1/")[1];
    const body = request.method() === "GET" ? null : request.postDataJSON();
    requests.push({ method: request.method(), path, search: url.search, body });
    const json = (status, payload) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(payload) });
    if (path === "capability") return json(201, { ok: true, capability: "fixture-challenge-capability", expiresAt: new Date(Date.now() + 600_000).toISOString(), remainingUses: 16 });
    if (path === "challenge/score") return json(202, { ok: true, accepted: 1, best: body.entry.score });
    if (path === "challenge/board") return json(200, board(url.searchParams.get("week")));
    return json(202, { ok: true, accepted: 0, duplicates: 0 });
  });
  return requests;
}

async function startWeeklyLeague(page, { sharing }) {
  if (sharing) {
    await page.addInitScript(([consentKey, participantKey]) => {
      localStorage.setItem(consentKey, "participating");
      if (!localStorage.getItem(participantKey)) localStorage.setItem(participantKey, "fixture-browser-0123456789abcdef");
    }, [CONSENT_KEY, PARTICIPANT_KEY]);
  }
  await page.goto("/");
  await expect(page.locator("#weeklyChallengeText")).toContainText(/Week \d+: take over the /);
  await page.locator("#weeklyChallengeBtn").click();
  await expect(page.locator("#setupStatus")).toContainText(/Week \d+ challenge loaded/);
  await page.click("#createLeagueBtn");
  await expect(page).toHaveURL(/\/game\.html$/, { timeout: 90_000 });
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  const decline = page.locator("#firstDebriefDecline");
  if (await decline.isVisible({ timeout: 2_000 }).catch(() => false)) await decline.click();
  const skip = page.locator("#tutSkipBtn");
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  }
  await page.click('[data-testid="tab-settings"]');
}

/**
 * The test server holds one league that both browsers look at, so the first
 * season is played once, on the server in one request (the game's own client
 * advances week by week and stops for every decision).
 */
async function playFirstSeason(page) {
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/advance-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 1 }) });
    return response.status;
  });
  expect(status).toBe(200);
}

/** Load the finished season the way a returning player would, then let the panel look again. */
async function showFinishedSeason(page) {
  await page.reload();
  await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
  // A returning player may be met by a welcome-back note; the panel is reached without clicking through it.
  await page.evaluate(async () => {
    await (await import("./lib/gameFlow.js")).activateTab("settingsTab");
    await (await import("./lib/weeklyChallengePanel.js")).syncWeeklyChallenge();
  });
}

test("the weekly league states its goal, scores the first season the same in two browsers, and only a sharing browser posts", async ({ browser }) => {
  test.setTimeout(420_000);
  const week = isoWeek(new Date());
  const objective = weeklyObjective(week.key);
  const sharingContext = await browser.newContext();
  const privateContext = await browser.newContext();
  try {
    const sharingPage = await sharingContext.newPage();
    const privatePage = await privateContext.newPage();
    // Twelve other GMs, all on the lowest score the goal allows, so any result beats them.
    let board = (weekKey) => summarizeChallengeBoard(weekKey, Array(12).fill(objective.min));
    const sharingRequests = await communityFixture(sharingPage, (weekKey) => board(weekKey));
    const privateRequests = await communityFixture(privatePage, (weekKey) => board(weekKey));

    await startWeeklyLeague(sharingPage, { sharing: true });
    await startWeeklyLeague(privatePage, { sharing: false });

    for (const page of [sharingPage, privatePage]) {
      const panel = page.getByTestId("weekly-challenge-score");
      await expect(panel.getByTestId("weekly-challenge-goal")).toContainText(`Week ${week.week} goal:`);
      await expect(panel.getByTestId("weekly-challenge-goal")).toContainText(objective.goal);
      await expect(panel.getByTestId("weekly-challenge-state")).toContainText("Your score is counted when this first season ends.");
      await expect(panel.getByTestId("weekly-challenge-share-text")).toHaveCount(0);
    }
    expect(sharingRequests.filter((request) => request.path.startsWith("challenge/"))).toEqual([]);

    await playFirstSeason(sharingPage);
    await showFinishedSeason(sharingPage);
    await showFinishedSeason(privatePage);

    const sharingPanel = sharingPage.getByTestId("weekly-challenge-score");
    const privatePanel = privatePage.getByTestId("weekly-challenge-score");
    await expect(sharingPanel.getByTestId("weekly-challenge-result")).toContainText("Your score:");
    await expect(privatePanel.getByTestId("weekly-challenge-result")).toContainText("Your score:");
    const scoreLine = async (panel) => (await panel.getByTestId("weekly-challenge-share-text").inputValue()).split("\n").find((line) => line.startsWith("My score: "));
    const sharedScore = await scoreLine(sharingPanel);
    expect(sharedScore).toBeTruthy();
    expect(await scoreLine(privatePanel), "same league, same results, same score").toBe(sharedScore);

    // The sharing browser: one post, carrying the week, the goal and the score and nothing else.
    await expect(sharingPanel.getByTestId("weekly-challenge-board")).toContainText(/You beat \d+% of GMs this week\. 12 GMs have posted a score/);
    const posts = sharingRequests.filter((request) => request.path === "challenge/score");
    expect(posts).toHaveLength(1);
    expect(Object.keys(posts[0].body).sort()).toEqual(["capability", "entry", "participantId", "schemaVersion"]);
    expect(Object.keys(posts[0].body.entry).sort()).toEqual(["objective", "score", "week"]);
    expect(posts[0].body.entry.week).toBe(week.key);
    expect(posts[0].body.entry.objective).toBe(objective.id);
    expect(Number.isInteger(posts[0].body.entry.score)).toBe(true);
    const reads = sharingRequests.filter((request) => request.path === "challenge/board");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((request) => request.search === `?week=${week.key}` && request.body === null)).toBe(true);

    // The share text states the result and the link, and names nobody.
    const shareText = await sharingPanel.getByTestId("weekly-challenge-share-text").inputValue();
    const lines = shareText.split("\n");
    expect(lines[0]).toBe(`Franchise Architect: Football — Week ${week.week} Challenge`);
    expect(lines[1]).toBe(`Goal: ${objective.goal}`);
    expect(lines[2]).toBe(sharedScore);
    expect([...lines[3]]).toHaveLength(5);
    expect(lines[4]).toMatch(/^Beat \d+% of GMs$/);
    expect(lines[5]).toMatch(/^Same league, same club: http.*\?challenge=VSFC1\./);
    expect(lines).toHaveLength(6);

    // Copying works, and when the browser refuses the text is selected instead.
    await sharingPage.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { globalThis.__copiedChallengeText = text; } } });
    });
    await sharingPanel.getByTestId("weekly-challenge-copy-btn").dispatchEvent("click");
    await expect(sharingPanel.locator("#weeklyChallengeShareStatus")).toContainText("Copied.");
    expect(await sharingPage.evaluate(() => globalThis.__copiedChallengeText)).toBe(shareText);
    await sharingPage.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("refused"); } } });
    });
    await sharingPanel.getByTestId("weekly-challenge-copy-btn").dispatchEvent("click");
    await expect(sharingPanel.locator("#weeklyChallengeShareStatus")).toContainText("Could not copy for you. The text is selected");
    await expect(sharingPanel.getByTestId("weekly-challenge-share-text")).toBeFocused();

    // The private browser: a score and a share text on screen, and nothing sent anywhere.
    await expect(privatePanel.getByTestId("weekly-challenge-board")).toContainText("Turn on Community Stats in Settings");
    await expect(privatePanel.getByTestId("weekly-challenge-board")).toContainText("Nothing is sent while it is off.");
    expect((await privatePanel.getByTestId("weekly-challenge-share-text").inputValue()).split("\n")).toHaveLength(5);
    // Reading the public stats snapshot is an anonymous read that predates the board; nothing is posted and the board is never contacted.
    expect(privateRequests.filter((request) => request.method !== "GET" || request.path.startsWith("challenge/"))).toEqual([]);

    // Below five browsers the board gives no figures and the game says so.
    board = (weekKey) => summarizeChallengeBoard(weekKey, Array(4).fill(objective.min));
    await sharingPage.evaluate(async () => (await import("./lib/weeklyChallengePanel.js")).syncWeeklyChallenge());
    await expect(sharingPanel.getByTestId("weekly-challenge-board")).toContainText("Not enough scores yet.");
    expect(sharingRequests.filter((request) => request.path === "challenge/score")).toHaveLength(1);
    expect((await sharingPanel.getByTestId("weekly-challenge-share-text").inputValue()).split("\n")).toHaveLength(5);
  } finally {
    await sharingContext.close();
    await privateContext.close();
  }
});
