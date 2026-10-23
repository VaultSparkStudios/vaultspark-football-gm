/**
 * skill-brief.mjs — Shared unified-brief library for every main Studio Ops skill
 *
 * One module · every skill (/start, /audit, /implement, /closeout, /go) renders
 * its founder-facing artifact through the same shape language:
 *   - 95-col canonical frame
 *   - Headline (one sentence)
 *   - Two top-line scores rendered as 10-cell bars
 *   - Items list with per-item dual score + 2-3 sentence voice-driven insight
 *   - Follow-ups + blockers + action gate
 *
 * Differences between skills are EXPRESSED THROUGH THE SCHEMA, not by writing
 * a new renderer. Brief flavors:
 *
 *   kind: 'closeout'    — Project Impact × Ecosystem Impact (post-work scoring)
 *   kind: 'audit'       — Priority × Innovation (pre-work scoring)
 *   kind: 'plan'        — Effort × Confidence (implementation sequencing)
 *   kind: 'orientation' — Context Readiness × Cross-Repo Urgency (start of session)
 *   kind: 'sprint'      — Round-Velocity × Round-Quality (mid-go progress)
 *
 * Each flavor declares its own metric labels in `metrics.{left,right}` and uses
 * the same renderer. Voice rules (2-3 sentence insights, no buzzwords) apply
 * uniformly.
 *
 * Spec: docs/SKILL_BRIEF_SPEC.md
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintInsight } from './insight-voice-linter.mjs';
import { BRIEF_REQUIRED_ITEM_FIELDS, BRIEF_REQUIRED_TOP_FIELDS } from './shared-policies.mjs';

const FRAME_WIDTH = 95;
const INDENT = '  ';
const ITEM_INDENT = '         ';

export const BRIEF_KINDS = {
  closeout:    { title: 'CLOSEOUT IMPACT BRIEF',  left: 'PROJECT IMPACT',     right: 'ECOSYSTEM IMPACT' },
  audit:       { title: 'AUDIT PRIORITY BRIEF',   left: 'COMBINED PRIORITY',  right: 'INNOVATION DENSITY' },
  plan:        { title: 'IMPLEMENT PLAN BRIEF',   left: 'EFFORT SHIPPABILITY',right: 'EXECUTION CONFIDENCE' },
  orientation: { title: 'SESSION ORIENTATION',    left: 'CONTEXT READINESS',  right: 'CROSS-REPO URGENCY' },
  sprint:      { title: 'GO SPRINT BRIEF',        left: 'ROUND VELOCITY',     right: 'ROUND QUALITY' },
};

const AXIS_PRI = { security: 0, speed: 1, tokenCost: 2, ai: 3, ux: 4, 'feature-depth': 5, integration: 6, organization: 7 };

function pad(s, w) { return s + ' '.repeat(Math.max(0, w - visualLen(s))); }
function visualLen(s) { return [...String(s)].length; }
function bar(score) {
  const half = Math.max(0, Math.min(100, score)) / 10;
  const full = Math.floor(half);
  const halfBlock = (half - full) >= 0.5 ? 1 : 0;
  const empty = 10 - full - halfBlock;
  return '█'.repeat(full) + '▌'.repeat(halfBlock) + '░'.repeat(empty);
}
function frameTop()    { return '╔' + '═'.repeat(FRAME_WIDTH - 2) + '╗'; }
function frameBottom() { return '╚' + '═'.repeat(FRAME_WIDTH - 2) + '╝'; }
function frameSep()    { return '╠' + '═'.repeat(FRAME_WIDTH - 2) + '╣'; }
function frameLine(content = '') {
  const inner = FRAME_WIDTH - 4;
  return '║  ' + pad(content, inner) + '  ║';
}
function wrap(text, width, indent) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else { cur = cur ? cur + ' ' + w : w; }
  }
  if (cur) lines.push(cur.trim());
  return lines.map(l => indent + l).join('\n');
}

/**
 * Validate a brief object against the shared schema.
 * Throws on missing required field; returns true otherwise.
 */
export function validate(brief) {
  const required = ['kind', ...BRIEF_REQUIRED_TOP_FIELDS];
  for (const k of required) if (brief[k] == null) throw new Error(`brief missing field: ${k}`);
  if (!BRIEF_KINDS[brief.kind]) throw new Error(`unknown kind: ${brief.kind}`);
  if (!Array.isArray(brief.items)) throw new Error('items must be array');
  if (brief.items.length === 0) throw new Error('items must contain at least one item');
  for (const it of brief.items) {
    for (const k of BRIEF_REQUIRED_ITEM_FIELDS) {
      if (it[k] == null) throw new Error(`item ${it.slug || it.id || '?'} missing ${k}`);
    }
    if (it.leftScore < 1 || it.leftScore > 10) throw new Error(`item ${it.slug} leftScore out of range (1-10)`);
    if (it.rightScore < 1 || it.rightScore > 10) throw new Error(`item ${it.slug} rightScore out of range (1-10)`);
    // S142 audit item 6 — mechanical voice-rule enforcement (SKILL_BRIEF_SPEC §Voice).
    const voice = lintInsight(it.insight);
    if (!voice.ok) throw new Error(`item ${it.slug} insight violates voice rules: ${voice.violations.join('; ')}`);
  }
  return true;
}

/**
 * Render the brief as the canonical 95-col ASCII frame.
 *
 * @param {object} brief — validated brief object
 * @param {object} [opts]
 * @param {string} [opts.actionGate] — final line, e.g. "ready to commit?"
 * @returns {string} the rendered text
 */
