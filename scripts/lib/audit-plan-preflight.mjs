import fs from 'node:fs';
import path from 'node:path';
import { validateAuditContract, validateAuditWriteContract, validateAuditPremiseContract } from './audit-sidecar.mjs';
import { parseSessionId } from './audit-selector.mjs';
import { validate as validateBrief, render as renderBrief } from './skill-brief.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`); };
const sameSlugs = (actual, expected) => actual.every((slug) => typeof slug === 'string') && expected.every((slug) => typeof slug === 'string') && actual.length === expected.length && new Set(actual).size === actual.length && [...actual].sort().every((slug, i) => slug === [...expected].sort()[i]);
const explanations = {
  contract: 'Audit executable schema or readiness assessment is invalid; readiness rows require status and supported evidence.',
  'write-contract': 'Candidate session, nine-axis coverage or pending admission evidence is invalid.',
  'premise-contract': 'Typed premise schema is invalid or volatile.',
  schema: 'Canonical skill brief schema, scores, insight or rendering is invalid.',
  'source-header-required': 'The leading plan comment or Markdown title metadata must contain exactly one audit source.',
  'source-mismatch': 'Plan source must name the explicit selected audit inside docs.',
  'session-mismatch': 'Artifact session must equal the selected audit session.',
  'pending-candidate-required': 'Admission requires a nonempty pending plan; historical shipped audits use existing readers.',
};

function planHeader(plan) {
  const comment = plan.match(/^\uFEFF?\s*<!--([\s\S]*?)-->/);
  if (comment) return comment[1];
  const lines = plan.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/);
  if (!/^#\s+\S/.test(lines[0] ?? '')) return '';
  const header = [lines[0]];
  for (const line of lines.slice(1)) {
    if (!line.trim() || /^\s*(?:Audit\s+)?source:\s*/i.test(line) || /^\s*Session\s+\d+\s*$/i.test(line)) header.push(line);
    else break;
  }
  return header.join('\n');
}

/** Read-only admission of a pending candidate. This is not a historical closeout gate.
 * Diagnostics contain fixed codes only: malformed artifact contents never become logs.
 */
export function checkAuditPlanPreflight({ root, audit: auditFile, plan: planFile, auditBrief: auditBriefFile, planBrief: planBriefFile } = {}) {
  const errors = [];
  const fail = (artifact, check) => errors.push({ artifact, check, message: explanations[check] ?? `Artifact failed ${check.replaceAll('-', ' ')} validation.` });
  let base;
  try { base = fs.realpathSync(root); if (!fs.statSync(base).isDirectory()) throw new Error(); }
  catch { return { ok: false, errors: [{ artifact: 'root', check: 'unreadable-directory' }] }; }
  const paths = {};
  const read = (label, value, json = true) => {
    try {
      if (typeof value !== 'string' || !value) throw new Error();
      const lexical = path.resolve(base, value);
      if (!inside(base, lexical)) { fail(label, 'path-outside-root'); return; }
      const real = fs.realpathSync(lexical);
      if (!inside(base, real)) { fail(label, 'path-outside-root'); return; }
      const stat = fs.statSync(real);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error();
      paths[label] = { lexical, real };
      const bytes = fs.readFileSync(real, 'utf8');
      if (!json) return bytes;
      const parsed = JSON.parse(bytes);
      if (!object(parsed)) { fail(label, 'object-required'); return; }
      return parsed;
    } catch { fail(label, 'unreadable-or-malformed'); }
  };
  const audit = read('audit', auditFile);
  const plan = read('plan', planFile, false);
  const briefs = { 'audit-brief': read('audit-brief', auditBriefFile), 'plan-brief': read('plan-brief', planBriefFile) };
  if (errors.length) return { ok: false, errors };
  const validate = (label, check, fn) => {
    try { const result = fn(); if (Array.isArray(result) && result.length) fail(label, check); }
    catch { fail(label, `${check}-exception`); }
  };
  validate('audit', 'contract', () => validateAuditContract(audit));
  // The write contract reconciles pending admission, not the historical shipped matrix.
  if (!Array.isArray(audit.items) || !audit.items.length || audit.items.some((item) => !object(item) || item.status !== 'pending') || audit.kind === 'routine') {
    fail('audit', 'pending-candidate-required');
  } else {
    validate('audit', 'write-contract', () => validateAuditWriteContract(audit));
  }
  validate('audit', 'premise-contract', () => validateAuditPremiseContract(audit, { includeVolatile: true }));
  const session = parseSessionId(audit.session);
  if (session.state !== 'parsed') fail('audit', 'session-required');

  // Established comment and Markdown title metadata are headers; body prose is not.
  const header = planHeader(plan);
  const sources = [...header.matchAll(/\bsource:\s*([^\s·]+)/gi)];
  const sessions = [...header.matchAll(/\bSession\s+(\d+)\b/gi)];
  if (sources.length !== 1) fail('plan', 'source-header-required');
  else {
    const source = sources[0][1];
    const expected = path.relative(base, paths.audit.lexical).split(path.sep).join('/');
    if (!/^docs\/AUDIT_[^/\\]+\.json$/.test(source) || source !== expected) fail('plan', 'source-mismatch');
    else {
      try { if (fs.realpathSync(path.resolve(base, source)) !== paths.audit.real) fail('plan', 'source-mismatch'); }
      catch { fail('plan', 'source-mismatch'); }
    }
  }
  if (sessions.length !== 1 || session.state !== 'parsed' || Number(sessions[0][1]) !== session.value) fail('plan', 'session-mismatch');

  const slugs = Array.isArray(audit.items) ? audit.items.map((item) => item?.slug) : [];
  for (const [label, brief] of Object.entries(briefs)) {
    const kind = label === 'audit-brief' ? 'audit' : 'plan';
    validate(label, 'schema', () => { validateBrief(brief); renderBrief(brief); });
    if (['kind', 'date', 'agent', 'repo', 'headline'].some((key) => typeof brief[key] !== 'string' || !brief[key].trim())
      || (Array.isArray(brief.items) && brief.items.some((item) => !object(item) || ['slug', 'title', 'axis', 'insight', 'evidence'].some((key) => typeof item[key] !== 'string' || !item[key].trim())))) fail(label, 'field-types');
    if (brief.kind !== kind) fail(label, 'kind-mismatch');
    const briefSession = parseSessionId(brief.session);
    if (briefSession.state !== 'parsed' || session.state !== 'parsed' || briefSession.value !== session.value) fail(label, 'session-mismatch');
    if (brief.repo !== audit.project?.slug) fail(label, 'repo-mismatch');
    if (!Array.isArray(brief.items) || !sameSlugs(brief.items.map((item) => item?.slug), slugs)) fail(label, 'items-mismatch');
    // Shared validation uses comparison operators; enforce numeric JSON scores too.
    if (Array.isArray(brief.items) && brief.items.some((item) => !object(item) || !Number.isFinite(item.leftScore) || !Number.isFinite(item.rightScore))) fail(label, 'numeric-scores-required');
  }
  return { ok: errors.length === 0, errors };
}
