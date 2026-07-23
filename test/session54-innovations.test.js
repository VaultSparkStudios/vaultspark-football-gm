import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { executeAdvanceWeekTransaction } from "../src/runtime/advanceWeekCommand.js";
import { evaluateBriefFreshness } from "../scripts/check-brief-staleness.mjs";
import { architectLedgerRows, buildArchitectureSignal, buildThreeHorizonBlueprint } from "../public/lib/franchiseArchitecture.js";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));

function brief({ closeout = 53, rendered = 54, coherent = true, date = "2026-07-23" } = {}) {
  return [
    `<!-- generated-at: ${date} (Session ${closeout} closeout) -->`,
    `<!-- brief-coherent: ${coherent} -->`,
    `║  Session ${rendered} · 2026-07-23 · FOUNDER MODE  ║`
  ].join("\n");
}

test("startup freshness joins age, closeout authority, rendered session, and coherence", () => {
  const now = new Date("2026-07-23T12:00:00Z");
  const current = evaluateBriefFreshness({ briefText: brief(), status: { currentSession: 53 }, now });
  assert.equal(current.fresh, true);
  assert.deepEqual(current.reasons, []);

  const staleSession = evaluateBriefFreshness({ briefText: brief({ closeout: 52, rendered: 53 }), status: { currentSession: 53 }, now });
  assert.equal(staleSession.fresh, false);
  assert.match(staleSession.reasons.join(" "), /closeout S52/);
  assert.match(staleSession.reasons.join(" "), /rendered session S53/);

  const incoherent = evaluateBriefFreshness({ briefText: brief({ coherent: false }), status: { currentSession: 53 }, now });
  assert.equal(incoherent.fresh, false);
  assert.match(incoherent.reasons.join(" "), /coherence marker/);
});

test("PROJECT_STATUS mutators use the invariant-enforcing shared writer", () => {
  const scripts = ["detect-session-mode.mjs", "verify-plan-mode.mjs", "render-startup-brief.mjs"];
  for (const name of scripts) {
    const source = fs.readFileSync(path.join(root, "scripts", name), "utf8");
    assert.match(source, /updateProjectStatus/);
    assert.doesNotMatch(source, /writeFileSync\((?:STATUS|statusPath)[^)]*PROJECT_STATUS|writeFileSync\((?:STATUS|statusPath),/);
  }
});

test("GameSession delegates exact cap-ledger authority to ContractService", () => {
  const session = createSession({ seed: 5401, startYear: 2026, controlledTeamId: "BUF" });
  const teamId = "BUF";
  session.league.teamCapOverride[teamId] = 250_000_000;
  session.league.capLedger[teamId] = {
    rollover: 5_000_000,
    deadCapCurrentYear: 7_000_000,
    deadCapNextYear: 3_000_000
  };
  const usedCap = session.league.players
    .filter((player) => player.teamId === teamId && player.status === "active")
    .reduce((sum, player) => sum + Number(player.contract?.capHit || 0), 0);
  const summary = session.getTeamCapSummary(teamId);
  assert.equal(session.services.contracts.session, session);
  assert.deepEqual(summary, {
    salaryCap: 255_000_000,
    usedCap,
    deadCap: 7_000_000,
    capSpace: 255_000_000 - usedCap - 7_000_000,
    deadCapNextYear: 3_000_000,
    rolloverNextYearEstimate: 5_000_000
  });
  assert.deepEqual(summary, session.services.contracts.getCapSummary(teamId));
});

test("Architect's Ledger persists only committed weekly intent and observed outcomes", () => {
  const source = createSession({ seed: 5402, startYear: 2026, controlledTeamId: "BUF" });
  const before = JSON.stringify(source.toSnapshot());
  const result = executeAdvanceWeekTransaction(source, { count: 1, weeklyTacticOverride: "run-heavy" });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(source.toSnapshot()), before, "transaction source remains unchanged");
  assert.ok(result.architectEntry);
  assert.equal(result.architectEntry.intent.tactic.id, "run-heavy");
  assert.equal(result.architectEntry.execution.started.week, source.currentWeek);
  assert.match(result.architectEntry.disclaimer, /does not claim/i);

  const committed = result.committedSession;
  const dashboard = committed.getDashboardState();
  assert.equal(dashboard.architectLedger.length, 1);
  assert.equal(dashboard.architectLedger[0].id, result.architectEntry.id);
  assert.ok(dashboard.architectLedger[0].outcome.recordAfter);
  assert.match(dashboard.architectLedger[0].nextAdaptation, /Film/);

  const restored = createSessionFromSnapshot(committed.toSnapshot());
  assert.deepEqual(restored.getDashboardState().architectLedger, dashboard.architectLedger);
});

