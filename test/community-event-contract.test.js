import test from "node:test";
import assert from "node:assert/strict";
import { extractCommunityEvents } from "../src/community/extractCommunityEvents.js";
import { normalizeCommunityEvent } from "../src/community/eventContract.js";
import { applyEventsToLocalLedger, emptyLocalCommunityLedger } from "../public/lib/communityTelemetry.js";

const now = () => "2026-08-08T12:00:00.000Z";
let sequence = 0;
const idFactory = () => `event_contract_${String(++sequence).padStart(4, "0")}`;

test("league starts produce one allowlisted receipt without names, save data or player ids", () => {
  const events = extractCommunityEvents({
    method: "POST", path: "/api/new-league", runtime: "client", now, idFactory,
    body: { mode: "play", controlledTeamId: "BUF", eraProfile: "modern-pass", franchiseArchetype: "rebuild", difficultyPreset: "architect", ownerName: "Private Founder", save: { players: [1, 2, 3] } },
    response: { ok: true, state: { controlledTeamId: "BUF", settings: {} } }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "league_started");
  assert.equal(events[0].dimensions.team, "buf");
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /Private Founder|players|ownerName|save/i);
});

test("weekly receipts derive bounded outcomes and rare feats from contract authority", () => {
  const events = extractCommunityEvents({
    method: "POST", path: "/api/advance-week", runtime: "server", now, idFactory,
    body: { count: 4, gmDecisionChoice: { decisionId: "owner-pressure", choiceId: "hold-course", note: "never transmit" } },
    response: {
      ok: true,
      commandReceipt: { count: 4, tactic: "aggressive-pass", gmDecisionApplied: true, started: { year: 2026, phase: "regular-season" }, completed: { year: 2027, phase: "offseason" } },
      architectEntry: { teamBefore: { wins: 13, losses: 0, ties: 0 }, teamAfter: { wins: 17, losses: 0, ties: 0 } },
      state: { controlledTeamId: "BUF", champions: [{ year: 2026, championTeamId: "BUF" }], settings: { difficultyPreset: "architect" } }
    }
  });
  assert.equal(events[0].type, "weeks_managed");
  assert.deepEqual(events[0].metrics, { weeks: 4, wins: 4, losses: 0, ties: 0, seasonsCompleted: 1, playoffBerths: 1, championships: 1 });
  assert.equal(events[0].dimensions.decision, "hold-course");
  assert.equal(events[0].evidenceTier, "server-runtime");
  assert.equal(events[1].dimensions.feat, "championship");
  assert.equal(events[2].dimensions.feat, "undefeated-season");
  assert.doesNotMatch(JSON.stringify(events), /never transmit/);
});

test("event normalization rejects unknown types, bad ids, unbounded timestamps and strips unknown fields", () => {
  assert.equal(normalizeCommunityEvent({ eventId: "valid_event_123", type: "unknown", occurredAt: now() }, { now: Date.parse(now()) }), null);
  assert.equal(normalizeCommunityEvent({ eventId: "short", type: "rare_feat", occurredAt: now() }, { now: Date.parse(now()) }), null);
  const normalized = normalizeCommunityEvent({ eventId: "valid_event_123", type: "rare_feat", occurredAt: now(), dimensions: { feat: "championship", playerName: "Secret" }, metrics: { count: 999, salary: 999999999 } }, { now: Date.parse(now()) });
  assert.deepEqual(normalized.dimensions, { feat: "championship" });
  assert.deepEqual(normalized.metrics, { count: 20 });
});

test("local comparison ledger remains useful even when network participation is off", () => {
  const events = extractCommunityEvents({ method: "POST", path: "/api/draft/user-pick", runtime: "client", now, idFactory, body: { playerId: "private-player-id" }, response: { ok: true, pick: { round: 1, overallPick: 12, player: { position: "QB", name: "Private Name", overall: 78, potential: 91 } }, state: {} } });
  const ledger = applyEventsToLocalLedger(emptyLocalCommunityLedger(), events, now());
  assert.equal(ledger.totals.draftPicks, 1);
  assert.equal(ledger.choices.positions.qb, 1);
  assert.doesNotMatch(JSON.stringify(ledger), /Private Name|private-player-id/);
});