export function render(brief, opts = {}) {
  validate(brief);
  const kind = BRIEF_KINDS[brief.kind];
  const n = brief.items.length || 1;
  const sumLeft  = brief.items.reduce((s, x) => s + x.leftScore, 0);
  const sumRight = brief.items.reduce((s, x) => s + x.rightScore, 0);
  const leftScore  = Math.round((sumLeft / n) * 10);
  const rightScore = Math.round((sumRight / n) * 10);

  const out = [];
  out.push(frameTop());
  out.push(frameLine(`STUDIO OPS · ${kind.title}`));
  out.push(frameLine(`Session ${brief.session} · ${brief.date} · agent: ${brief.agent} · repo: ${brief.repo}`));
  out.push(frameSep());
  out.push(frameLine(''));
  out.push(frameLine('HEADLINE'));
  for (const hl of wrap(brief.headline, FRAME_WIDTH - 8, '  ').split('\n')) out.push(frameLine(hl));
  out.push(frameLine(''));
  out.push(frameLine(`${pad(kind.left, 18)} ${bar(leftScore)}  ${String(leftScore).padStart(3)}/100`));
  out.push(frameLine(`${pad(kind.right, 18)} ${bar(rightScore)}  ${String(rightScore).padStart(3)}/100`));
  if (brief.silDelta) {
    const d = brief.silDelta.current - brief.silDelta.previous;
    const sign = d > 0 ? '+' : '';
    out.push(frameLine(`${pad('SIL DELTA', 18)} ${brief.silDelta.previous} → ${brief.silDelta.current}  (${sign}${d})`));
  }
  if (brief.extraMetrics) {
    // S157 #10 — accept BOTH shapes: a plain object map ({context: '...'})
    // and an array of {label, value} rows. The array shape used to render
    // as "0  [object Object]" in the founder-facing header.
    const rows = Array.isArray(brief.extraMetrics)
      ? brief.extraMetrics.map(m => (m && typeof m === 'object') ? [m.label ?? '?', m.value ?? ''] : ['?', String(m)])
      : Object.entries(brief.extraMetrics);
    for (const [k, v] of rows) {
      out.push(frameLine(`${pad(String(k).toUpperCase(), 18)} ${v}`));
    }
  }
  out.push(frameLine(''));
  out.push(frameBottom());
  out.push('');

  // Items
  const sorted = [...brief.items].sort((a, b) => {
    const sa = a.leftScore * a.rightScore;
    const sb = b.leftScore * b.rightScore;
    if (sb !== sa) return sb - sa;
    return (AXIS_PRI[a.axis] ?? 9) - (AXIS_PRI[b.axis] ?? 9);
  });

  out.push(`${INDENT}${brief.itemsHeader || 'ITEMS'}${' '.repeat(Math.max(0, 60 - (brief.itemsHeader || 'ITEMS').length))}(sorted: left × right)`);
  out.push(`${INDENT}${'─'.repeat(FRAME_WIDTH - 4)}`);
  out.push('');

  const leftLabel = kind.left.split(' ')[0].slice(0, 4);
  const rightLabel = kind.right.split(' ')[0].slice(0, 4);

  for (const it of sorted) {
    const slugCol = pad(`[${it.id}]  ${it.slug}`, 64);
    const scoreCol = `${leftLabel} ${it.leftScore}  ·  ${rightLabel} ${it.rightScore}`;
    out.push(`${INDENT}${slugCol}${scoreCol}`);
    out.push(`${ITEM_INDENT}── ${it.axis} ${'─'.repeat(Math.max(0, 80 - it.axis.length))}`);
    out.push(wrap(it.insight, 84, ITEM_INDENT));
    out.push(`${ITEM_INDENT}→ ${it.evidence}`);
    out.push('');
  }

  out.push(`${INDENT}${'─'.repeat(FRAME_WIDTH - 4)}`);
  out.push('');

  if (brief.followUps) {
    out.push(`${INDENT}${brief.followUpsHeader || 'FOLLOW-UPS'}`);
    if (brief.followUps.length) for (const f of brief.followUps) out.push(`${INDENT}  • ${f}`);
    else out.push(`${INDENT}  (none)`);
    out.push('');
  }

  if (brief.blockers) {
    out.push(`${INDENT}BLOCKERS`);
    if (brief.blockers.length) for (const b of brief.blockers) out.push(`${INDENT}  • ${b}`);
    else out.push(`${INDENT}  (none)`);
    out.push('');
  }

  if (opts.actionGate) {
    out.push(`${INDENT}ACTION GATE`);
    out.push(`${INDENT}  ${opts.actionGate}`);
    out.push('');
  }

  return out.join('\n');
}

/**
 * Convenience: render + return both stdout text + canonical archive path.
 */
export function renderAndArchive(brief, opts = {}) {
  const text = render(brief, opts);
  const docsDir = join(process.cwd(), 'docs');
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
  const kindLabel = brief.kind.toUpperCase();
  const path = join(docsDir, `${kindLabel}_BRIEF_${brief.session}_${brief.date}.md`);
  const md = '```\n' + text + '\n```\n\n---\n\n*Generated by `scripts/lib/skill-brief.mjs` · spec: `docs/SKILL_BRIEF_SPEC.md`*\n';
  writeFileSync(path, md);
  return { text, path };
}
