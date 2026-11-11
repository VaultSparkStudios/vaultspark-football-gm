/**
 * weeklyChallenge.js — one shared league per calendar week, and challenge links.
 *
 * Everyone who opens the game in the same ISO week gets the same league: the
 * seed and the club are derived from the week alone, so two browsers that have
 * never talked agree without a server. The week's league travels as an ordinary
 * challenge code (challengeCodes.js), so a friend's link and the weekly link
 * start a league the same way.
 *
 * Links:  ?challenge=weekly      this week's league, whatever week it is opened
 *         ?challenge=<VSFC1 code> one exact league (a friend's run)
 *
 * Pure functions; nothing here reads the clock unless the caller passes no date.
 */
import { decodeChallengeCode, encodeChallengeCode, fnv1a } from "./challengeCodes.js";

export const WEEKLY_CHALLENGE_PARAM = "challenge";
export const WEEKLY_CHALLENGE_VALUE = "weekly";
const TEAM_ID_RE = /^[A-Z0-9_-]{1,5}$/;
// Seeds stay well inside the range every league generator accepts.
const SEED_SPACE = 2_000_000_000;

/** ISO-8601 week of a date, read in UTC so every time zone agrees on the week. */
export function isoWeek(date = new Date()) {
  const time = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(time)) return null;
  const day = new Date(time);
  const utc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  // Thursday of this week decides which year the week belongs to.
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const year = utc.getUTCFullYear();
  const week = Math.ceil(((utc - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return { year, week, key: `${year}-W${String(week).padStart(2, "0")}` };
}

/** The league seed for a week key such as "2026-W46". */
export function weeklySeed(weekKey) {
  return fnv1a(`vsfa-weekly-seed:${weekKey}`) % SEED_SPACE;
}

/**
 * This week's challenge. `teamIds` are the clubs the player could pick; the
 * pick is made from them sorted, so the order a browser lists them in never
 * changes the club.
 */
export function weeklyChallenge(teamIds = [], date = new Date()) {
  const week = isoWeek(date);
  if (!week) return null;
  const ids = [...new Set((teamIds || []).map((id) => String(id || "").toUpperCase()))]
    .filter((id) => TEAM_ID_RE.test(id))
    .sort();
  if (!ids.length) return null;
  const seed = weeklySeed(week.key);
  const teamId = ids[fnv1a(`vsfa-weekly-club:${week.key}`) % ids.length];
  const startYear = week.year;
  const code = encodeChallengeCode({ seed, startYear, teamId });
  if (!code) return null;
  return { ...week, seed, startYear, teamId, code };
}

/** Which week's challenge a league is, if it is one (this week or the last four). */
export function weeklyChallengeWeekForSeed(seed, date = new Date()) {
  const numeric = Number(seed);
  if (!Number.isSafeInteger(numeric)) return null;
  const now = date instanceof Date ? date.getTime() : Number(date);
  for (let back = 0; back <= 4; back += 1) {
    const week = isoWeek(now - back * 7 * 86_400_000);
    if (week && weeklySeed(week.key) === numeric) return week;
  }
  return null;
}

/** A link that starts a league from a challenge code, or this week's league. */
export function challengeLink(codeOrWeekly, base) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(WEEKLY_CHALLENGE_PARAM, codeOrWeekly);
  return url.toString();
}

/**
 * What a URL query asks for: { weekly: true }, { code } or null. A malformed
 * code is reported as { invalid: true } so the page can say so instead of
 * silently ignoring the link someone sent.
 */
export function challengeFromSearch(search = "") {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const raw = params.get(WEEKLY_CHALLENGE_PARAM);
  if (raw == null || raw === "") return null;
  if (raw.trim().toLowerCase() === WEEKLY_CHALLENGE_VALUE) return { weekly: true };
  const decoded = decodeChallengeCode(raw);
  return decoded ? { code: raw.trim(), decoded } : { invalid: true };
}

/** Read a pasted code or a pasted challenge link. */
export function decodeChallengeInput(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const direct = decodeChallengeCode(text);
  if (direct) return direct;
  try {
    const url = new URL(text);
    const parsed = challengeFromSearch(url.search);
    return parsed?.decoded || null;
  } catch {
    return null;
  }
}
