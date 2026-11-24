import test from "node:test";
import assert from "node:assert/strict";
import { GM_LEGACY_LEDGER_KEY, gmLegacyMarkup, readGmLegacyLedger, recordFranchiseCareer, summarizeGmLegacy } from "../public/lib/gmLegacyLedger.js";

function memoryStorage() {
  const items = new Map();
  return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), items };
}
const dash = (team, start, extra = {}) => ({ franchiseId: `f-${team}-${start}`, controlledTeamId: team, controlledTeam: { name: `${team} Club` }, startYear: start, ...extra });
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const card = (label, value) => `<div>${label}:${value}</div>`;

test("each franchise keeps one row and the legacy adds them up", () => {
  const storage = memoryStorage();
  recordFranchiseCareer({ dashboard: dash("BUF", 2026), career: { seasons: 3, record: "30-21", playoffBerths: 2, titles: 1 }, storage });
  recordFranchiseCareer({ dashboard: dash("CHI", 2030), career: { seasons: 2, record: "20-14", playoffBerths: 1, titles: 0 }, storage });
  const summary = summarizeGmLegacy(readGmLegacyLedger(storage));
  assert.deepEqual({ ...summary, best: summary.best.team }, { franchises: 2, seasons: 5, wins: 50, losses: 35, ties: 0, playoffs: 3, titles: 1, best: "BUF Club" });
  assert.match(gmLegacyMarkup(summary, { escapeHtml, card }), /Titles:1/);
});

test("a row only moves forward, so a rewind never erases a title already won", () => {
  const storage = memoryStorage();
  recordFranchiseCareer({ dashboard: dash("BUF", 2026), career: { seasons: 4, record: "40-28", titles: 1 }, storage });
  recordFranchiseCareer({ dashboard: dash("BUF", 2026), career: { seasons: 2, record: "18-16", titles: 0 }, storage });
  const row = Object.values(readGmLegacyLedger(storage).franchises)[0];
  assert.equal(row.titles, 1);
  assert.equal(row.seasons, 4);
});

test("one franchise shows an invitation, a damaged or blocked store never throws", () => {
  const storage = memoryStorage();
  recordFranchiseCareer({ dashboard: dash("BUF", 2026), career: { seasons: 1, record: "9-8" }, storage });
  assert.match(gmLegacyMarkup(summarizeGmLegacy(readGmLegacyLedger(storage)), { escapeHtml, card }), /Start another franchise/);
  storage.items.set(GM_LEGACY_LEDGER_KEY, "{not json");
  assert.deepEqual(readGmLegacyLedger(storage).franchises, {});
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.ok(recordFranchiseCareer({ dashboard: dash("BUF", 2026), career: { seasons: 1, record: "9-8" }, storage: blocked }));
});
