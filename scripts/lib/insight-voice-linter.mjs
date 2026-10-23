/**
 * insight-voice-linter.mjs — mechanical enforcement of the SKILL_BRIEF_SPEC
 * voice rules (S141 brainstorm #5 / S142 audit item 6).
 *
 * The voice rule in docs/SKILL_BRIEF_SPEC.md was aspirational — nothing enforced
 * it, so buzzwords crept into brief insights. This makes it a hard check wired
 * into skill-brief.mjs validate(), so every brief kind and every agent gets the
 * same gate.
 *
 * Source of truth: docs/SKILL_BRIEF_SPEC.md §"Voice rules for insight".
 */

// Whole-word match, case-insensitive. "ecosystem-wide" is the banned phrase;
// "ecosystem" alone is allowed (it is legitimate Studio vocabulary).
const FORBIDDEN_WORDS = [
  'leveraged', 'leverages', 'leverage',
  'best-in-class',
  'stakeholder', 'stakeholders',
  'synergies', 'synergy',
  'ecosystem-wide',
  'robust',
  'seamless', 'seamlessly',
];

// Forbidden openers: "This implementation/feature/change/refactor..."
const FORBIDDEN_OPENER = /^\s*this\s+(implementation|feature|change|refactor|update|fix|pr|commit)\b/i;

/**
 * Lint one insight string.
 * @param {string} text
 * @returns {{ok: boolean, violations: string[]}}
 */
export function lintInsight(text) {
  const violations = [];
  const s = String(text ?? '');

  for (const word of FORBIDDEN_WORDS) {
    // Escape regex specials in the word, then word-boundary match.
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\w-])${esc}(?![\\w-])`, 'i');
    if (re.test(s)) violations.push(`forbidden word: "${word}"`);
  }

  if (FORBIDDEN_OPENER.test(s)) violations.push('forbidden opener: "This implementation/feature/change/..."');

  // 2–3 sentences max. Count sentence-terminators; tolerate ellipsis + abbreviations loosely.
  const sentences = s.split(/[.!?]+(?:\s|$)/).filter(x => x.trim().length > 0);
  if (sentences.length > 4) violations.push(`too long: ${sentences.length} sentences (max 3)`);

  return { ok: violations.length === 0, violations };
}

/** Throw a descriptive error if an insight violates voice rules. */
export function assertInsightVoice(text, label = 'insight') {
  const { ok, violations } = lintInsight(text);
  if (!ok) throw new Error(`${label} violates SKILL_BRIEF_SPEC voice rules: ${violations.join('; ')}`);
}

export { FORBIDDEN_WORDS };
