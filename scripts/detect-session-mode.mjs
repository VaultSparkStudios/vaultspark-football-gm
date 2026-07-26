#!/usr/bin/env node
/**
 * detect-session-mode.mjs — Builder↔Founder session-mode classifier (v3.1)
 *
 * Heuristic classifier: inspects Session Intent + TASK_BOARD scope + recent
 * user messages (if passed via --messages) and classifies the current session
 * as BUILDER (this-project work) or FOUNDER (cross-project / portfolio).
 *
 * Writes the classification to `context/PROJECT_STATUS.json` → `sessionMode`.
 * Emits a one-line explanation when the classification would FLIP the current mode.
 *
 * Start.md / closeout.md run this after logging Session Intent; mid-session
 * invocations re-check when the user gives a new directive.
 *
 * Usage:
 *   node scripts/detect-session-mode.mjs
 *   node scripts/detect-session-mode.mjs --json
 *   node scripts/detect-session-mode.mjs --explain
 *   node scripts/detect-session-mode.mjs --messages "give me a portfolio review"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateProjectStatus } from './lib/write-project-status.mjs';
import { classifyIntent, classifySessionScope } from './classify-session-intent.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATUS = path.join(ROOT, 'context', 'PROJECT_STATUS.json');
const HANDOFF = path.join(ROOT, 'context', 'LATEST_HANDOFF.md');
const TASKBOARD = path.join(ROOT, 'context', 'TASK_BOARD.md');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const explain = args.includes('--explain');
const msgIdx = args.indexOf('--messages');
const userMessages = msgIdx >= 0 ? args.slice(msgIdx + 1).join(' ') : '';

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }

const status = readJson(STATUS, {});
const handoff = readText(HANDOFF);
const taskboard = readText(TASKBOARD);
const currentMode = status.sessionMode || 'builder';
const scopeClassification = classifySessionScope({ taskboard, handoff, userMessages, currentMode });
const {
  founderScore: lexicalFounderScore,
  builderScore: lexicalBuilderScore,
  matchedFounder,
  matchedBuilder,
  crossProjectRefs,
  portfolioCommands
} = scopeClassification;

// Ledger-derived signal (v2): which Studio Ops scripts have consumed tokens
// this session? Portfolio-scope scripts (rescore-ignis, studio-conductor,
// compile-automation-queue, generate-genius-list --portfolio, propagate-*,
// studio-pulse) skew FOUNDER. Per-project scripts skew BUILDER.
const PORTFOLIO_SCRIPTS = new Set([
  'rescore-ignis', 'studio-conductor', 'compile-automation-queue',
  'studio-pulse', 'propagate-protocol-scripts', 'propagate-templates',
  'generate-genius-list:portfolio', 'render-launch-momentum', 'weekly-digest',
  'build-memory-graph', 'render-feedback-loop-dashboard', 'render-rollout-scoreboard',
]);
let ledgerPortfolioTokens = 0;
let ledgerBuilderTokens = 0;
let ledgerScripts = [];
try {
  const lockPath = path.join(ROOT, 'context/.session-lock');
  let sessionStart = Date.now() - 86_400_000;
  if (fs.existsSync(lockPath)) {
    const m = fs.readFileSync(lockPath, 'utf8').match(/session_start:\s*(\S+)/);
    if (m) sessionStart = new Date(m[1]).getTime();
  }
  const ledgerPath = path.join(ROOT, 'docs/cache-ledger.ndjson');
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf8').split('\n')) {
      if (!line) continue;
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() < sessionStart) continue;
      const tok = (e.input || 0) + (e.output || 0) + (e.cache_read || 0) + (e.cache_create || 0);
      ledgerScripts.push(e.script);
      if (PORTFOLIO_SCRIPTS.has(e.script)) ledgerPortfolioTokens += tok;
      else ledgerBuilderTokens += tok;
    }
  }
} catch { /* ledger optional */ }
const ledgerFounderSignal = ledgerPortfolioTokens > ledgerBuilderTokens ? 2 : 0;
const ledgerBuilderSignal = ledgerBuilderTokens > 3 * ledgerPortfolioTokens && ledgerBuilderTokens > 2000 ? 2 : 0;

const founderScore = lexicalFounderScore + ledgerFounderSignal;
const builderScore = lexicalBuilderScore + ledgerBuilderSignal;

const recommended = founderScore > builderScore + 2 ? 'founder' : 'builder';
const shouldFlip = recommended !== currentMode;

