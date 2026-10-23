#!/usr/bin/env node
/**
 * Selected candidate admission composes lib/audit-sidecar.mjs and lib/skill-brief.mjs.
 * CANON-039 reuse review: plan-check-evidence.mjs schedules named static probes and
 * proof reuse; check-closeout-preflight.mjs checks closeout file presence/JSON syntax.
 * Neither validates this explicit audit/plan/brief bundle or its exact identities.
 * blocker-preflight.mjs owns escalation attempts; recovery-integrity-preflight.mjs
 * checks interrupted files, and start-recovery-preflight.mjs detects cut-off sessions.
 * converge-preflight.mjs plans repo dependency order; org-migration-preflight.mjs
 * checks organization-transfer readiness. Neither is candidate admission.
 * cloudflare-email-plan.mjs owns email routing; plan-cron-migration.mjs owns timer
 * migration. plan-next-session.mjs forecasts agendas; render-session-intent-plan.mjs
 * derives intent recipes; render-cross-repo-change-plan.mjs renders portfolio changes.
 * mark-plan-mode.mjs and verify-plan-mode.mjs track model planning-mode evidence.
 * Those tools retain their own domains; this command produces no plan or artifact.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAuditPlanPreflight } from './lib/audit-plan-preflight.mjs';

export function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const names = new Map([['--root', 'root'], ['--audit', 'audit'], ['--plan', 'plan'], ['--audit-brief', 'auditBrief'], ['--plan-brief', 'planBrief']]);
  const parsed = {};
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (seen.has(flag) || (flag !== '--json' && !names.has(flag))) return { error: 'invalid-arguments' };
    seen.add(flag);
    if (flag === '--json') { parsed.json = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith('-')) return { error: 'invalid-arguments' };
    parsed[names.get(flag)] = value;
  }
  if ([...names.values()].some((name) => !parsed[name])) return { error: 'required-arguments-missing' };
  return parsed;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/check-audit-plan-preflight.mjs --root <repo> --audit <json> --plan <md> --audit-brief <json> --plan-brief <json> [--json]\nRead-only admission of a pending audit candidate; all artifacts are required.');
    return 0;
  }
  const result = options.error ? { ok: false, errors: [{ artifact: 'arguments', check: options.error }] } : checkAuditPlanPreflight(options);
  if (options.json || args.includes('--json')) console.log(JSON.stringify(result));
  else console.log(result.ok ? 'audit-plan-preflight: PASS' : `audit-plan-preflight: FAIL\n${result.errors.map(({ artifact, check, message }) => `  ${artifact}: ${check}${message ? ` — ${message}` : ''}`).join('\n')}`);
  return result.ok ? 0 : options.error ? 2 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
