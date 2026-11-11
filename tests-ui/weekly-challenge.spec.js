import { test, expect } from "@playwright/test";
import { encodeChallengeCode } from "../public/lib/challengeCodes.js";

async function weeklyLeague(page) {
  await page.goto("/");
  await expect(page.locator("#weeklyChallengeText")).toContainText(/Week \d+: take over the /);
  await page.locator("#weeklyChallengeBtn").click();
  await expect(page.locator("#setupStatus")).toContainText(/Week \d+ challenge loaded/);
  return {
    seed: await page.locator("#seedInput").inputValue(),
    startYear: await page.locator("#startYearInput").inputValue(),
    teamId: await page.locator("#teamSelect").inputValue()
  };
}

test("two separate browsers get the same weekly league", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const a = await weeklyLeague(await first.newPage());
    const b = await weeklyLeague(await second.newPage());
    expect(a.seed).toMatch(/^\d+$/);
    expect(a.teamId).not.toBe("__random__");
    expect(b).toEqual(a);
  } finally {
    await first.close();
    await second.close();
  }
});

test("a weekly link sets up this week's league on arrival", async ({ page, browser }) => {
  const reference = await browser.newContext();
  let expected;
  try {
    expected = await weeklyLeague(await reference.newPage());
  } finally {
    await reference.close();
  }
  await page.goto("/?challenge=weekly");
  await expect(page.locator("#setupStatus")).toContainText(/Week \d+ challenge loaded/);
  await expect(page.locator("#seedInput")).toHaveValue(expected.seed);
  await expect(page.locator("#teamSelect")).toHaveValue(expected.teamId);
});

test("a friend's challenge link fills in that exact league, and a damaged one says so", async ({ page }) => {
  const code = encodeChallengeCode({ seed: 424242, startYear: 2031, teamId: "KC", rivalSeasons: 4, rivalName: "Sam" });
  await page.goto(`/?challenge=${encodeURIComponent(code)}`);
  await expect(page.locator("#setupStatus")).toContainText("beat 4 seasons set by Sam");
  await expect(page.locator("#seedInput")).toHaveValue("424242");
  await expect(page.locator("#startYearInput")).toHaveValue("2031");
  await expect(page.locator("#teamSelect")).toHaveValue("KC");

  await page.goto(`/?challenge=${encodeURIComponent(`${code.slice(0, -1)}x`)}`);
  await expect(page.locator("#setupStatus")).toContainText("That challenge link is damaged");
});

test("pasting a challenge link into the code box works like pasting the code", async ({ page }) => {
  const code = encodeChallengeCode({ seed: 777, startYear: 2028, teamId: "BUF" });
  await page.goto("/");
  await expect(page.locator("#setupStatus")).toContainText("Ready");
  await page.locator("#challengeCodeInput").fill(`https://playfranchisearchitect.com/?challenge=${code}`);
  await page.locator("#applyChallengeCodeBtn").click();
  await expect(page.locator("#setupStatus")).toContainText("Challenge league loaded");
  await expect(page.locator("#seedInput")).toHaveValue("777");
  await expect(page.locator("#teamSelect")).toHaveValue("BUF");
});