// Emit a model recommendation based on (mode, current tier).
// Reads portfolio/MODEL_ROUTING.json via the Studio Ops repo root (this script
// lives there) — any child repo running it locally falls back to 'sonnet'.
let recommendedModel = null;
let currentTier = status.modelTier || null;
let currentTierModel = status.modelTierDefault || null;
let planModeSlash = status.modelPlanModeSlash || null;
let planModeActive = !!status.modelPlanMode;
const lockText = readText(path.join(ROOT, 'context', '.session-lock'));
const sessionAgent = lockText.match(/^agent:\s*(\S+)/mi)?.[1] || 'unknown';
const claudeModelSurface = sessionAgent === 'claude-code';
try {
  const routingPath = path.join(ROOT, 'portfolio', 'MODEL_ROUTING.json');
  if (claudeModelSurface && fs.existsSync(routingPath)) {
    const routing = JSON.parse(fs.readFileSync(routingPath, 'utf8'));
    if (recommended === 'founder') {
      recommendedModel = routing.modeOverrides?.founderMode
        ? routing.tiers[routing.modeOverrides.founderMode]?.model
        : 'opus';
    } else {
      recommendedModel = currentTierModel
        || routing.tiers?.T1_sonnet?.model
        || 'sonnet';
    }
  }
} catch { /* best effort */ }
const modelShiftSuggested = claudeModelSurface && currentTierModel && recommendedModel && recommendedModel !== currentTierModel;

// ── Session-mode hints + intent classification (S63e) ──────────────────────
let hint = null;
let hintSlug = null;
try {
  const hintsPath = path.join(ROOT, 'portfolio', 'SESSION_MODE_HINTS.json');
  if (fs.existsSync(hintsPath)) {
    const hints = JSON.parse(fs.readFileSync(hintsPath, 'utf8'));
    // Match current repo slug via PROJECT_STATUS.slug or basename.
    const slug = status.slug || path.basename(ROOT);
    hintSlug = slug;
    hint = hints.bySlug?.[slug] || null;
  }
} catch { /* best-effort */ }

let intentClassification = null;
try { intentClassification = classifyIntent(ROOT); } catch { /* non-fatal — defaults apply */ }

// Auto-de-escalation: once plan-phase recorded + intent=execution + hint allows,
// recommend dropping to sonnet mid-session.
let autoDeescalateSuggested = false;
if (claudeModelSurface && hint?.autoDeescalate && intentClassification?.intent === 'execution' && currentTierModel === 'opus') {
  // Was plan-mode active earlier this session?
  const planDetectedActive = /plan_mode_detected:\s*active/i.test(lockText) || !!status.planModeLastActivatedAt;
  if (planDetectedActive) autoDeescalateSuggested = true;
}

// Apply intent override when hint's preferredIntent differs from classifier,
// using hint as strong signal + classifier as observed reality. If the two
// agree, boost confidence.
let effectiveIntent = intentClassification?.intent || null;
if (hint?.preferredIntent && (!effectiveIntent || (intentClassification?.scores?.[hint.preferredIntent] || 0) > 0)) {
  effectiveIntent = hint.preferredIntent;
}
const intentModel = claudeModelSurface ? intentClassification?.intentModel || null : null;

// Sonnet down-routing discipline (S142 — usage-split training). The Max plan is
// flat-rate, so the lever for Opus-heavy usage is NOT dollars — it is shared
// rate-limit headroom (Opus burns the weekly limit ~5× faster per token) +
// latency. Recommend Sonnet for routine execution work in builder mode even when
// plan-mode was never toggled — generalizes autoDeescalate to the common case.
const downRouteSuggested = recommended === 'builder'
  && claudeModelSurface
  && currentTierModel === 'opus'
  && effectiveIntent === 'execution'
  && !autoDeescalateSuggested; // avoid double-printing with the plan-mode path