test("failed weekly transactions cannot append an Architect's Ledger entry", () => {
  const source = createSession({ seed: 5403, startYear: 2026, controlledTeamId: "BUF" });
  const result = executeAdvanceWeekTransaction(source, { count: 2 }, {
    afterAdvance: ({ index }) => {
      if (index === 0) throw new Error("injected ledger rollback");
    }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(source.getDashboardState().architectLedger, []);
});

test("Three-Horizon Blueprint derives Now, Season, and Legacy lanes from live authorities", () => {
  const dashboard = {
    openingContractProgress: {
      status: "active",
      nextAction: "Advance to opening day",
      steps: [{ label: "Declare identity", complete: true }, { label: "Opening day", detail: "Play Week 1", complete: false }]
    }
  };
  const commands = [{
    action: "advance-week",
    title: "Advance to Week 1",
    detail: "The opening decision is resolved.",
    reason: "League state is ready.",
    reasonCode: "advance-authority",
    targetTab: "overviewTab",
    tone: "accent"
  }];
  const gmLegacy = {
    score: 72,
    grade: "B",
    persona: {
      current: { name: "System Builder", description: "Repeatable decisions create durable value." },
      next: { name: "Dynasty Architect", gapToNext: 8 }
    }
  };
  const architectLedger = [{ nextAdaptation: "Review early-down efficiency." }];
  const lanes = buildThreeHorizonBlueprint({ dashboard, commands, gmLegacy, architectLedger });
  assert.deepEqual(lanes.map((lane) => lane.id), ["now", "season", "legacy"]);
  assert.equal(lanes[0].authority, "advance-authority");
  assert.equal(lanes[0].milestone, "Review early-down efficiency.");
  assert.equal(lanes[1].title, "Opening day");
  assert.match(lanes[2].milestone, /8 points remain/);
  assert.equal(buildThreeHorizonBlueprint()[2].title, "Legacy authority loading");
});

test("Architect's Ledger presentation preserves explicit evidence boundaries", () => {
  const rows = architectLedgerRows([{
    id: "ledger-1",
    execution: { started: { year: 2026, week: 1 }, completed: { year: 2026, week: 2 } },
    intent: { tactic: { label: "Run-heavy" } },
    outcome: { result: "Win", score: "24-17", observed: "Rushing identity aligned", aligned: true },
    nextAdaptation: "Review early-down efficiency.",
    disclaimer: "Sequence and alignment only; this does not claim causation."
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].intent, "Run-heavy");
  assert.match(rows[0].outcome, /Win · 24-17/);
  assert.match(rows[0].disclaimer, /does not claim causation/);

  const signal = buildArchitectureSignal([{
    intent: { tactic: { id: "run-heavy", label: "Run-heavy" } },
    outcome: { aligned: true }
  }, {
    intent: { tactic: { id: "run-heavy", label: "Run-heavy" } },
    outcome: { aligned: false }
  }]);
  assert.equal(signal.title, "Run-heavy is the leading declared identity");
  assert.match(signal.detail, /2\/2 declared tactics.*1\/2 film receipts aligned/);
  assert.match(signal.disclaimer, /not evidence.*caused/i);
});

test("Franchise Architecture surface is wired as an accessible source-derived control", () => {
  const html = fs.readFileSync(path.join(root, "public", "game.html"), "utf8");
  const overview = fs.readFileSync(path.join(root, "public", "lib", "tabOverview.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  assert.match(html, /id="franchiseArchitecture"/);
  assert.match(html, /aria-labelledby="franchiseArchitectureTitle"/);
  assert.match(overview, /buildThreeHorizonBlueprint/);
  assert.match(overview, /data-blueprint-target-tab/);
  assert.match(app, /franchiseArchitecture.*addEventListener/);
});
