import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { MODELS, contextWindowForAgent, priceForModel, tokenUsageCost } from "../scripts/lib/model-router.mjs";
import { recommendContext } from "../scripts/lib/context-recommendation.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));
const meter = join(root, "scripts", "context-meter.mjs");

test("model router is the exact context and notional-price authority", () => {
  assert.equal(contextWindowForAgent("codex"), 1_000_000);
  assert.deepEqual(priceForModel(MODELS.opus), { input: 15, cacheWrite: 18.75, cacheRead: 1.5, output: 75 });
  assert.deepEqual(priceForModel("claude-opus-future"), priceForModel(MODELS.opus));
  assert.equal(tokenUsageCost({ input: 1_000_000 }, MODELS.sonnet), 3);
  assert.equal(tokenUsageCost({ output_tokens: 1_000_000 }, MODELS.haiku), 5);
});

test("context recommendation preserves canonical boundaries and Sonnet guardrail", () => {
  const base = { warnAt: 0.75, continueCostPerTurn: 1000, breakEvenTurns: 2, remaining: 500_000 };
  assert.equal(recommendContext({ ...base, pctUsed: 0.50 }).recommendation, "CONTINUE");
  assert.equal(recommendContext({ ...base, pctUsed: 0.75 }).recommendation, "CONSIDER_CLOSEOUT");
  assert.equal(recommendContext({ ...base, pctUsed: 0.95 }).recommendation, "CLOSEOUT");
  assert.equal(recommendContext({ ...base, pctUsed: 0.30, isSonnetExecTier: true, sonnetBreachPct: 0.80 }).recommendation, "CONSIDER_CLOSEOUT");
  assert.equal(recommendContext({ ...base, pctUsed: 0.30, compactImminent: true, turnsToCompact: 2 }).recommendation, "WARN_COMPACT_SOON");
});

test("context meter process exits match its emitted verdicts", () => {
  const fresh = mkdtempSync(join(tmpdir(), "fa-meter-fresh-"));
  mkdirSync(join(fresh, "context"), { recursive: true });
  writeFileSync(join(fresh, "context", ".session-lock"), "agent: codex\ncontext_limit: 1000000\nsession_start: 2026-07-28T00:00:00.000Z\n");
  const continueResult = spawnSync(process.execPath, [meter, "--json"], { cwd: fresh, encoding: "utf8" });
  assert.equal(continueResult.status, 0, continueResult.stderr);
  assert.equal(JSON.parse(continueResult.stdout).recommendation, "CONTINUE");

  const exhausted = mkdtempSync(join(tmpdir(), "fa-meter-exhausted-"));
  mkdirSync(join(exhausted, "context"), { recursive: true });
  mkdirSync(join(exhausted, "docs"), { recursive: true });
  writeFileSync(join(exhausted, "context", ".session-lock"), "agent: other\ncontext_limit: 1000\nsession_start: 2026-07-28T00:00:00.000Z\n");
  writeFileSync(join(exhausted, "docs", "STARTUP_BRIEF.md"), "x".repeat(20_000));
  const closeoutResult = spawnSync(process.execPath, [meter, "--json"], { cwd: exhausted, encoding: "utf8" });
  assert.equal(closeoutResult.status, 3, closeoutResult.stderr);
  assert.equal(JSON.parse(closeoutResult.stdout).recommendation, "CLOSEOUT");
});

test("context meter contains no private model window or price table", () => {
  const source = readFileSync(meter, "utf8");
  assert.doesNotMatch(source, /const PRICING\b|PRICING_BY_ID|function contextWindowForAgent/);
  assert.match(source, /tokenUsageCost/);
  assert.match(source, /Max Plan is flat-rate/);
});