const result = {
  currentMode,
  agent: sessionAgent,
  recommended,
  shouldFlip,
  founderScore,
  builderScore,
  matchedFounder: [...new Set(matchedFounder)].slice(0, 8),
  matchedBuilder: [...new Set(matchedBuilder)].slice(0, 8),
  crossProjectRefs,
  portfolioCommands,
  scopeSourceLedger: scopeClassification.sourceLedger,
  ledgerScripts: [...new Set(ledgerScripts)],
  ledgerPortfolioTokens,
  ledgerBuilderTokens,
  ledgerFounderSignal,
  ledgerBuilderSignal,
  currentTier,
  currentTierModel,
  recommendedModel,
  modelShiftSuggested,
  planModeActive,
  planModeSlash,
  hintSlug,
  hint,
  intentClassification,
  effectiveIntent,
  intentModel,
  autoDeescalateSuggested,
  downRouteSuggested,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (shouldFlip) {
  console.log(`⚡ Mode shift detected: ${currentMode.toUpperCase()} → ${recommended.toUpperCase()}`);
  console.log(`   Founder score: ${founderScore}  ·  Builder score: ${builderScore}`);
  if (matchedFounder.length) console.log(`   Founder signals: ${matchedFounder.slice(0, 4).join(', ')}`);
  // Persist the flip
  updateProjectStatus(ROOT, (current) => ({
    ...current,
    sessionMode: recommended,
    sessionModeAutoShiftedAt: new Date().toISOString()
  }));
  console.log(`   PROJECT_STATUS.json updated.`);
} else {
  console.log(`= Mode stable: ${currentMode.toUpperCase()}  (founder ${founderScore} / builder ${builderScore})`);
}

if (modelShiftSuggested) {
  console.log(`⚡ Model shift recommended: ${currentTierModel} → ${recommendedModel}  (mode: ${recommended})`);
  console.log(`   Run /model ${recommendedModel} to apply, or keep current to continue.`);
}

if (claudeModelSurface && planModeActive && planModeSlash && recommended !== 'founder') {
  console.log(`ℹ Plan-mode reminder: this repo is ${currentTier} — run ${planModeSlash} once this session to activate Opus-plans-Sonnet-executes.`);
  console.log(`   (settings.json can only pin concrete models; plan-mode is a runtime slash-command toggle.)`);
  // Emit the literal slash string on its own line so Claude Code re-reads it
  // as an in-session instruction (S63e #2 auto-emit).
  console.log('');
  console.log(planModeSlash);
  console.log('');
  console.log(`   (After running the above, stamp it with: node scripts/mark-plan-mode.mjs)`);
}

if (effectiveIntent) {
  const intentTag = intentClassification?.intent === effectiveIntent ? '' : ' (hint-overridden)';
  console.log(claudeModelSurface
    ? `◆ Session intent: ${effectiveIntent.toUpperCase()}${intentTag} · prefers ${intentModel || '?'}`
    : `◆ Session intent: ${effectiveIntent.toUpperCase()}${intentTag} · agent ${sessionAgent} · current model preserved`);
  if (hint?.note) console.log(`  hint: ${hint.note}`);
}

if (autoDeescalateSuggested) {
  console.log(`⚡ Auto-de-escalate: plan phase complete + execution intent detected.`);
  console.log(`   Consider /model sonnet for the remaining implementation work (hint: ${hintSlug}).`);
}

if (downRouteSuggested) {
  console.log(`⚡ Down-route opportunity: builder-mode execution work on Opus.`);
  console.log(`   Consider /model sonnet — on the flat Max plan this costs $0 but reclaims`);
  console.log(`   shared rate-limit headroom (Opus burns the weekly limit ~5× faster).`);
  console.log(`   Keep Opus only for genuine deep reasoning / cross-file architecture.`);
}

if (explain) {
  console.log('\nExplanation:');
  console.log(`  • Founder phrases matched: ${matchedFounder.join(', ') || '(none)'}`);
  console.log(`  • Builder phrases matched: ${matchedBuilder.join(', ') || '(none)'}`);
  console.log(`  • Cross-project refs: ${crossProjectRefs}`);
  console.log(`  • Portfolio commands: ${portfolioCommands}`);
  console.log(`  • Scope source: latest intent + ${scopeClassification.sourceLedger.tasks.length} current open task(s)`);
  console.log(`  • Agent surface: ${sessionAgent}`);
  if (currentTier) console.log(`  • Current tier: ${currentTier} (${currentTierModel}) · recommended: ${recommendedModel}`);
  if (ledgerScripts.length) {
    console.log(`  • Ledger scripts this session: ${[...new Set(ledgerScripts)].join(', ')}`);
    console.log(`  • Ledger tokens  — portfolio-scope: ${ledgerPortfolioTokens.toLocaleString()}  builder-scope: ${ledgerBuilderTokens.toLocaleString()}`);
  }
}
