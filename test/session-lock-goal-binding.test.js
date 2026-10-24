import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../scripts/lib/safe-spawn.mjs';
import { bindArcGoal } from '../scripts/lib/arc-goal-binding.mjs';

test('the real startup writer binds a goal and preserves its anchor until forced rotation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-lock-binding-'));
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'context'));
    // The real writer and its runtime closure; no project data.
    for (const file of ['write-session-lock.mjs', 'lib/safe-spawn.mjs', 'lib/git-window-guard.mjs', 'lib/fast-node.mjs', 'lib/session-identity.mjs']) {
      fs.copyFileSync(new URL(`../scripts/${file}`, import.meta.url), path.join(root, 'scripts', file));
    }
    fs.writeFileSync(path.join(root, 'context/PROJECT_STATUS.json'), '{"currentSession":120}');
    run('git', ['init', '-q']);
    run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-qm', 'initial']);
    const firstHead = run('git', ['rev-parse', 'HEAD']);
    const goal = { threadId: 'fixture-goal', createdAt: Math.floor(Date.now() / 1000) };
    const write = (...flags) => run(process.execPath, ['scripts/write-session-lock.mjs', '--agent', 'codex', '--trigger', 'founder-mission', ...flags]);
    const bind = () => bindArcGoal(goal, fs.readFileSync(path.join(root, 'context/.session-lock'), 'utf8'), root);
    write();
    const first = bind();
    assert.equal(first.session, 121);
    assert.equal(first.startHead, firstHead);
    run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-qm', 'later']);
    write();
    assert.equal(bind().startHead, firstHead);
    assert.equal(bind().sessionStart, first.sessionStart);
    write('--force');
    assert.equal(bind().startHead, run('git', ['rev-parse', 'HEAD']));
    fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
    const failed = spawnSync(process.execPath, ['scripts/write-session-lock.mjs', '--agent', 'codex', '--force'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Cannot establish the session start commit/);
  } finally {
    // The target is the exact directory allocated by mkdtemp above.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
