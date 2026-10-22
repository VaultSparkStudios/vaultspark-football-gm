#!/usr/bin/env node
// Read-only by default. A binding identifies the session; it never proves completion.
// arc-profile.mjs profiles the repo; write-session-lock.mjs owns startup. This
// tool only binds an already-started session to a native goal identity.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from './lib/safe-spawn.mjs';
import { parseArgvStrict, helpGuard } from './lib/argv-guard.mjs';
import { goalKey, assessArcBinding, bindArcGoal } from './lib/arc-goal-binding.mjs';
helpGuard({ name: 'arc-goal-binding', usage: 'arc-goal-binding.mjs --goal-id <native threadId> --created-at <epoch seconds> [--project <root>] [--restart] [--apply]', outward: 'local ignored binding only; --restart requires an explicit founder restart and a newer session lock' });
try {
  const { flags, values, bad, dry } = parseArgvStrict({ boolFlags: ['--apply', '--restart'], valueFlags: ['--goal-id', '--created-at', '--project'] });
  if (bad.length) throw new Error('Unknown flags: ' + bad.join(', '));
  const project = fs.realpathSync(values['--project'] || path.resolve(import.meta.dirname, '..'));
  const goal = { threadId: values['--goal-id'], createdAt: Number(values['--created-at']) };
  const file = path.join(project, '.cache', 'arc-goals', goalKey(goal) + '.json');
  let receipt = null;
  try {
    receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (receipt === null) throw new Error('Existing binding contains null; investigate corrupt state');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let report = assessArcBinding(goal, receipt, project);
  const verifyAnchor = (binding) => {
    for (const args of [['cat-file', '-e', `${binding.startHead}^{commit}`], ['merge-base', '--is-ancestor', binding.startHead, 'HEAD']]) {
      const result = spawnSync('git', args, { cwd: project, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
      if (result.status !== 0) throw new Error('Arc goal anchor is absent, foreign, or outside current checkout history; investigate without borrowing completion');
    }
  };
  if (receipt) verifyAnchor(receipt);
  const restart = flags.has('--restart');
  if (restart) report = { ...report, action: 'restart-requested' };
  if (flags.has('--apply') && !dry && (receipt === null || restart)) {
    const previous = receipt;
    receipt = bindArcGoal(goal, fs.readFileSync(path.join(project, 'context', '.session-lock'), 'utf8'), project);
    verifyAnchor(receipt);
    if (previous) {
      if (receipt.session <= previous.session || Date.parse(receipt.sessionStart) <= Date.parse(previous.sessionStart)) throw new Error('Explicit restart requires a newer session lock; refusing to reuse the old session');
      receipt.history = [...(previous.history || []), { session: previous.session, startHead: previous.startHead, sessionStart: previous.sessionStart }];
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: previous ? 'w' : 'wx' });
    report = { ...assessArcBinding(goal, receipt, project), newlyBound: true, restarted: Boolean(previous) };
  }
  console.log(JSON.stringify(report));
} catch (error) { console.error(error.message); process.exitCode = 2; }
